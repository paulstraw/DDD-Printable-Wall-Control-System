/**
 * Assembling parts from the shipped rules.
 *
 * This is the bridge between `data/families.json` and `@ddd-planner/core`:
 * it reads the authored rules, places real meshes with them, and locates the
 * measured features — sockets, tangs, tabs — in wall space so they can be
 * checked against each other.
 *
 * The spike CLI and the families test both go through here, so neither can
 * drift from what actually ships.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type AxisMap, type Bounds, type Vec3, applyMatrix, placeBounds } from '@ddd-planner/core'
import { type StlMesh, readStlFile } from './stl'

export const PLANNER_ROOT = join(import.meta.dirname, '..', '..', '..')
export const REPO_ROOT = join(PLANNER_ROOT, '..')

export interface FamilyRule {
  readonly id: string
  readonly dir: string
  readonly kind: 'sidepiece' | 'centerpiece'
  // The file carries more than this; callers reach in for what they need.
  readonly [key: string]: unknown
}

let cached: { families: FamilyRule[] } | null = null

export function loadFamilies(): { families: FamilyRule[] } {
  cached ??= JSON.parse(readFileSync(join(PLANNER_ROOT, 'data', 'families.json'), 'utf8'))
  return cached as { families: FamilyRule[] }
}

/**
 * Merge a family onto its archetype.
 *
 * Wall Control parts share one mounting interface by construction, so the
 * archetype carries it once and a family says only what is its own. A family
 * key always wins, and the nested blocks merge one level deep so a family can
 * add `size.depthMm` without restating `size.heightMm`.
 */
export function resolveFamily(family: FamilyRule, archetypes: Record<string, FamilyRule>): FamilyRule {
  const name = family.archetype as string | undefined
  if (!name) return family

  const base = archetypes[name]
  if (!base) throw new Error(`family ${family.id} names unknown archetype ${name}`)

  const merged: Record<string, unknown> = { ...base, ...family }
  for (const key of ['size', 'anchor', 'printToWall', 'sockets', 'tabs']) {
    const a = (base as Record<string, unknown>)[key]
    const b = (family as Record<string, unknown>)[key]
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      merged[key] = { ...(a as object), ...(b as object) }
    }
  }
  return merged as FamilyRule
}

/** Every family, with its archetype already folded in. */
export function resolvedFamilies(): FamilyRule[] {
  const file = loadFamilies() as unknown as {
    families: FamilyRule[]
    archetypes: Record<string, FamilyRule>
  }
  return file.families.map((f) => resolveFamily(f, file.archetypes ?? {}))
}

export interface PartOverride {
  readonly name: string
  readonly h?: number
  readonly w?: number
  /** Degrees anticlockwise about wall Z, for a mesh drawn round from its family. */
  readonly turnZDeg?: number
  readonly reason: string
}

let overrides: Map<string, PartOverride> | null = null

/**
 * Per-part corrections, keyed by filename without extension.
 *
 * Two kinds: a name that disagrees with its model, corrected in `h`/`w`, and
 * a model drawn round from the rest of its family, corrected in `turnZDeg`.
 * See data/overrides.json for the bar each one has to clear.
 */
export function loadOverrides(): Map<string, PartOverride> {
  if (!overrides) {
    const file = JSON.parse(
      readFileSync(join(PLANNER_ROOT, 'data', 'overrides.json'), 'utf8'),
    ) as { parts: PartOverride[] }
    overrides = new Map(file.parts.map((p) => [p.name, p]))
  }
  return overrides
}

/**
 * Where a centerpiece's front face lands, given how deep the part measures.
 *
 * The anchor in families.json is written as a front face because for a spacer
 * the plate *is* the part, and the two faces are 6.15 mm apart either way. A
 * tool hook is that same plate carrying a rack, and its tab still sits 0.5 mm
 * in from the plate's back face — the socket holds the back of a centerpiece,
 * and whatever the part carries has to be added in front of the anchor rather
 * than behind it. Read as a front face, an 87 mm pliers rack put 6 mm of
 * itself on the wall and the remaining 81 mm through it.
 *
 * The plate is what the family has in common; the projection is measured,
 * because a tool hook family has no rule for what its parts hold. A part
 * thinner than the plate projects nothing.
 */
