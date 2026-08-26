import { describe, expect, it } from 'vitest'
import { slotColumnX, slotRowCenterZ } from '../src/grid'
import {
  type AxisMap,
  type Bounds,
  applyAxisMap,
  applyMatrix,
  boundsSize,
  centerpieceOrigin,
  determinant,
  isProperRotation,
  placeBounds,
  rotateBounds,
  rotationMatrix,
  sidepieceFrontFaceY,
  sidepieceOrigin,
  turnedAboutZ,
} from '../src/transforms'

const IDENTITY: AxisMap = { x: '+x', y: '+y', z: '+z' }
/** Flats Left/Center, as measured and confirmed by the spike check. */
const FLAT_LEFT: AxisMap = { x: '-z', y: '-x', z: '+y' }
/** Flats Right — the same part yawed 180 degrees. */
const FLAT_RIGHT: AxisMap = { x: '+z', y: '+x', z: '+y' }
/** Both spacer families. */
const SPACER: AxisMap = { x: '+x', y: '-z', z: '+y' }

/** `3x0 Flat Left` as it actually sits in the file. */
const FLAT_3X0_LEFT: Bounds = {
  min: { x: 82.9, y: 60.4, z: 0 },
  max: { x: 101.6, y: 146.1, z: 13.7 },
}

describe('axis maps', () => {
  it('builds a matrix that reads the declared print axis', () => {
    expect(rotationMatrix(IDENTITY)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
    // wallX = -printZ, wallY = -printX, wallZ = +printY
    expect(rotationMatrix(FLAT_LEFT)).toEqual([
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ])
  })

  it('accepts every mapping the three Phase-1 families use', () => {
    for (const map of [IDENTITY, FLAT_LEFT, FLAT_RIGHT, SPACER]) {
      expect(determinant(map), JSON.stringify(map)).toBe(1)
      expect(isProperRotation(map)).toBe(true)
    }
  })

  it('rejects a reflection', () => {
    // Swapping two axes without a sign flip mirrors the part.
    const mirrored: AxisMap = { x: '+x', y: '+z', z: '+y' }
    expect(determinant(mirrored)).toBe(-1)
    expect(isProperRotation(mirrored)).toBe(false)
  })

  it('rejects a mapping that reads one print axis twice', () => {
    const degenerate = { x: '+x', y: '+x', z: '+y' } as AxisMap
    expect(isProperRotation(degenerate)).toBe(false)
  })

  it('maps points through the declared axes', () => {
    expect(applyAxisMap(FLAT_LEFT, { x: 1, y: 2, z: 3 })).toEqual({ x: -3, y: -1, z: 2 })
    expect(applyAxisMap(FLAT_RIGHT, { x: 1, y: 2, z: 3 })).toEqual({ x: 3, y: 1, z: 2 })
  })
})

describe('rotateBounds', () => {
  it('keeps the box axis-aligned and permutes its extents', () => {
    const rotated = rotateBounds(FLAT_LEFT, FLAT_3X0_LEFT)
    const size = boundsSize(rotated)
    // print (depth 18.7, height 85.7, thickness 13.7) -> wall (13.7, 18.7, 85.7)
    expect(size.x).toBeCloseTo(13.7, 6)
    expect(size.y).toBeCloseTo(18.7, 6)
    expect(size.z).toBeCloseTo(85.7, 6)
  })

  it('swaps the faces of a negated axis rather than inverting the box', () => {
    const rotated = rotateBounds(FLAT_RIGHT, FLAT_3X0_LEFT)
    expect(rotated.min.x).toBeLessThan(rotated.max.x)
    expect(rotated.min.y).toBeLessThan(rotated.max.y)
    expect(boundsSize(rotated)).toEqual(boundsSize(rotateBounds(FLAT_LEFT, FLAT_3X0_LEFT)))
  })
})

describe('turnedAboutZ', () => {
  it('leaves the map alone at a whole number of full turns', () => {
    expect(turnedAboutZ(FLAT_LEFT, 0)).toEqual(FLAT_LEFT)
    expect(turnedAboutZ(FLAT_LEFT, 360)).toEqual(FLAT_LEFT)
    expect(turnedAboutZ(FLAT_LEFT, -720)).toEqual(FLAT_LEFT)
  })

  it('turns a point anticlockwise seen from above', () => {
    // Standing in front of the wall looking down: +x is to the right and +y
    // runs away into the panel, so a quarter turn takes the right hand away.
    const turned = turnedAboutZ(IDENTITY, 90)
    const p = applyAxisMap(turned, { x: 1, y: 0, z: 5 })
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(1, 6)
    expect(p.z).toBeCloseTo(5, 6)
  })

  it('undoes itself, and four quarters make a whole', () => {
    expect(turnedAboutZ(turnedAboutZ(FLAT_LEFT, 90), -90)).toEqual(FLAT_LEFT)
    expect(turnedAboutZ(FLAT_LEFT, 90 * 4)).toEqual(FLAT_LEFT)
    expect(turnedAboutZ(turnedAboutZ(FLAT_LEFT, 180), 180)).toEqual(FLAT_LEFT)
  })

  it('leaves up pointing up, which is why it is the only turn offered', () => {
    for (const degrees of [90, 180, 270]) {
      expect(turnedAboutZ(FLAT_LEFT, degrees).z).toBe(FLAT_LEFT.z)
    }
  })

  it('stays a proper rotation, so a turned part is never mirrored', () => {
    for (const map of [IDENTITY, FLAT_LEFT, FLAT_RIGHT]) {
      for (const degrees of [90, 180, 270]) {
        expect(isProperRotation(turnedAboutZ(map, degrees)), `${map.x} by ${degrees}`).toBe(true)
      }
    }
  })

  it('swaps width for depth on a quarter turn and keeps both on a half', () => {
    const box: Bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 2 } }
    expect(boundsSize(rotateBounds(turnedAboutZ(IDENTITY, 90), box))).toEqual({ x: 4, y: 10, z: 2 })
    expect(boundsSize(rotateBounds(turnedAboutZ(IDENTITY, 180), box))).toEqual({ x: 10, y: 4, z: 2 })
  })

  it('refuses an angle that is not a quarter turn', () => {
    expect(() => turnedAboutZ(IDENTITY, 45)).toThrow(RangeError)
    expect(() => turnedAboutZ(IDENTITY, 1)).toThrow(/square to the panel/)
  })
})

