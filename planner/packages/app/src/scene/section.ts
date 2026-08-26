/**
 * The arithmetic behind the cross-section overlay.
 *
 * Depth is the one axis the 3D view reads badly, and it is the axis every
 * argument in this project has turned on. The overlay exists so a depth claim
 * can be *looked at* instead of argued about — which only works if the picture
 * is trustworthy, so everything here is deterministic and view-independent.
 * Nothing in this file consults the camera except the drag, and the drag reads
 * it only to decide which way the pointer is pushing.
 *
 * Pure by design: three.js appears as types only, so all of it is testable
 * without a renderer.
 */

import type { Axis, Bounds } from '@ddd-planner/core'
import type { Camera } from 'three'

/**
 * A half-space, in the form `WebGLRenderer.clippingPlanes` wants.
 *
 * three.js keeps the half where `normal · p + constant >= 0` and discards the
 * rest, so the sign of `constant` is the whole content of "which half".
 */
export interface SectionPlane {
  readonly normal: readonly [number, number, number]
  readonly constant: number
}

/** Screen-space pointer movement, in CSS pixels, y growing downwards. */
export interface PointerDelta {
  readonly x: number
  readonly y: number
}

/**
 * How close the section normal may come to the view direction before the
 * screen projection stops meaning anything.
 *
 * Head-on, the axis collapses to a point on screen: its projected direction is
 * a rounding error, and dragging along it moves the plane by nothing. Past
 * this angle the drag switches to plain screen-vertical.
 */
export const NEAR_AXIS_DEGREES = 15

/** Millimetres of depth per pixel of pointer travel. Both drag paths use it. */
export const DRAG_MM_PER_PX = 0.5

/** Shift scales the pointer delta by this before it is handed to the drag. */
export const FINE_DRAG_SCALE = 0.2

/** `sin` of the threshold: the projected length of a unit axis at that angle. */
const NEAR_AXIS_SIN = Math.sin((NEAR_AXIS_DEGREES * Math.PI) / 180)

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/**
 * The clipping plane for a section at `depth` along `axis`.
 *
 * Unflipped keeps the half on the *positive* side of the cut, uniformly for
 * all three axes. On Y — the axis this was built for — that is the half behind
 * the plane: the viewer stands at negative Y, so a Y section at 0 discards
 * everything in front of the board's front face and leaves the board and the
 * tangs through it.
 *
 * The sign is fixed per axis and never derived from where the camera happens
 * to be. An overlay that re-chose its own half as you orbited would show a
 * different picture from every angle, and a measurement you can orbit into
 * agreeing with you is not a measurement.
 */
export function sectionPlane(axis: Axis, depth: number, flipped: boolean): SectionPlane {
  const sign = flipped ? -1 : 1
  const normal: [number, number, number] = [0, 0, 0]
  normal[AXIS_INDEX[axis]] = sign
  // `+ 0` normalises away the negative zero a section at depth 0 would
  // otherwise carry. Arithmetically it is the same half-space; it just reads
  // as `-0` everywhere it is printed or compared.
  return { normal, constant: -depth * sign + 0 }
}

/**
 * Where the plane lands after the pointer has moved `pointerDeltaPx`.
 *
 * `depth` is the depth at the pointer position that delta is measured from,
 * so a caller may feed either per-move deltas or the whole delta since the
 * drag began — the rate is fixed, so the two agree.
 *
 * The pointer is projected onto the axis as it runs across the screen, which
 * is what makes the handle feel attached to the ruler it is sliding along. As
 * the axis turns to face the camera that projection shrinks to nothing, so
 * within `NEAR_AXIS_DEGREES` the drag falls back to screen-vertical: pushing
 * the pointer up always pushes the plane away from the viewer, whichever way
 * the axis is pointing.
 */
export function depthFromDrag(
  axis: Axis,
  depth: number,
  pointerDeltaPx: PointerDelta,
  camera: Camera,
): number {
  const e = camera.matrixWorld.elements
  const i = AXIS_INDEX[axis]

  // Columns of the camera's world matrix: x is right, y is up, z is backwards.
  const right = normalize([e[0]!, e[1]!, e[2]!])
  const up = normalize([e[4]!, e[5]!, e[6]!])
  const back = normalize([e[8]!, e[9]!, e[10]!])

  // The unit axis is a basis vector, so projecting it is just a lookup: these
  // are its screen-space run and how far it leans towards the viewer.
  const screenX = right[i]
  const screenY = up[i]
  const towardsViewer = back[i]
  const projected = Math.hypot(screenX, screenY)

  // Screen up is negative y in pointer coordinates.
  if (projected < NEAR_AXIS_SIN) {
    const away = towardsViewer >= 0 ? -1 : 1
    return depth + -pointerDeltaPx.y * away * DRAG_MM_PER_PX
  }

  const alongAxisPx =
    (pointerDeltaPx.x * screenX + -pointerDeltaPx.y * screenY) / projected
  return depth + alongAxisPx * DRAG_MM_PER_PX
}

/**
 * Whether the section hides `bounds` outright.
 *
 * three.js raycasting ignores clipping planes, so hit-testing has to be told
 * separately or a cut-away part stays clickable — you would select something
 * you cannot see. This answers only the unambiguous case: a box that straddles
 * the plane still has visible material and stays live, and so does one merely
 * touching it, since the drawn sliver is still on screen. Being wrong towards
 * "still pickable" costs a stray click; being wrong the other way makes a
 * visible part inert.
 */
export function hiddenBySection(bounds: Bounds, plane: SectionPlane): boolean {
  const [nx, ny, nz] = plane.normal
  const furthest =
    support(nx, bounds.min.x, bounds.max.x) +
    support(ny, bounds.min.y, bounds.max.y) +
    support(nz, bounds.min.z, bounds.max.z) +
    plane.constant
  return furthest < 0
}

/** The corner of the box that reaches furthest along `n`. */
function support(n: number, min: number, max: number): number {
  return n >= 0 ? n * max : n * min
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : v
}
