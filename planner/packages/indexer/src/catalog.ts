/**
 * Building the part library.
 *
 * Walks the family directories named in data/families.json, and for each part
 * writes a wall-oriented compressed glTF, a thumbnail, and one row of
 * index.json. Nothing it produces is committed — CI runs this on every build.
 */

import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Orientation, OrientedPlacement } from '@ddd-planner/core'
import {
  type AxisMap,
  type Bounds,
  type PlacementRule,
  COLUMN_PITCH_MM,
  applyMatrix,
  parsePartName,
  placeBounds,
  turnedAboutZ,
} from '@ddd-planner/core'
import {
  type FamilyRule,
  PLANNER_ROOT,
  REPO_ROOT,
  type Span,
  centerpieceFrontFaceY,
  tabSpanY,
  loadFamilies,
  loadOverrides,
  resolvedFamilies,
} from './assembly'
import { meshToGlb } from './gltf'
import { readStlFile } from './stl'
import { renderWebp } from './thumbnail'

export const DEFAULT_OUT_DIR = join(PLANNER_ROOT, 'packages', 'app', 'public', 'parts')

/** Stable, URL-safe id. Filenames carry spaces, brackets and plus signs. */
function slug(familyId: string, filename: string): string {
  return `${familyId}-${filename}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface PartRow {
  id: string
  family: string
  /**
   * Which side of the mounting grammar this part is, from its family's
   * archetype rather than its folder — `Sidepieces/Retainers` is a
   * centerpiece and a Quickhook is a sidepiece, so the path would lie.
   */
  role: 'sidepiece' | 'centerpiece'
  file: string
  name: string
  base: string
  variant: string | null
  h: number | null
  w: number | null
  searchKey: string
  /** Triangles in the source STL. */
  triangles: number
  /** Triangles in the glTF that ships — fewer when the mesh was simplified. */
  renderedTriangles: number
  vertices: number
  volumeMm3: number
  /** Set when the part disagreed with its family and was corrected — see overrides.json. */
  correction?: string
  /** Size of the source STL, so the app can estimate a download before starting. */
  sourceBytes: number
  sizeMm: { x: number; y: number; z: number }
  model: string
  thumb: string
  fasteners: { id: string; quantity: number }[]
  /** Overrides for orientations where those fasteners do not apply. */
  fastenersByOrientation?: Partial<Record<Orientation, { id: string; quantity: number }[]>>
  /** False when the planner cannot position this part meaningfully. */
  supported: boolean
  unsupportedReason?: string
  /**
   * Every way this part can be mounted, resolved from the family rules so
   * the app never reads families.json. Almost every part has one entry.
   */
  orientations: Partial<Record<Orientation, OrientedPlacement>>
}

/**
 * Collapse the family rule plus this part's measured bounds into the single
 * translation the app needs.
 *
 * Everything that varies per part — thickness, depth, width — is taken from
 * the mesh rather than from a formula. A declared formula is an assertion the
 * test checks; it is not an input here. That is what lets a family with no
 * single rule (U brackets, Tool hooks) still place correctly.
 */
function placementFor(
  family: Record<string, unknown>,
  parsed: { h: number | null; w: number | null; variant: string | null },
  placed: { widthMm: number; depthMm: number; tabY?: Span | null },
): PlacementRule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rule = family as any

  if (family.kind === 'sidepiece') {
    const half = rule.anchor.tang.widthMm / 2
    const variant = (parsed.variant ?? 'plain') as string
    const extends_ = rule.anchor.bodyExtendsFromSlot[variant] ?? rule.anchor.bodyExtendsFromSlot.plain

    return {
      occupiesColumns: 1,
      offsetFromSlotXMm: extends_ === '+x' ? -half : half - placed.widthMm,
      // How far it projects is its own business; the tang depth is shared.
      frontFaceYMm: -(placed.depthMm - rule.anchor.tang.depthMm),
      bottomBelowSlotCenterMm: rule.anchor.bottomBelowSlotCenterMm,
      matesByHeight: true,
    }
  }

  return {
    occupiesColumns: columnsFor(parsed),
    offsetFromSlotXMm: offsetFor(parsed, placed.widthMm),
    frontFaceYMm: centerpieceFrontFaceY(family as FamilyRule, placed.depthMm, placed.tabY),
    bottomBelowSlotCenterMm: rule.anchor.bottomBelowSlotCenterMm,
    matesByHeight: true,
  }
}

const columnsFor = (parsed: { w: number | null }) => Math.max(1, Math.round(parsed.w ?? 1))

const offsetFor = (parsed: { w: number | null }, widthMm: number) =>
  (COLUMN_PITCH_MM * columnsFor(parsed) - widthMm) / 2

/**
 * How far a flat-shipping plate turns to become a shelf.
 *
 * +90 rather than -90 because the asset it turns is itself turned: the
 * centerpiece map puts the plate's front face out of the wall, and tipping
 * *that* forward would show the shelf its own underside. The two numbers are
 * the same quarter turn seen from either side of a 180 - change one and the
 * other has to move with it.
 *
 * What has to stay true is the face carrying the ribs ending up underneath,
 * because that is the face the arm pocket holds.
 */
export const SHELF_TURN_DEG = 90

interface ShelfSpec {
  readonly bandFloorMm: number
  readonly bandFirstOffsetMm: number
}

/**
 * Every way a part can be mounted, in the order the family declares them.
 *
 * A family says nothing and gets `flat`, which is what almost all of them
 * are. The flat-plate centerpieces say `["flat", "shelf"]` because the same
 * plate genuinely does both and only the person building the wall knows
 * which. Gridfinity says `["shelf"]` alone.
 */
function orientationsFor(
  family: Record<string, unknown>,
  parsed: { h: number | null; w: number | null; variant: string | null },
  placed: { widthMm: number; depthMm: number; heightMm: number; tabY: Span | null },
  armSocket: ArmSocket,
): Partial<Record<Orientation, OrientedPlacement>> {
  const declared = (family.orientations as Orientation[] | undefined) ?? ['flat']
  const measured = { x: placed.widthMm, y: placed.depthMm, z: placed.heightMm }
  const out: Partial<Record<Orientation, OrientedPlacement>> = {}

  if (declared.includes('flat')) {
    out.flat = {
      rule: placementFor(family, parsed, placed),
      sizeMm: measured,
      rotateXDeg: 0,
    }
  }

  if (declared.includes('shelf')) {
    // A family that is *only* a shelf ships its asset already turned, by its
    // own printToWall map, so its measured bounds are the shelf's and there
    // is no rotation left for the app to apply. One that is both ships flat
    // and gets turned at draw time.
    const alreadyTurned = !declared.includes('flat')
    const shelf = (family as { shelf?: ShelfSpec }).shelf
    if (!shelf) throw new Error(`family ${String(family.id)} offers a shelf but declares no lattice`)

    const reachMm = alreadyTurned ? placed.depthMm : placed.heightMm
    out.shelf = {
      rule: {
        occupiesColumns: columnsFor(parsed),
        offsetFromSlotXMm: offsetFor(parsed, placed.widthMm),
        // Measured, never declared: a shelf reaches out by what used to be
        // its height, and no family has one number for that.
        frontFaceYMm: backEdgeY(shelf, armSocket) - reachMm,
        bottomBelowSlotCenterMm: seatedInArmSocket(shelf, armSocket),
        // `h` has stopped meaning height, so comparing it to a neighbour's
        // would warn about the wrong thing in both directions.
        matesByHeight: false,
      },
      sizeMm: alreadyTurned ? measured : { x: placed.widthMm, y: placed.heightMm, z: placed.depthMm },
      rotateXDeg: alreadyTurned ? 0 : SHELF_TURN_DEG,
    }
  }

  return out
}

/** The shared arm-socket lattice, read from families.json's top level. */
export interface ArmSocket {
  readonly pocketFloorBelowSidepieceTopMm: number
  readonly firstPocketOutFromTangMm: number
  readonly sidepieceTopAboveTopSlotCenterMm: number
  readonly tangDepthMm: number
}

/**
 * Where a shelf's back edge sits, in wall Y.
 *
 * Not a free choice and not flush. The first pocket begins a measured 24.05
 * out from the tang and a shelf's own first band sits 7.75 in from its back
 * edge, so seating one in the other leaves the back edge standing 7.8 mm
 * proud of the panel. Anything else draws the rib outside the pocket.
 */
function backEdgeY(shelf: { bandFirstOffsetMm: number }, socket: ArmSocket): number {
  return -(socket.firstPocketOutFromTangMm - shelf.bandFirstOffsetMm - socket.tangDepthMm)
}

/**
 * Where a shelf sits vertically, as a drop from the slot centre.
 *
 * A centerpiece in the wall plane is located by its bottom and its own height
 * finishes the job. A shelf has no height worth speaking of — 10.8 mm for a
 * Gridfinity frame, 6.15 for a spacer — and its `h` means depth, so neither
 * its height nor its parity can say where it goes. What holds it is the rib,
 * in the arm pocket, and the pocket is at a fixed height above the slot the
 * sidepiece tops out on: 20.35 up to the top, 12.9 back down to the pocket
 * floor. Both keys carry the same number because there is no parity left to
 * spend, and the value is negative because the shelf sits *above* the slot
 * centre rather than below it.
 */
function seatedInArmSocket(
  shelf: { bandFloorMm: number },
  socket: ArmSocket,
): { odd: number; even: number } {
  const above =
    socket.sidepieceTopAboveTopSlotCenterMm -
    socket.pocketFloorBelowSidepieceTopMm -
    shelf.bandFloorMm
  const value = Number((-above).toFixed(4))
  return { odd: value, even: value }
}

interface UnsupportedRule {
  match: string
  reason: string
}

/**
 * Whether the planner can place a part at all.
 *
 * Matched on the part's name rather than its folder: the horizontal-panel
 * parts are split across two families, so flagging a directory would quietly
 * miss five of them.
 */
function unsupportedReasonFor(rules: readonly UnsupportedRule[], name: string): string | undefined {
  const haystack = name.toLowerCase()
  return rules.find((r) => haystack.includes(r.match.toLowerCase()))?.reason
}

/**
 * A family's fasteners, plus any that apply only to some of its parts. A
 * standard retainer needs nothing; the locking variants take a pin.
 */
type Needs = { id: string; quantity: number }[]
type ByOrientation = Partial<Record<Orientation, Needs>>

interface FastenerRule {
  match: string
  fasteners: Needs
  fastenersByOrientation?: ByOrientation
}

function matchingRules(family: Record<string, unknown>, name: string): FastenerRule[] {
  const rules = (family.fastenerRules as FastenerRule[]) ?? []
  const haystack = name.toLowerCase()
  return rules.filter((r) => haystack.includes(r.match.toLowerCase()))
}

function fastenersFor(family: Record<string, unknown>, name: string): Needs {
  const base = (family.fasteners as Needs) ?? []
  return [...base, ...matchingRules(family, name).flatMap((r) => r.fasteners)]
}

/**
 * Fasteners for the orientations where the default does not hold.
 *
 * A locking spacer's 8 mm pin passes through the plate and into a hole in
 * the panel. Turn the plate into a shelf and the pin points at the ceiling,
 * so it is not something to print. Built by resolving the whole list per
 * orientation rather than by patching the default, so a family and a
 * per-part rule can each have their own answer without the two disagreeing.
 */
function fastenersByOrientationFor(
  family: Record<string, unknown>,
  name: string,
  orientations: readonly Orientation[],
): ByOrientation | undefined {
  const familyOverrides = (family.fastenersByOrientation as ByOrientation | undefined) ?? {}
  const rules = matchingRules(family, name)
  const relevant = orientations.filter(
    (o) => familyOverrides[o] !== undefined || rules.some((r) => r.fastenersByOrientation?.[o]),
  )
  if (relevant.length === 0) return undefined

  const out: ByOrientation = {}
  for (const o of relevant) {
    const base = familyOverrides[o] ?? ((family.fasteners as Needs) ?? [])
    const extra = rules.flatMap((r) => r.fastenersByOrientation?.[o] ?? r.fasteners)
    out[o] = [...base, ...extra]
  }
  return out
}

/**
 * Which way round this part is drawn.
 *
 * The family answers for all of its parts; `turnZDeg` is the escape hatch for
 * the handful of community hooks drawn round from the rest of theirs. It is
 * applied here rather than at draw time on purpose: everything downstream —
 * the glTF, the thumbnail, `sizeMm`, the measured ear, every orientation — is
 * derived from this one matrix, so a turn recorded once cannot be applied to
 * some of them and forgotten by the others.
 */
function mapFor(
  family: Record<string, unknown>,
  variant: string | null,
  turnZDeg = 0,
): AxisMap {
  const p = family.printToWall as AxisMap | Record<string, AxisMap>
  const chosen =
    typeof (p as AxisMap).x === 'string'
      ? (p as AxisMap)
      : (p as Record<string, AxisMap>)[variant ?? 'plain'] ??
        (p as Record<string, AxisMap>).plain ??
        Object.values(p as Record<string, AxisMap>)[0]
  if (!chosen) throw new Error(`family ${String(family.id)} has no usable printToWall`)
  return turnedAboutZ(chosen, turnZDeg)
}

export interface IndexStats {
  readonly modelBytes: number
  readonly thumbBytes: number
  readonly indexBytes: number
  readonly elapsedMs: number
}

export async function runIndexer(outDir = DEFAULT_OUT_DIR) {
  const started = Date.now()
  const families = resolvedFamilies()
  const file = loadFamilies() as unknown as {
    unsupported?: UnsupportedRule[]
    armSocket: Omit<ArmSocket, 'tangDepthMm'>
    archetypes: { sidepiece: { anchor: { tang: { depthMm: number } } } }
  }
  const unsupportedRules = file.unsupported ?? []
  // The tang depth is the depth datum every other rule here already uses, so
  // the shelf standoff is measured from the same place rather than a second
  // one that could drift from it.
  const armSocket: ArmSocket = {
    ...file.armSocket,
    tangDepthMm: file.archetypes.sidepiece.anchor.tang.depthMm,
  }
  const overrides = loadOverrides()

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'models'), { recursive: true })
  mkdirSync(join(outDir, 'thumbs'), { recursive: true })

  const parts: PartRow[] = []
  const fasteners: Record<
    string,
    { id: string; file: string; model: string; thumb: string; volumeMm3: number; sourceBytes: number }
  > = {}
  let modelBytes = 0
  let thumbBytes = 0

  for (const family of families) {
    const dir = family.dir as string
    const files = readdirSync(join(REPO_ROOT, dir)).filter((f) => /\.stl$/i.test(f)).sort()

    for (const file of files) {
      const named = parsePartName(file)
      // A correction replaces the dimensions the filename claims, before any
      // of them reach placement or the catalog facets. It may also turn the
      // mesh — see `mapFor`.
      const fix = overrides.get(named.filename)
      const parsed = fix
        ? { ...named, h: fix.h ?? named.h, w: fix.w ?? named.w }
        : named
      const sourcePath = join(REPO_ROOT, dir, file)
      const mesh = readStlFile(sourcePath)
      const sourceBytes = statSync(sourcePath).size

      // In most folders a file with no grid dimensions is a fastener that has
      // been duplicated in from Accessories/. Quickhooks are the exception:
      // every part there is dimensionless, so that family names its fasteners
      // explicitly rather than inferring them from a failed parse.
      const isFastener = family.dimensionless
        ? ((family.fastenerFiles as string[] | undefined) ?? []).includes(parsed.filename)
        : parsed.h === null
      const id = isFastener ? slug('fastener', parsed.filename) : slug(family.id as string, parsed.filename)
      if (isFastener && fasteners[parsed.filename]) continue

      const map = isFastener
        ? ({ x: '+x', y: '+y', z: '+z' } as AxisMap)
        : mapFor(family, parsed.variant, fix?.turnZDeg)
      const source: Bounds = { min: mesh.bbox.min, max: mesh.bbox.max }
      const placed = placeBounds(source, map, { x: 0, y: 0, z: 0 })

      const glb = await meshToGlb(mesh.positions, parsed.filename, (v) => applyMatrix(placed.matrix, v))

      // Render from the already-placed vertices so the thumbnail shows the
      // part the way it will sit on the wall.
      const oriented = new Float32Array(mesh.positions.length)
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const p = applyMatrix(placed.matrix, {
          x: mesh.positions[i]!,
          y: mesh.positions[i + 1]!,
          z: mesh.positions[i + 2]!,
        })
        oriented[i] = p.x
        oriented[i + 1] = p.y
        oriented[i + 2] = p.z
      }
      const webp = await renderWebp(oriented)

      const model = `models/${id}.glb`
      const thumb = `thumbs/${id}.webp`
      writeFileSync(join(outDir, model), glb.bytes)
      writeFileSync(join(outDir, thumb), webp)
      modelBytes += glb.bytes.length
      thumbBytes += webp.length

      if (isFastener) {
        fasteners[parsed.filename] = {
          id,
          file: `${dir}/${file}`,
          model,
          thumb,
          volumeMm3: Number(mesh.volumeMm3.toFixed(2)),
          sourceBytes,
        }
        continue
      }

      const size = placed.bounds
      const widthMm = size.max.x - size.min.x
      const depthMm = size.max.y - size.min.y
      const heightMm = size.max.z - size.min.z
      // The ear is measured off the placed mesh, so it follows the axis map
      // rather than restating it. See `tabSpanY`.
      const tabY = tabSpanY(mesh, placed.matrix)
      const orientations = orientationsFor(
        family,
        parsed,
        { widthMm, depthMm, heightMm, tabY },
        armSocket,
      )
      const byOrientation = fastenersByOrientationFor(
        family,
        parsed.filename,
        Object.keys(orientations) as Orientation[],
      )
      parts.push({
        id,
        family: family.id as string,
        role: (family.archetype as 'sidepiece' | 'centerpiece' | undefined) ?? 'centerpiece',
        file: `${dir}/${file}`,
        name: parsed.filename,
        base: parsed.base,
        variant: parsed.variant,
        h: parsed.h,
        w: parsed.w,
        searchKey: parsed.searchKey,
        triangles: glb.triangleCount,
        renderedTriangles: glb.renderedTriangleCount,
        vertices: glb.vertexCount,
        volumeMm3: Number(mesh.volumeMm3.toFixed(2)),
        sourceBytes,
        sizeMm: {
          x: Number((size.max.x - size.min.x).toFixed(2)),
          y: Number((size.max.y - size.min.y).toFixed(2)),
          z: Number((size.max.z - size.min.z).toFixed(2)),
        },
        model,
        thumb,
        fasteners: fastenersFor(family, parsed.filename),
        ...(fix ? { correction: fix.reason } : {}),
        supported: unsupportedReasonFor(unsupportedRules, parsed.filename) === undefined,
        ...(unsupportedReasonFor(unsupportedRules, parsed.filename) !== undefined
          ? { unsupportedReason: unsupportedReasonFor(unsupportedRules, parsed.filename) }
          : {}),
        orientations,
        ...(byOrientation ? { fastenersByOrientation: byOrientation } : {}),
      })
    }
  }

  const index = {
    schemaVersion: 1,
    generated: 'by @ddd-planner/indexer from the STLs in this repo',
    families: families.map((f) => ({
      id: f.id,
      label: f.label,
      kind: f.kind,
      dir: f.dir,
    })),
    fasteners,
    parts,
  }
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)

  const stats: IndexStats = {
    modelBytes,
    thumbBytes,
    indexBytes: Buffer.byteLength(JSON.stringify(index)),
    elapsedMs: Date.now() - started,
  }
  return { index, stats, outDir }
}