export interface Span {
  readonly min: number
  readonly max: number
}

/**
 * The tab ear, in wall Y, relative to the part's own front face.
 *
 * The ear is the only place a centerpiece reaches its full width, so that is
 * how it is found: the layer standing proud of the plate on both sides. No
 * threshold to tune and nothing declared.
 *
 * It cannot tell an ear from a side face that happens to run the full depth,
 * and does not try - a family with no ear gets its whole plate back rather
 * than null. Measured: the spacers and Honeycomb all answer 2.80, the
 * Retainers answer their entire 6.35, and a U hook answers 59.60 of its 76.
 * Only the tabbed families feed this into placement, so the last two are
 * currently harmless rather than correct.
 *
 * Measured rather than declared because the ear's offset within the plate is
 * what a turn moves. A number written down here would have gone on being
 * right-looking and wrong after the axis map changed, which is exactly what
 * happened to the note this replaces.
 */
export function tabSpanY(mesh: StlMesh, matrix: readonly number[]): Span | null {
  let lo = Infinity
  let hi = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity

  const n = mesh.positions.length
  const wall = new Float64Array(n)
  for (let i = 0; i < n; i += 3) {
    const p = applyMatrix(matrix, {
      x: mesh.positions[i] as number,
      y: mesh.positions[i + 1] as number,
      z: mesh.positions[i + 2] as number,
    })
    wall[i] = p.x
    wall[i + 1] = p.y
    wall[i + 2] = p.z
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
  }

  // A hair of slack, because a chamfer meets the extreme face at a vertex the
  // exporter rounded.
  const EDGE_MM = 0.01
  for (let i = 0; i < n; i += 3) {
    const x = wall[i] as number
    if (x > minX + EDGE_MM && x < maxX - EDGE_MM) continue
    const y = wall[i + 1] as number
    if (y < lo) lo = y
    if (y > hi) hi = y
  }

  if (!Number.isFinite(lo) || hi - lo <= 0) return null
  return { min: lo - minY, max: hi - minY }
}

/**
 * Where a centerpiece's front face goes.
 *
 * A tabbed part is located by its tab: the ear is what the socket closes on,
 * so the ear goes in the middle of the socket and the rest of the part
 * follows. That is the whole rule, and it holds whichever way round the part
 * is drawn - which the old rule did not, because it located the part by a
 * face and assumed the ear sat a fixed distance behind it.
 *
 * A tabless family is not held by a plate in a groove at all: a pin bridges
 * its notch to the socket, and that notch is centred in its own thickness, so
 * a turn does not move it. Those keep the front-face datum.
 */
export function centerpieceFrontFaceY(
  rule: FamilyRule,
  depthMm: number,
  tab?: Span | null,
): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rule as any
  const tabbed = r.tabs?.present !== false

  if (tabbed && tab) {
    return (r.anchor.depth.socketCentreYMm as number) - (tab.min + tab.max) / 2
  }

  const projection = tabbed ? Math.max(0, depthMm - (r.anchor.depth.plateThicknessMm as number)) : 0
  return (r.anchor.depth.frontFaceYMm as number) - projection
}

export function ruleFor(id: string): FamilyRule {
  const found = resolvedFamilies().find((f) => f.id === id)
  if (!found) throw new Error(`no family rule for ${id}`)
  return found
}

/**
 * Socket grooves and tabs, measured off the meshes relative to each part's own
 * bounding-box minimum. They live here rather than in families.json because
 * they are diagnostic detail, not placement rules.
 */
