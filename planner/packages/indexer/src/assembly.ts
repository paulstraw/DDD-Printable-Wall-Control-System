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

export function ruleFor(id: string): FamilyRule {
  const found = loadFamilies().families.find((f) => f.id === id)
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

export function placeCenterpiece(opts: {
  name: string
  file: string
  map: AxisMap
  leftSlotX: number
  widthUnits: number
  bottomZ: number
  frontFaceY: number
  tabThicknessMm: number
}): Placed {
  const mesh = readStlFile(join(REPO_ROOT, opts.file))
  const src = boundsOf(mesh)
  const width = src.max.x - src.min.x
  const span = 25.4 * opts.widthUnits

  const final = placeBounds(src, opts.map, {
    x: opts.leftSlotX + (span - width) / 2,
    y: opts.frontFaceY,
    z: opts.bottomZ,
  })
  return {
    name: opts.name,
    mesh,
    matrix: final.matrix,
    bounds: final.bounds,
    tabs: through(final.matrix, tangLayer(src, opts.tabThicknessMm)),
  }
}

/** The Phase-1 joint, built entirely from the shipped rules. */
export function buildPhase1Joint(widthUnits = 3, col = 2, slotZ = 127) {
  const flats = ruleFor('sidepieces/flats')
  const blank = ruleFor('centerpieces/spacer_blank')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = flats as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = blank as any
  const frontFaceY = f.anchor.depth.frontFaceYMm as number
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

  const centre = placeCenterpiece({
    name: `3x${widthUnits} Spacer blank`,
    file: `Centerpieces/Spacer_blank/3x${widthUnits} Spacer blank.stl`,
    map: b.printToWall,
    leftSlotX: slotX(col),
    widthUnits,
    bottomZ: slotZ - b.anchor.bottomBelowSlotCenterMm.odd,
    frontFaceY,
    tabThicknessMm: b.tabs.thicknessMm ?? 2.4,
  })

  return { left, centre, right }
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
