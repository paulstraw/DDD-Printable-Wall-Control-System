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
import {
  type AxisMap,
  type Bounds,
  type PlacementRule,
  COLUMN_PITCH_MM,
  applyMatrix,
  parsePartName,
  placeBounds,
} from '@ddd-planner/core'
import { PLANNER_ROOT, REPO_ROOT, resolvedFamilies } from './assembly'
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
  file: string
  name: string
  base: string
  variant: string | null
  h: number | null
  w: number | null
  searchKey: string
  triangles: number
  vertices: number
  volumeMm3: number
  /** Size of the source STL, so the app can estimate a download before starting. */
  sourceBytes: number
  sizeMm: { x: number; y: number; z: number }
  model: string
  thumb: string
  fasteners: { id: string; quantity: number }[]
  /** Resolved from the family rules so the app never reads families.json. */
  placement: PlacementRule
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
  placed: { widthMm: number; depthMm: number },
): PlacementRule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rule = family as any
  const bottomBelowSlotCenterMm = rule.anchor.bottomBelowSlotCenterMm

  if (family.kind === 'sidepiece') {
    const half = rule.anchor.tang.widthMm / 2
    const variant = (parsed.variant ?? 'plain') as string
    const extends_ = rule.anchor.bodyExtendsFromSlot[variant] ?? rule.anchor.bodyExtendsFromSlot.plain

    return {
      occupiesColumns: 1,
      offsetFromSlotXMm: extends_ === '+x' ? -half : half - placed.widthMm,
      // How far it projects is its own business; the tang depth is shared.
      frontFaceYMm: -(placed.depthMm - rule.anchor.tang.depthMm),
      bottomBelowSlotCenterMm,
    }
  }

  const columns = Math.max(1, Math.round(parsed.w ?? 1))
  return {
    occupiesColumns: columns,
    offsetFromSlotXMm: (COLUMN_PITCH_MM * columns - placed.widthMm) / 2,
    frontFaceYMm: rule.anchor.depth.frontFaceYMm,
    bottomBelowSlotCenterMm,
  }
}

function mapFor(family: Record<string, unknown>, variant: string | null): AxisMap {
  const p = family.printToWall as AxisMap | Record<string, AxisMap>
  if (typeof (p as AxisMap).x === 'string') return p as AxisMap
  const byVariant = p as Record<string, AxisMap>
  const chosen = byVariant[variant ?? 'plain'] ?? byVariant.plain ?? Object.values(byVariant)[0]
  if (!chosen) throw new Error(`family ${String(family.id)} has no usable printToWall`)
  return chosen
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
      const parsed = parsePartName(file)
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

      const map = isFastener ? ({ x: '+x', y: '+y', z: '+z' } as AxisMap) : mapFor(family, parsed.variant)
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
      parts.push({
        id,
        family: family.id as string,
        file: `${dir}/${file}`,
        name: parsed.filename,
        base: parsed.base,
        variant: parsed.variant,
        h: parsed.h,
        w: parsed.w,
        searchKey: parsed.searchKey,
        triangles: glb.triangleCount,
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
        fasteners: (family.fasteners as { id: string; quantity: number }[]) ?? [],
        placement: placementFor(family, parsed, { widthMm, depthMm }),
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