export const FEATURES = {
  flatLeftGroove: { min: { x: 12.6, y: 3.1, z: 0 }, max: { x: 16.8, y: 79.1, z: 4.2 } },
  flatRightGroove: { min: { x: 1.9, y: 3.1, z: 0 }, max: { x: 6.1, y: 79.1, z: 4.2 } },
} as const satisfies Record<string, Bounds>

export const boundsOf = (m: StlMesh): Bounds => ({ min: m.bbox.min, max: m.bbox.max })

/** Feature boxes are bbox-relative; placement matrices work in absolute print space. */
export function absolute(relative: Bounds, src: Bounds): Bounds {
  const shift = (v: Vec3): Vec3 => ({ x: v.x + src.min.x, y: v.y + src.min.y, z: v.z + src.min.z })
  return { min: shift(relative.min), max: shift(relative.max) }
}

/**
 * Push a print-space box through a placement matrix.
 *
 * Not `placeBounds` — that re-normalises whatever box it is given to its own
 * minimum, which is right for placing a part and useless for locating a
 * feature inside one.
 */
export function through(matrix: readonly number[], box: Bounds): Bounds {
  let lo = { x: Infinity, y: Infinity, z: Infinity }
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = applyMatrix(matrix, { x, y, z })
        lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }
        hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) }
      }
  return { min: lo, max: hi }
}

export const centreX = (b: Bounds) => (b.min.x + b.max.x) / 2

export function overlap(a: Bounds, b: Bounds, axis: 'x' | 'y' | 'z'): number {
  return Math.max(0, Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]))
}

export interface Placed {
  readonly name: string
  readonly mesh: StlMesh
  readonly matrix: readonly number[]
  readonly bounds: Bounds
  readonly groove?: Bounds
  readonly tabs?: Bounds
}

/** The tang is the part narrowed to the slot-width layer at its print z-min. */
const tangLayer = (b: Bounds, mm: number): Bounds => ({ min: b.min, max: { ...b.max, z: b.min.z + mm } })

/**
 * Place a sidepiece with its tang centred in the given slot column. The tang's
 * wall-X position after rotation is what sets the shift, so this stays correct
 * whatever the axis map says.
 */
export function placeSidepiece(opts: {
  name: string
  file: string
  map: AxisMap
  groove: Bounds
  slotX: number
  bottomZ: number
  frontFaceY: number
  tangWidthMm: number
}): Placed {
  const mesh = readStlFile(join(REPO_ROOT, opts.file))
  const src = boundsOf(mesh)

  const trial = placeBounds(src, opts.map, { x: 0, y: 0, z: 0 })
  const tang = through(trial.matrix, tangLayer(src, opts.tangWidthMm))
  const shiftX = opts.slotX - centreX(tang)

  const final = placeBounds(src, opts.map, { x: shiftX, y: opts.frontFaceY, z: opts.bottomZ })
  return {
    name: opts.name,
    mesh,
    matrix: final.matrix,
    bounds: final.bounds,
    groove: through(final.matrix, absolute(opts.groove, src)),
  }
}

/**
 * Place a centerpiece centred on its column span.
 *
 * Its depth is measured here rather than passed in, because that is what the
 * front face follows: a part that carries something stands out in front of
 * the plate the socket holds. See `centerpieceFrontFaceY`.
 */
export function placeCenterpiece(opts: {
  name: string
  file: string
  map: AxisMap
  rule: FamilyRule
  leftSlotX: number
  widthUnits: number
  bottomZ: number
}): Placed {
  const mesh = readStlFile(join(REPO_ROOT, opts.file))
  const src = boundsOf(mesh)
  const width = src.max.x - src.min.x
  const span = 25.4 * opts.widthUnits

  const trial = placeBounds(src, opts.map, { x: 0, y: 0, z: 0 })
  const depthMm = trial.bounds.max.y - trial.bounds.min.y
  const tab = tabSpanY(mesh, trial.matrix)

  const final = placeBounds(src, opts.map, {
    x: opts.leftSlotX + (span - width) / 2,
    y: centerpieceFrontFaceY(opts.rule, depthMm, tab),
    z: opts.bottomZ,
  })
  return {
    name: opts.name,
    mesh,
    matrix: final.matrix,
    bounds: final.bounds,
    tabs: tab
      ? { min: { ...final.bounds.min, y: final.bounds.min.y + tab.min },
          max: { ...final.bounds.max, y: final.bounds.min.y + tab.max } }
      : undefined,
  }
}