describe('placeBounds', () => {
  const target = { x: 100, y: 0, z: 200 }

  it('lands the box exactly on the target corner', () => {
    const { bounds } = placeBounds(FLAT_3X0_LEFT, FLAT_LEFT, target)
    expect(bounds.min.x).toBeCloseTo(100, 6)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(bounds.min.z).toBeCloseTo(200, 6)
    expect(bounds.max.z).toBeCloseTo(285.7, 6)
  })

  it('is unaffected by where the part sat in the SketchUp scene', () => {
    // 1x0 Flat Left is at x=0, 3x0 Flat Left at x=82.9. Same placement.
    const shifted: Bounds = {
      min: { x: 0, y: 500, z: -20 },
      max: { x: 18.7, y: 585.7, z: -6.3 },
    }
    const a = placeBounds(FLAT_3X0_LEFT, FLAT_LEFT, target)
    const b = placeBounds(shifted, FLAT_LEFT, target)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(b.bounds.min[axis]).toBeCloseTo(a.bounds.min[axis], 6)
      expect(b.bounds.max[axis]).toBeCloseTo(a.bounds.max[axis], 6)
    }
  })

  it('produces a matrix that agrees with the bounds it reports', () => {
    const { matrix, bounds } = placeBounds(FLAT_3X0_LEFT, FLAT_LEFT, target)
    // The source corner that becomes the wall minimum must land on target.
    const corners: { x: number; y: number; z: number }[] = []
    for (const x of [FLAT_3X0_LEFT.min.x, FLAT_3X0_LEFT.max.x])
      for (const y of [FLAT_3X0_LEFT.min.y, FLAT_3X0_LEFT.max.y])
        for (const z of [FLAT_3X0_LEFT.min.z, FLAT_3X0_LEFT.max.z]) corners.push({ x, y, z })

    const mapped = corners.map((c) => applyMatrix(matrix, c))
    for (const axis of ['x', 'y', 'z'] as const) {
      const values = mapped.map((p) => p[axis])
      expect(Math.min(...values)).toBeCloseTo(bounds.min[axis], 6)
      expect(Math.max(...values)).toBeCloseTo(bounds.max[axis], 6)
    }
  })

  it('is a rigid motion — it never scales or mirrors', () => {
    const { matrix } = placeBounds(FLAT_3X0_LEFT, FLAT_RIGHT, target)
    const origin = applyMatrix(matrix, { x: 0, y: 0, z: 0 })
    for (const axis of ['x', 'y', 'z'] as const) {
      const unit = applyMatrix(matrix, { x: +(axis === 'x'), y: +(axis === 'y'), z: +(axis === 'z') })
      const d = { x: unit.x - origin.x, y: unit.y - origin.y, z: unit.z - origin.z }
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
    }
  })

  it('refuses a reflection instead of silently mirroring the part', () => {
    const mirrored: AxisMap = { x: '+x', y: '+z', z: '+y' }
    expect(() => placeBounds(FLAT_3X0_LEFT, mirrored, target)).toThrow(/not a proper rotation/)
  })
})

