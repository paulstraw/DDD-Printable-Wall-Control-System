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
  panelSolids,
  slotAt,
  slotColumnCount,
  slotColumnX,
  slotRowCenterZ,
  slotRowCount,
  slotRowExtentZ,
  slotSpanHeightMm,
  slots,
  slotDelta,
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

describe('panelSolids', () => {
  /** Boards chosen for their edges: the minimum, the default, an odd size,
      one whose right edge lands mid-slot, and one too small for any slot. */
  const BOARDS = [
    createBoard(4, 4),
    createBoard(32, 32),
    createBoard(13, 7),
    REFERENCE,
    { widthMm: 25.4, heightMm: 25.4 },
    { widthMm: 26.5, heightMm: 38.1 },
  ]

  const slotRects = (board: ReturnType<typeof createBoard>) =>
    slots(board).map((s) => ({
      minX: s.x - SLOT_WIDTH_MM / 2,
      maxX: s.x + SLOT_WIDTH_MM / 2,
      minZ: s.z - SLOT_HEIGHT_MM / 2,
      maxZ: s.z + SLOT_HEIGHT_MM / 2,
    }))

  const bounds = (p: { x: number; z: number; widthMm: number; heightMm: number }) => ({
    minX: p.x - p.widthMm / 2,
    maxX: p.x + p.widthMm / 2,
    minZ: p.z - p.heightMm / 2,
    maxZ: p.z + p.heightMm / 2,
  })

  const overlaps = (
    a: { minX: number; maxX: number; minZ: number; maxZ: number },
    b: { minX: number; maxX: number; minZ: number; maxZ: number },
  ) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9

  it.each(BOARDS)('stays inside the board ($widthMm × $heightMm)', (board) => {
    const pieces = panelSolids(board)
    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of pieces) {
      const b = bounds(piece)
      expect(piece.widthMm).toBeGreaterThan(0)
      expect(piece.heightMm).toBeGreaterThan(0)
      expect(b.minX).toBeGreaterThanOrEqual(-1e-9)
      expect(b.minZ).toBeGreaterThanOrEqual(-1e-9)
      expect(b.maxX).toBeLessThanOrEqual(board.widthMm + 1e-9)
      expect(b.maxZ).toBeLessThanOrEqual(board.heightMm + 1e-9)
    }
  })

  // Pairwise checks are quadratic, so they run on the smaller boards. The
  // lattice is uniform: a piece that overlapped anything would overlap here.
  const SMALL = BOARDS.filter((b) => b.widthMm * b.heightMm <= 406.4 * 812.8)

  it.each(SMALL)('never covers a slot ($widthMm × $heightMm)', (board) => {
    const pieces = panelSolids(board).map(bounds)
    for (const slot of slotRects(board)) {
      for (const piece of pieces) expect(overlaps(piece, slot)).toBe(false)
    }
  })

  it.each(SMALL)('lays no piece over another ($widthMm × $heightMm)', (board) => {
    const pieces = panelSolids(board).map(bounds)
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        expect(overlaps(pieces[i]!, pieces[j]!)).toBe(false)
      }
    }
  })

  // Disjoint, inside, and this much area between them leaves nowhere
  // uncovered: the pieces are the board less its slots, exactly.
  it.each(BOARDS)('is the board less every slot ($widthMm × $heightMm)', (board) => {
    const area = panelSolids(board).reduce((sum, p) => sum + p.widthMm * p.heightMm, 0)
    const slotArea = slots(board).length * SLOT_WIDTH_MM * SLOT_HEIGHT_MM
    expect(area).toBeCloseTo(board.widthMm * board.heightMm - slotArea, 6)
  })

  it('is one unbroken rectangle when no slot fits', () => {
    const board = { widthMm: 25.4, heightMm: 25.4 }
    expect(slots(board)).toHaveLength(0)
    expect(panelSolids(board)).toEqual([
      { x: 12.7, z: 12.7, widthMm: 25.4, heightMm: 25.4 },
    ])
  })
})

describe('slotDelta', () => {
  const at = (x: number, z: number) => ({ x, z })

  it('is zero until the pointer has travelled half a pitch', () => {
    expect(slotDelta(at(0, 0), at(12.6, 25.3))).toEqual({ dCol: 0, dRow: 0 })
    expect(slotDelta(at(0, 0), at(-12.6, -25.3))).toEqual({ dCol: 0, dRow: 0 })
  })

  it('counts a whole pitch on each axis', () => {
    expect(slotDelta(at(0, 0), at(25.4, 50.8))).toEqual({ dCol: 1, dRow: 1 })
    expect(slotDelta(at(0, 0), at(-76.2, -152.4))).toEqual({ dCol: -3, dRow: -3 })
  })

  /*
   * The whole reason this quantises the difference. Both presses are the
   * same 2 mm twitch; taking `nearestSlot` at each end would move the one
   * that began beside a column line and leave the other alone.
   */
  it('does not depend on where inside the slot the drag began', () => {
    const twitch = 2
    for (const start of [0, 5, 12, 12.6, 20, 25.3]) {
      expect(slotDelta(at(start, start), at(start + twitch, start + twitch))).toEqual({
        dCol: 0,
        dRow: 0,
      })
    }
  })

  it('is antisymmetric, so a drag back where it came from cancels', () => {
    const from = at(37, 88)
    const to = at(37 + 63, 88 - 140)
    const there = slotDelta(from, to)
    const back = slotDelta(to, from)
    expect(back).toEqual({ dCol: -there.dCol, dRow: -there.dRow })
  })
})
