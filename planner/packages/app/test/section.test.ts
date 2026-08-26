import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import type { Axis, Bounds } from '@ddd-planner/core'
import {
  DRAG_MM_PER_PX,
  FINE_DRAG_SCALE,
  NEAR_AXIS_DEGREES,
  type SectionPlane,
  depthFromDrag,
  hiddenBySection,
  sectionPlane,
} from '../src/scene/section'

const AXES: Axis[] = ['x', 'y', 'z']

/** The test the renderer applies: three.js keeps `normal · p + constant >= 0`. */
const keeps = (plane: SectionPlane, p: [number, number, number]) =>
  plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] + plane.constant >= 0

const box = (min: [number, number, number], max: [number, number, number]): Bounds => ({
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
})

/**
 * The board, and a `3x3 Spacer blank` sitting on it, at the depths the app
 * actually draws them: the plate spans y -10.2 to -4.05 and the panel starts
 * at the front face, y 0. The viewer stands at negative y.
 */
const BOARD = box([0, 0, 0], [812.8, 1.587, 812.8])
const BLANK = box([0, -10.2, 0], [81.6, -4.05, 76])

describe('sectionPlane', () => {
  it('keeps the positive side of the cut on every axis', () => {
    expect(sectionPlane('x', 25, false)).toEqual({ normal: [1, 0, 0], constant: -25 })
    expect(sectionPlane('y', 25, false)).toEqual({ normal: [0, 1, 0], constant: -25 })
    expect(sectionPlane('z', 25, false)).toEqual({ normal: [0, 0, 1], constant: -25 })
  })

  it('flips to exactly the opposite half', () => {
    expect(sectionPlane('x', 25, true)).toEqual({ normal: [-1, 0, 0], constant: 25 })
    expect(sectionPlane('y', 25, true)).toEqual({ normal: [0, -1, 0], constant: 25 })
    expect(sectionPlane('z', 25, true)).toEqual({ normal: [0, 0, -1], constant: 25 })
  })

  it('cuts at the depth it was given, whichever half is kept', () => {
    for (const axis of AXES) {
      const i = AXES.indexOf(axis)
      const above: [number, number, number] = [0, 0, 0]
      const below: [number, number, number] = [0, 0, 0]
      above[i] = 30.01
      below[i] = 29.99

      const plain = sectionPlane(axis, 30, false)
      expect(keeps(plain, above), `${axis} keeps beyond`).toBe(true)
      expect(keeps(plain, below), `${axis} discards short of`).toBe(false)

      const flipped = sectionPlane(axis, 30, true)
      expect(keeps(flipped, above), `${axis} flipped discards beyond`).toBe(false)
      expect(keeps(flipped, below), `${axis} flipped keeps short of`).toBe(true)
    }
  })

  it('reports a section at zero as zero, not as negative zero', () => {
    // -0 is the same half-space and a different string in every readout that
    // prints it, and fails every `toBe(0)` a caller writes.
    for (const axis of AXES) {
      expect(Object.is(sectionPlane(axis, 0, false).constant, 0)).toBe(true)
      expect(Object.is(sectionPlane(axis, 0, true).constant, 0)).toBe(true)
    }
  })

  it('opens on the board face, keeping the wall side and cutting away the room', () => {
    // The whole point of the default view: a Y section at 0 should leave the
    // board and the tangs through it, and nothing that stands in front of it.
    const plane = sectionPlane('y', 0, false)
    expect(keeps(plane, [100, 1, 100])).toBe(true)
    expect(keeps(plane, [100, -1, 100])).toBe(false)
  })
})

describe('hiddenBySection', () => {
  it('hides a box lying wholly on the discarded side, on every axis', () => {
    for (const axis of AXES) {
      const i = AXES.indexOf(axis)
      const min: [number, number, number] = [0, 0, 0]
      const max: [number, number, number] = [10, 10, 10]
      min[i] = 0
      max[i] = 10

      expect(hiddenBySection(box(min, max), sectionPlane(axis, 20, false)), axis).toBe(true)
      expect(hiddenBySection(box(min, max), sectionPlane(axis, 20, true)), axis).toBe(false)
      expect(hiddenBySection(box(min, max), sectionPlane(axis, -5, true)), axis).toBe(true)
      expect(hiddenBySection(box(min, max), sectionPlane(axis, -5, false)), axis).toBe(false)
    }
  })

  it('keeps a straddling box live', () => {
    // Half of it is still drawn, so it is still there to be clicked.
    for (const axis of AXES) {
      const cut = sectionPlane(axis, 5, false)
      expect(hiddenBySection(box([0, 0, 0], [10, 10, 10]), cut), axis).toBe(false)
      expect(hiddenBySection(box([0, 0, 0], [10, 10, 10]), sectionPlane(axis, 5, true)), axis).toBe(
        false,
      )
    }
  })

  it('keeps a box that only touches the plane', () => {
    // The drawn sliver is zero-area but on screen, and a visible part that
    // will not answer a click is worse than a stray click on a sliver.
    for (const axis of AXES) {
      expect(hiddenBySection(box([0, 0, 0], [10, 10, 10]), sectionPlane(axis, 10, false)), axis).toBe(
        false,
      )
    }
  })

  it('drops the blank out of hit-testing at the board face, and not the board', () => {
    const plane = sectionPlane('y', 0, false)
    expect(hiddenBySection(BLANK, plane)).toBe(true)
    expect(hiddenBySection(BOARD, plane)).toBe(false)
  })

  it('brings the blank back as the plane sweeps forward past its rear face', () => {
    // Parts should appear back-to-front as the cut advances, which is the
    // sweep the overlay is read with.
    expect(hiddenBySection(BLANK, sectionPlane('y', -4.04, false))).toBe(true)
    expect(hiddenBySection(BLANK, sectionPlane('y', -4.06, false))).toBe(false)
  })
})

