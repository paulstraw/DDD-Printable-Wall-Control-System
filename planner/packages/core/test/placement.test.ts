import { describe, expect, it } from 'vitest'
import { slotColumnX, slotRowCenterZ } from '../src/grid'
import {
  type PlacementRule,
  bottomOffsetFor,
  occupiedColumns,
  placementOrigin,
} from '../src/placement'

/** A 3x0 Flat Left, as the indexer bakes it. */
const FLAT_LEFT: PlacementRule = {
  occupiesColumns: 1,
  offsetFromSlotXMm: 1.1 - 13.7,
  frontFaceYMm: -10.2,
  bottomBelowSlotCenterMm: { odd: 14.55, even: 36.85 },
  matesByHeight: true,
}

/** A 3x3 Spacer blank: 25.4*3 + 5.4 wide, centred on its three columns. */
const BLANK_3: PlacementRule = {
  occupiesColumns: 3,
  offsetFromSlotXMm: -2.7,
  frontFaceYMm: -10.2,
  bottomBelowSlotCenterMm: { odd: 11.45, even: 36.85 },
  matesByHeight: true,
}

describe('placementOrigin', () => {
  it('offsets from the slot it was dropped on', () => {
    const origin = placementOrigin(FLAT_LEFT, 3, { col: 2, row: 4 })
    expect(origin.x).toBeCloseTo(slotColumnX(2) - 12.6, 6)
    expect(origin.y).toBeCloseTo(-10.2, 6)
    expect(origin.z).toBeCloseTo(slotRowCenterZ(4) - 14.55, 6)
  })

  it('reaches a tabbed centerpiece past its first column', () => {
    const origin = placementOrigin(BLANK_3, 3, { col: 2, row: 4 })
    expect(origin.x).toBeCloseTo(slotColumnX(2) - 2.7, 6)
  })

  it('shares the front face across kinds', () => {
    expect(placementOrigin(FLAT_LEFT, 3, { col: 0, row: 0 }).y).toBe(
      placementOrigin(BLANK_3, 3, { col: 0, row: 0 }).y,
    )
  })

  it('moves by exactly one slot pitch per column and row', () => {
    const a = placementOrigin(FLAT_LEFT, 3, { col: 2, row: 4 })
    const b = placementOrigin(FLAT_LEFT, 3, { col: 3, row: 5 })
    expect(b.x - a.x).toBeCloseTo(25.4, 6)
    expect(b.z - a.z).toBeCloseTo(50.8, 6)
  })
})

describe('parity', () => {
  it('keys off the part height, not the slot row', () => {
    expect(bottomOffsetFor(FLAT_LEFT, 3)).toBe(14.55)
    expect(bottomOffsetFor(FLAT_LEFT, 4)).toBe(36.85)
    // The same 22.3 that generates the Flats height series.
    expect(bottomOffsetFor(FLAT_LEFT, 4) - bottomOffsetFor(FLAT_LEFT, 3)).toBeCloseTo(22.3, 6)
  })

  it('falls back to the odd rule for a part with no dimensions', () => {
    expect(bottomOffsetFor(FLAT_LEFT, null)).toBe(14.55)
  })

  it('rounds a fractional height before testing parity', () => {
    expect(bottomOffsetFor(FLAT_LEFT, 2.25)).toBe(36.85)
  })
})

describe('occupiedColumns', () => {
  it('gives one column to a sidepiece', () => {
    expect(occupiedColumns(FLAT_LEFT, { col: 5, row: 0 })).toEqual([5])
  })

  it('gives a centerpiece the span it covers', () => {
    expect(occupiedColumns(BLANK_3, { col: 5, row: 0 })).toEqual([5, 6, 7])
  })

  it('never returns an empty span', () => {
    const degenerate = { ...FLAT_LEFT, occupiesColumns: 0 }
    expect(occupiedColumns(degenerate, { col: 1, row: 0 })).toEqual([1])
  })
})
