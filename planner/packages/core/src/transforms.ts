/**
 * Print space to wall space.
 *
 * Every STL in the library sits wherever SketchUp left it, in whatever
 * orientation it prints flat. Placing one on the wall means: rotate its print
 * axes onto wall axes, then translate so a chosen corner lands on the grid.
 *
 * Rotations here are always signed axis permutations — no arbitrary angles are
 * involved, because parts mount square to the panel. That keeps every rotated
 * bounding box axis-aligned, which is what makes the anchor arithmetic exact
 * rather than approximate.
 *
 * Wall axes: X along the wall, Y out of it (front face at y = 0), Z up.
 */

import { COLUMN_PITCH_MM } from './grid'

export type Axis = 'x' | 'y' | 'z'
export type AxisSpec = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

/** Which signed print axis each wall axis reads from. */
export interface AxisMap {
  readonly x: AxisSpec
  readonly y: AxisSpec
  readonly z: AxisSpec
}

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Bounds {
  readonly min: Vec3
  readonly max: Vec3
}

const AXES: readonly Axis[] = ['x', 'y', 'z']
const AXIS_INDEX: Readonly<Record<Axis, number>> = { x: 0, y: 1, z: 2 }

function axisOf(spec: AxisSpec): Axis {
  return spec[1] as Axis
}

function signOf(spec: AxisSpec): 1 | -1 {
  return spec[0] === '-' ? -1 : 1
}

/** Row-major 3x3, so that `wall[i] = sum_j m[i][j] * print[j]`. */
export function rotationMatrix(map: AxisMap): number[][] {
  return AXES.map((wall) => {
    const spec = map[wall]
    const row = [0, 0, 0]
    row[AXIS_INDEX[axisOf(spec)]] = signOf(spec)
    return row
  })
}

export function determinant(map: AxisMap): number {
  const m = rotationMatrix(map)
  const [a, b, c] = m as [number[], number[], number[]]
  return (
    (a[0] as number) * ((b[1] as number) * (c[2] as number) - (b[2] as number) * (c[1] as number)) -
    (a[1] as number) * ((b[0] as number) * (c[2] as number) - (b[2] as number) * (c[0] as number)) +
    (a[2] as number) * ((b[0] as number) * (c[1] as number) - (b[1] as number) * (c[0] as number))
  )
}

/**
 * A mapping is only usable if it reads each print axis exactly once and has
 * determinant +1. Determinant -1 is a reflection, which would silently mirror
 * a part — a Left bracket rendered as a Right one, with nothing to see wrong
 * until someone prints it.
 */
export function isProperRotation(map: AxisMap): boolean {
  const used = AXES.map((wall) => axisOf(map[wall])).sort()
  const distinct = used[0] !== used[1] && used[1] !== used[2]
  return distinct && determinant(map) === 1
}

export function applyAxisMap(map: AxisMap, v: Vec3): Vec3 {
  const read = (spec: AxisSpec) => signOf(spec) * v[axisOf(spec)]
  return { x: read(map.x), y: read(map.y), z: read(map.z) }
}

export function boundsSize(b: Bounds): Vec3 {
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }
}

/**
 * Rotate an axis-aligned box. A signed permutation keeps it axis-aligned, so
 * this is exact: a negated axis just swaps that pair of faces.
 */
export function rotateBounds(map: AxisMap, b: Bounds): Bounds {
  const lo = applyAxisMap(map, b.min)
  const hi = applyAxisMap(map, b.max)
  return {
    min: { x: Math.min(lo.x, hi.x), y: Math.min(lo.y, hi.y), z: Math.min(lo.z, hi.z) },
    max: { x: Math.max(lo.x, hi.x), y: Math.max(lo.y, hi.y), z: Math.max(lo.z, hi.z) },
  }
}

export interface Placement {
  /** 4x4, column-major — feed straight to three.js `Matrix4.fromArray`. */
  readonly matrix: readonly number[]
  /** Where the part ends up, in wall space. */
  readonly bounds: Bounds
}

/**
 * The one function everything else funnels through: rotate a part out of print
 * space and translate it so its wall-space bounding box starts at `targetMin`.
 *
 * Recentring is implicit — the source box's own minimum is subtracted, so it
 * does not matter where in the SketchUp scene the part happened to sit.
 */
