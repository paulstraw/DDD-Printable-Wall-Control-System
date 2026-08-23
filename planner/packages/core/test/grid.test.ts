import { describe, expect, it } from 'vitest'
import {
  COLUMN_PITCH_MM,
  HOLE_DIAMETER_MM,
  MM_PER_INCH,
  PANEL_THICKNESS_MM,
  SLOT_HEIGHT_MM,
  SLOT_ROW_PITCH_MM,
  SLOT_WIDTH_MM,
  createBoard,
  holeAt,
  holeColumnCount,
  holeColumnX,
  holeRowCount,
  holeRowZ,
  holes,
  inchesToMm,
  isSlotOnBoard,
  mmToInches,
  nearestSlot,
  slotAt,
  slotColumnCount,
  slotColumnX,
  slotRowCenterZ,
  slotRowCount,
  slotRowExtentZ,
  slotSpanHeightMm,
  slots,
} from '../src/grid'

/** The 16" × 32" panel the grid was recovered from. */
const REFERENCE = createBoard(16, 32)

describe('constants', () => {
  it('match the measured panel', () => {
    expect(MM_PER_INCH).toBe(25.4)
    expect(COLUMN_PITCH_MM).toBe(25.4)
    expect(SLOT_WIDTH_MM).toBe(2.2)
    expect(SLOT_HEIGHT_MM).toBe(25.4)
    expect(HOLE_DIAMETER_MM).toBe(6.35)
    expect(PANEL_THICKNESS_MM).toBe(1.587)
  })

  it('puts two slot rows in every vertical inch pair', () => {
    expect(SLOT_ROW_PITCH_MM).toBe(2 * MM_PER_INCH)
  })
})

describe('unit conversion', () => {
  it('round-trips', () => {
    expect(inchesToMm(16)).toBe(406.4)
    expect(mmToInches(406.4)).toBeCloseTo(16, 10)
    expect(mmToInches(inchesToMm(3.5))).toBeCloseTo(3.5, 10)
  })

  it('builds a board in millimetres', () => {
    expect(REFERENCE).toEqual({ widthMm: 406.4, heightMm: 812.8 })
  })
})

describe('feature positions', () => {
  it('places slot columns one inch in, on a one inch pitch', () => {
    expect(slotColumnX(0)).toBeCloseTo(25.4, 10)
    expect(slotColumnX(1)).toBeCloseTo(50.8, 10)
    expect(slotColumnX(14)).toBeCloseTo(381.0, 10)
  })

  it('places hole columns between the slot columns', () => {
    expect(holeColumnX(0)).toBeCloseTo(38.1, 10)
    expect(holeColumnX(1)).toBeCloseTo(63.5, 10)
    // Interleaved exactly half an inch from their neighbouring slot column.
    expect(holeColumnX(0) - slotColumnX(0)).toBeCloseTo(12.7, 10)
  })

  it('places slot rows on a two inch pitch', () => {
    expect(slotRowCenterZ(0)).toBeCloseTo(25.4, 10)
    expect(slotRowCenterZ(1)).toBeCloseTo(76.2, 10)
    expect(slotRowCenterZ(15)).toBeCloseTo(787.4, 10)
  })

  it('spans each slot row from 12.7 to 38.1 within its period', () => {
    const first = slotRowExtentZ(0)
    expect(first.minZ).toBeCloseTo(12.7, 10)
    expect(first.maxZ).toBeCloseTo(38.1, 10)
    const second = slotRowExtentZ(1)
    expect(second.minZ).toBeCloseTo(63.5, 10)
    expect(second.maxZ).toBeCloseTo(88.9, 10)
  })

  it('places holes on a one inch pitch', () => {
    expect(holeRowZ(0)).toBeCloseTo(25.4, 10)
    expect(holeRowZ(1)).toBeCloseTo(50.8, 10)
  })

  it('addresses a slot and a hole by column and row', () => {
    expect(slotAt(2, 3)).toEqual({ col: 2, row: 3, x: slotColumnX(2), z: slotRowCenterZ(3) })
    expect(holeAt(2, 3)).toEqual({ col: 2, row: 3, x: holeColumnX(2), z: holeRowZ(3) })
  })
})