describe('sidepiece anchoring', () => {
  const base = {
    printToWall: FLAT_LEFT,
    thicknessMm: 13.7,
    tangWidthMm: 2.2,
    tangDepthMm: 8.5,
    depthMm: 18.7,
    bottomBelowSlotCenterMm: 14.55,
  } as const

  it('centres the tang on its slot with the body running to +x', () => {
    const slotX = slotColumnX(3)
    const origin = sidepieceOrigin({ ...base, bodyExtends: '+x' }, slotX, slotRowCenterZ(2))
    expect(origin.x).toBeCloseTo(slotX - 1.1, 6)
    expect(origin.x + 13.7).toBeCloseTo(slotX - 1.1 + 13.7, 6)
  })

  it('centres the tang on its slot with the body running to -x', () => {
    const slotX = slotColumnX(3)
    const origin = sidepieceOrigin({ ...base, bodyExtends: '-x' }, slotX, slotRowCenterZ(2))
    expect(origin.x + 13.7).toBeCloseTo(slotX + 1.1, 6)
  })

  it('leaves the span between a Left and a Right clear for the centerpiece', () => {
    // Left carries its socket on the +x face, so its body runs back to -x and
    // the span between the two slots belongs entirely to the centerpiece.
    const left = sidepieceOrigin({ ...base, bodyExtends: '-x' }, slotColumnX(1), 0)
    const right = sidepieceOrigin({ ...base, bodyExtends: '+x' }, slotColumnX(4), 0)

    const leftInnerFace = left.x + 13.7
    const rightInnerFace = right.x
    expect(leftInnerFace).toBeCloseTo(slotColumnX(1) + 1.1, 6)
    expect(rightInnerFace).toBeCloseTo(slotColumnX(4) - 1.1, 6)
    expect(rightInnerFace - leftInnerFace).toBeCloseTo(3 * 25.4 - 2.2, 6)
  })

  it('puts the body in front of the wall and the tang through it', () => {
    // Y runs into the wall, so the front face is negative and the tang, which
    // is the only part that passes through the slot, is the positive end.
    const anchor = { ...base, bodyExtends: '-x' } as const
    const origin = sidepieceOrigin(anchor, 0, 0)
    expect(origin.y).toBeCloseTo(-10.2, 6)
    expect(sidepieceFrontFaceY(anchor)).toBeCloseTo(-10.2, 6)
    expect(origin.y + base.depthMm).toBeCloseTo(8.5, 6)
  })

  it('drops the bottom edge below the slot centre by the measured offset', () => {
    const slotZ = slotRowCenterZ(4)
    const odd = sidepieceOrigin({ ...base, bodyExtends: '-x' }, 0, slotZ)
    const even = sidepieceOrigin(
      { ...base, bodyExtends: '-x', bottomBelowSlotCenterMm: 36.85 },
      0,
      slotZ,
    )
    expect(odd.z).toBeCloseTo(slotZ - 14.55, 6)
    // The parity difference is the same 22.3 that generates the height series.
    expect(odd.z - even.z).toBeCloseTo(22.3, 6)
  })
})