/** Which centerpiece to seat, when it is not the spacer the phase was named for. */
export interface CentrePiece {
  readonly family: string
  readonly file: string
  readonly name: string
}

/** The Phase-1 joint, built entirely from the shipped rules. */
export function buildPhase1Joint(widthUnits = 3, col = 2, slotZ = 127, centre?: CentrePiece) {
  const flats = ruleFor('sidepieces/flats')
  const blank = ruleFor(centre?.family ?? 'centerpieces/spacer_blank')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = flats as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = blank as any
  // A sidepiece's front face follows its own depth; the centerpiece follows
  // its own mounting plate, and finds its own front face from that. For a
  // Flat and a spacer the two land at the same -10.2, which is exactly why
  // this joint is front-flush and a joint holding a tool hook is not.
  const flatDepthMm = 18.7
  const frontFaceY = -(flatDepthMm - (f.anchor.tang.depthMm as number))
  const slotX = (c: number) => 25.4 + 25.4 * c

  const left = placeSidepiece({
    name: '3x0 Flat Left',
    file: 'Sidepieces/Flats/3x0 Flat Left.stl',
    map: f.printToWall.left,
    groove: FEATURES.flatLeftGroove,
    slotX: slotX(col),
    bottomZ: slotZ - f.anchor.bottomBelowSlotCenterMm.odd,
    frontFaceY,
    tangWidthMm: f.anchor.tang.widthMm,
  })

  const right = placeSidepiece({
    name: '3x0 Flat Right',
    file: 'Sidepieces/Flats/3x0 Flat Right.stl',
    map: f.printToWall.right,
    groove: FEATURES.flatRightGroove,
    slotX: slotX(col + widthUnits),
    bottomZ: slotZ - f.anchor.bottomBelowSlotCenterMm.odd,
    frontFaceY,
    tangWidthMm: f.anchor.tang.widthMm,
  })

  const middle = placeCenterpiece({
    name: centre?.name ?? `3x${widthUnits} Spacer blank`,
    file: centre?.file ?? `Centerpieces/Spacer_blank/3x${widthUnits} Spacer blank.stl`,
    map: b.printToWall,
    rule: blank,
    leftSlotX: slotX(col),
    widthUnits,
    bottomZ: slotZ - b.anchor.bottomBelowSlotCenterMm.odd,
  })

  return { left, centre: middle, right }
}

/** Do the two sockets face the centerpiece, and does each tab reach one? */
export function assessJoint(joint: ReturnType<typeof buildPhase1Joint>) {
  const { left, centre, right } = joint
  const leftFacesIn = centreX(left.groove as Bounds) > centreX(left.bounds)
  const rightFacesIn = centreX(right.groove as Bounds) < centreX(right.bounds)
  const tabs = centre.tabs as Bounds

  return {
    leftFacesIn,
    rightFacesIn,
    socketsFaceEachOther: leftFacesIn && rightFacesIn,
    intoLeftSocket: {
      x: overlap(tabs, left.groove as Bounds, 'x'),
      y: overlap(tabs, left.groove as Bounds, 'y'),
      z: overlap(tabs, left.groove as Bounds, 'z'),
    },
    intoRightSocket: {
      x: overlap(tabs, right.groove as Bounds, 'x'),
      y: overlap(tabs, right.groove as Bounds, 'y'),
      z: overlap(tabs, right.groove as Bounds, 'z'),
    },
  }
}