describe('board bounds', () => {
  it('gives the reference panel its measured feature counts', () => {
    expect(slotColumnCount(REFERENCE)).toBe(15)
    expect(slotRowCount(REFERENCE)).toBe(16)
    expect(holeColumnCount(REFERENCE)).toBe(15)
    expect(holeRowCount(REFERENCE)).toBe(31)
  })

  it('leaves the reference panel a one inch unslotted border left and right', () => {
    const last = slotColumnX(slotColumnCount(REFERENCE) - 1)
    expect(slotColumnX(0)).toBeCloseTo(MM_PER_INCH, 10)
    expect(REFERENCE.widthMm - last).toBeCloseTo(MM_PER_INCH, 10)
  })

  it('excludes features that would overhang the edge', () => {
    // One slot column needs its full 2.2 mm width inside the board.
    expect(slotColumnCount({ widthMm: 26.4, heightMm: 100 })).toBe(0)
    expect(slotColumnCount({ widthMm: 26.5, heightMm: 100 })).toBe(1)
    // One slot row needs its full 25.4 mm height inside the board.
    expect(slotRowCount({ widthMm: 100, heightMm: 38.0 })).toBe(0)
    expect(slotRowCount({ widthMm: 100, heightMm: 38.1 })).toBe(1)
  })

  it('reports nothing for a board too small to hold a feature', () => {
    const tiny = { widthMm: 10, heightMm: 10 }
    expect(slotColumnCount(tiny)).toBe(0)
    expect(slotRowCount(tiny)).toBe(0)
    expect(holeColumnCount(tiny)).toBe(0)
    expect(holeRowCount(tiny)).toBe(0)
    expect(slots(tiny)).toEqual([])
    expect(holes(tiny)).toEqual([])
  })

  it('enumerates every slot and hole on the board', () => {
    expect(slots(REFERENCE)).toHaveLength(15 * 16)
    expect(holes(REFERENCE)).toHaveLength(15 * 31)
    expect(slots(REFERENCE)[0]).toEqual(slotAt(0, 0))
    expect(slots(REFERENCE).at(-1)).toEqual(slotAt(14, 15))
  })

  it('keeps every enumerated slot inside the board', () => {
    for (const slot of slots(REFERENCE)) {
      expect(slot.x - SLOT_WIDTH_MM / 2).toBeGreaterThanOrEqual(0)
      expect(slot.x + SLOT_WIDTH_MM / 2).toBeLessThanOrEqual(REFERENCE.widthMm)
      expect(slot.z - SLOT_HEIGHT_MM / 2).toBeGreaterThanOrEqual(0)
      expect(slot.z + SLOT_HEIGHT_MM / 2).toBeLessThanOrEqual(REFERENCE.heightMm)
    }
  })

  it('tests membership by column and row', () => {
    expect(isSlotOnBoard(REFERENCE, 0, 0)).toBe(true)
    expect(isSlotOnBoard(REFERENCE, 14, 15)).toBe(true)
    expect(isSlotOnBoard(REFERENCE, 15, 0)).toBe(false)
    expect(isSlotOnBoard(REFERENCE, 0, 16)).toBe(false)
    expect(isSlotOnBoard(REFERENCE, -1, 0)).toBe(false)
    expect(isSlotOnBoard(REFERENCE, 0.5, 0)).toBe(false)
  })
})

describe('nearestSlot', () => {
  it('snaps a point to the slot it sits on', () => {
    expect(nearestSlot(REFERENCE, 25.4, 25.4)).toEqual(slotAt(0, 0))
    expect(nearestSlot(REFERENCE, 30, 30)).toEqual(slotAt(0, 0))
    expect(nearestSlot(REFERENCE, 78, 80)).toEqual(slotAt(2, 1))
  })

  it('rounds to the nearer column and row', () => {
    // Midway between column 0 (25.4) and column 1 (50.8).
    expect(nearestSlot(REFERENCE, 37.9, 25.4)?.col).toBe(0)
    expect(nearestSlot(REFERENCE, 38.3, 25.4)?.col).toBe(1)
    // Midway between row 0 (25.4) and row 1 (76.2).
    expect(nearestSlot(REFERENCE, 25.4, 50.7)?.row).toBe(0)
    expect(nearestSlot(REFERENCE, 25.4, 51.0)?.row).toBe(1)
  })

  it('clamps a drag that overshoots the board', () => {
    expect(nearestSlot(REFERENCE, -500, -500)).toEqual(slotAt(0, 0))
    expect(nearestSlot(REFERENCE, 5000, 5000)).toEqual(slotAt(14, 15))
  })

  it('returns null when the board holds no slots', () => {
    expect(nearestSlot({ widthMm: 10, heightMm: 10 }, 5, 5)).toBeNull()
  })
})

describe('slotSpanHeightMm', () => {
  it('measures bottom of the lowest slot to top of the highest', () => {
    expect(slotSpanHeightMm(1)).toBeCloseTo(25.4, 10)
    expect(slotSpanHeightMm(2)).toBeCloseTo(76.2, 10)
    expect(slotSpanHeightMm(3)).toBeCloseTo(127.0, 10)
  })

  it('rejects a non-positive or fractional count', () => {
    expect(() => slotSpanHeightMm(0)).toThrow(RangeError)
    expect(() => slotSpanHeightMm(-1)).toThrow(RangeError)
    expect(() => slotSpanHeightMm(1.5)).toThrow(RangeError)
  })
})

describe('cross-check: the Flats series', () => {
  // Measured bounding-box heights of Sidepieces/Flats, 1x0 through 5x0.
  const MEASURED_MM = [34.9, 57.2, 85.7, 108.0, 136.5]

  // Family knowledge, not grid knowledge — the lip a Flat adds beyond the
  // slots it engages. Odd sizes start and end in a slot band; even sizes run
  // one extra 22.3 mm into the adjacent gap band without engaging it.
  // These two numbers belong in data/families.json when that task lands.
  const FLATS_LIP_ODD_MM = 9.5
  const FLATS_LIP_EVEN_MM = 31.8

  it('derives all five heights from the slot period and slot height', () => {
    const derived = MEASURED_MM.map((_, i) => {
      const units = i + 1
      const slotsEngaged = Math.ceil(units / 2)
      const lip = units % 2 === 1 ? FLATS_LIP_ODD_MM : FLATS_LIP_EVEN_MM
      return slotSpanHeightMm(slotsEngaged) + lip
    })

    expect(derived).toHaveLength(MEASURED_MM.length)
    derived.forEach((value, i) => expect(value).toBeCloseTo(MEASURED_MM[i] as number, 6))
  })

  it('grows by alternating 22.3 and 28.5, summing to one slot period', () => {
    const steps = MEASURED_MM.slice(1).map((h, i) => h - (MEASURED_MM[i] as number))
    expect(steps[0]).toBeCloseTo(22.3, 6)
    expect(steps[1]).toBeCloseTo(28.5, 6)
    expect(steps[2]).toBeCloseTo(22.3, 6)
    expect(steps[3]).toBeCloseTo(28.5, 6)
    expect((steps[0] as number) + (steps[1] as number)).toBeCloseTo(SLOT_ROW_PITCH_MM, 6)
  })
})