describe('centerpiece anchoring', () => {
  const blank = { printToWall: SPACER, bottomBelowSlotCenterMm: 11.45, frontFaceYMm: -10.2 }

  it('reaches into the socket either side when the family has tabs', () => {
    const w = 3
    const origin = centerpieceOrigin(
      { ...blank, widthMm: 25.4 * w + 5.4 },
      slotColumnX(2),
      slotRowCenterZ(1),
      w,
    )
    // Each tab overhangs its slot column by 2.7 mm.
    expect(origin.x).toBeCloseTo(slotColumnX(2) - 2.7, 6)
    expect(origin.x + 25.4 * w + 5.4).toBeCloseTo(slotColumnX(5) + 2.7, 6)
  })

  it('clears the slot columns when the family has none', () => {
    const w = 3
    const origin = centerpieceOrigin(
      { ...blank, widthMm: 25.4 * w - 2.4 },
      slotColumnX(2),
      slotRowCenterZ(1),
      w,
    )
    expect(origin.x).toBeCloseTo(slotColumnX(2) + 1.2, 6)
    expect(origin.x + 25.4 * w - 2.4).toBeCloseTo(slotColumnX(5) - 1.2, 6)
  })

  it('shares the front face of the sidepieces it sits between', () => {
    expect(centerpieceOrigin({ ...blank, widthMm: 81.6 }, 0, 0, 3).y).toBe(-10.2)
  })
})

describe('the joint the spike check confirmed', () => {
  const slotZ = slotRowCenterZ(2)
  const SIDE = {
    printToWall: FLAT_LEFT,
    thicknessMm: 13.7,
    tangWidthMm: 2.2,
    tangDepthMm: 8.5,
    depthMm: 18.7,
    bottomBelowSlotCenterMm: 14.55,
  } as const
  const FLAT_3_HEIGHT = 85.7

  it('reaches a tabbed centerpiece into the socket at each end', () => {
    const w = 3
    const left = sidepieceOrigin({ ...SIDE, bodyExtends: '-x' }, slotColumnX(1), slotZ)
    const blankWidth = 25.4 * w + 5.4
    const blank = centerpieceOrigin(
      { printToWall: SPACER, widthMm: blankWidth, bottomBelowSlotCenterMm: 11.45, frontFaceYMm: -10.2 },
      slotColumnX(1),
      slotZ,
      w,
    )

    // Each tab reaches 2.7 mm past its slot column, into the socket there.
    expect(blank.x).toBeCloseTo(slotColumnX(1) - 2.7, 6)
    expect(blank.x + blankWidth).toBeCloseTo(slotColumnX(1 + w) + 2.7, 6)

    // Front faces flush — this is what lands the tab in the groove.
    expect(blank.y).toBeCloseTo(left.y, 6)

    // Inside the sidepiece height, 6.6 mm below its top, as measured.
    const sideTop = left.z + FLAT_3_HEIGHT
    expect(blank.z).toBeGreaterThan(left.z)
    expect(sideTop - (blank.z + 76.0)).toBeCloseTo(6.6, 6)
  })

  it('keeps a tabless centerpiece clear of both sidepiece bodies', () => {
    const w = 3
    const left = sidepieceOrigin({ ...SIDE, bodyExtends: '-x' }, slotColumnX(1), slotZ)
    const right = sidepieceOrigin({ ...SIDE, bodyExtends: '+x' }, slotColumnX(1 + w), slotZ)
    const clipWidth = 25.4 * w - 2.4
    const clip = centerpieceOrigin(
      { printToWall: SPACER, widthMm: clipWidth, bottomBelowSlotCenterMm: 36.85, frontFaceYMm: -10.2 },
      slotColumnX(1),
      slotZ,
      w,
    )

    expect(clip.x).toBeGreaterThan(left.x + 13.7)
    expect(clip.x + clipWidth).toBeLessThan(right.x)
  })

  it('flags a height mismatch instead of quietly making it fit', () => {
    // Placement is permissive by design: it places the part and leaves the
    // complaint to the issues panel.
    const left = sidepieceOrigin({ ...SIDE, bodyExtends: '-x' }, slotColumnX(1), slotZ)
    const clip = centerpieceOrigin(
      { printToWall: SPACER, widthMm: 25.4 * 3 - 2.4, bottomBelowSlotCenterMm: 36.85, frontFaceYMm: -10.2 },
      slotColumnX(1),
      slotZ,
      3,
    )
    expect(clip.z).toBeLessThan(left.z)
    expect(left.z - clip.z).toBeCloseTo(22.3, 6)
  })
})