/**
 * The camera turned `angleDegrees` off the front-on view, orbiting in the
 * y/x plane. Zero is where the app opens: square to the wall, looking along
 * +y from in front of it. `up` matches App.tsx — z is up in wall space.
 */
function cameraAt(angleDegrees: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 1, 5000)
  camera.up.set(0, 0, 1)
  const t = (angleDegrees * Math.PI) / 180
  camera.position.set(Math.sin(t) * 1000, -Math.cos(t) * 1000, 0)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

describe('depthFromDrag', () => {
  it('follows the axis as it runs across the screen', () => {
    // Broadside to the wall, +y runs to the right on screen, so a rightward
    // drag drives the plane deeper into it.
    const camera = cameraAt(90)
    expect(depthFromDrag('y', 0, { x: 100, y: 0 }, camera)).toBeCloseTo(100 * DRAG_MM_PER_PX, 6)
    expect(depthFromDrag('y', 0, { x: -100, y: 0 }, camera)).toBeCloseTo(-100 * DRAG_MM_PER_PX, 6)
    // Z is up on screen from every angle, and screen y grows downwards.
    expect(depthFromDrag('z', 0, { x: 0, y: -100 }, camera)).toBeCloseTo(100 * DRAG_MM_PER_PX, 6)
  })

  it('starts from the depth it was handed', () => {
    expect(depthFromDrag('y', 12, { x: 100, y: 0 }, cameraAt(90))).toBeCloseTo(
      12 + 100 * DRAG_MM_PER_PX,
      6,
    )
  })

  it('scales with the pointer, so Shift is the caller thinning the delta', () => {
    const camera = cameraAt(90)
    const coarse = depthFromDrag('y', 0, { x: 100, y: 0 }, camera)
    const fine = depthFromDrag('y', 0, { x: 100 * FINE_DRAG_SCALE, y: 0 }, camera)
    expect(fine).toBeCloseTo(coarse * FINE_DRAG_SCALE, 6)
  })

  it('falls back to screen-vertical when the axis points straight at the camera', () => {
    // The view the overlay opens in: +y is head-on, its screen direction is a
    // rounding error, and a horizontal drag has no axis to run along at all.
    const camera = cameraAt(0)
    expect(depthFromDrag('y', 0, { x: 500, y: 0 }, camera)).toBe(0)
    expect(depthFromDrag('y', 0, { x: 0, y: -100 }, camera)).toBeCloseTo(100 * DRAG_MM_PER_PX, 6)
  })

  it('engages the fallback at the threshold and not before', () => {
    const inside = cameraAt(NEAR_AXIS_DEGREES - 0.5)
    const outside = cameraAt(NEAR_AXIS_DEGREES + 0.5)

    // Inside the cone the horizontal run of the axis is ignored and the
    // vertical drag drives the plane; outside, exactly the other way round.
    expect(depthFromDrag('y', 0, { x: 100, y: 0 }, inside)).toBe(0)
    expect(depthFromDrag('y', 0, { x: 0, y: -100 }, inside)).toBeCloseTo(100 * DRAG_MM_PER_PX, 6)

    expect(depthFromDrag('y', 0, { x: 100, y: 0 }, outside)).toBeCloseTo(100 * DRAG_MM_PER_PX, 6)
    expect(depthFromDrag('y', 0, { x: 0, y: -100 }, outside)).toBeCloseTo(0, 6)
  })

  it('pushes the plane away from the viewer, from whichever side they are on', () => {
    // Dragging up means "further from me". Orbit behind the wall and that is
    // the other direction along y — the drag flips, the kept half does not.
    expect(depthFromDrag('y', 0, { x: 0, y: -100 }, cameraAt(0))).toBeCloseTo(
      100 * DRAG_MM_PER_PX,
      6,
    )
    expect(depthFromDrag('y', 0, { x: 0, y: -100 }, cameraAt(180))).toBeCloseTo(
      -100 * DRAG_MM_PER_PX,
      6,
    )
  })
})