export function placeBounds(source: Bounds, map: AxisMap, targetMin: Vec3): Placement {
  if (!isProperRotation(map)) {
    throw new RangeError(
      `axis map {x:${map.x}, y:${map.y}, z:${map.z}} is not a proper rotation`,
    )
  }

  const rotated = rotateBounds(map, source)
  const t = {
    x: targetMin.x - rotated.min.x,
    y: targetMin.y - rotated.min.y,
    z: targetMin.z - rotated.min.z,
  }

  const r = rotationMatrix(map)
  const at = (row: number, col: number) => (r[row] as number[])[col] as number

  // Column-major: consecutive groups of four are columns.
  const matrix = [
    at(0, 0), at(1, 0), at(2, 0), 0,
    at(0, 1), at(1, 1), at(2, 1), 0,
    at(0, 2), at(1, 2), at(2, 2), 0,
    t.x, t.y, t.z, 1,
  ]

  const size = boundsSize(rotated)
  return {
    matrix,
    bounds: {
      min: targetMin,
      max: { x: targetMin.x + size.x, y: targetMin.y + size.y, z: targetMin.z + size.z },
    },
  }
}

/** Apply a placement matrix to a point, for tests and for hit-testing. */
export function applyMatrix(matrix: readonly number[], v: Vec3): Vec3 {
  const m = (i: number) => matrix[i] as number
  return {
    x: m(0) * v.x + m(4) * v.y + m(8) * v.z + m(12),
    y: m(1) * v.x + m(5) * v.y + m(9) * v.z + m(13),
    z: m(2) * v.x + m(6) * v.y + m(10) * v.z + m(14),
  }
}

/** Everything a sidepiece needs to know to find its corner on the wall. */
export interface SidepieceAnchor {
  readonly printToWall: AxisMap
  /** Across the wall: 13.7 for Left/Right, 27.6 for Center. */
  readonly thicknessMm: number
  /** The part of the part that enters the slot — 2.2 mm, the slot's own width. */
  readonly tangWidthMm: number
  /** How far the tang reaches behind the wall face. */
  readonly tangDepthMm: number
  /** Full depth of the part, front face to the back of the tang. */
  readonly depthMm: number
  /** Which way the body runs from the slot it hangs on. */
  readonly bodyExtends: '+x' | '-x'
  /** Distance from the engaged slot's centre down to the part's bottom edge. */
  readonly bottomBelowSlotCenterMm: number
}

/** Where a sidepiece's front face sits: everything else in depth follows this. */
export function sidepieceFrontFaceY(anchor: SidepieceAnchor): number {
  return -(anchor.depthMm - anchor.tangDepthMm)
}

/**
 * The tang is centred on its slot; the body hangs off to one side, which is
 * the whole difference between a Left and a Right.
 *
 * Y runs into the wall, so the body is at negative Y and only the tang, which
 * passes through the slot, is positive.
 */
export function sidepieceOrigin(
  anchor: SidepieceAnchor,
  slotX: number,
  slotCenterZ: number,
): Vec3 {
  const half = anchor.tangWidthMm / 2
  const x =
    anchor.bodyExtends === '+x' ? slotX - half : slotX + half - anchor.thicknessMm

  return {
    x,
    y: sidepieceFrontFaceY(anchor),
    z: slotCenterZ - anchor.bottomBelowSlotCenterMm,
  }
}

export interface CenterpieceAnchor {
  readonly printToWall: AxisMap
  /** Actual bounding width, including tab overhang or clearance. */
  readonly widthMm: number
  readonly bottomBelowSlotCenterMm: number
  /**
   * Shared with the sidepieces it sits between — see `sidepieceFrontFaceY`.
   * Sitting the part at the wall plane instead puts its tab clear of the
   * socket groove, which is how the spike check found this.
   */
  readonly frontFaceYMm: number
}

/**
 * A centerpiece spans `widthUnits` slot columns and is centred on that span,
 * so a tabbed family (wider than the span) reaches into the sockets either
 * side and a tabless one (narrower) clears them.
 */
export function centerpieceOrigin(
  anchor: CenterpieceAnchor,
  leftSlotX: number,
  slotCenterZ: number,
  widthUnits: number,
): Vec3 {
  const spanMm = COLUMN_PITCH_MM * widthUnits
  return {
    x: leftSlotX + (spanMm - anchor.widthMm) / 2,
    y: anchor.frontFaceYMm,
    z: slotCenterZ - anchor.bottomBelowSlotCenterMm,
  }
}
