import { describe, expect, it } from 'vitest'
import {
  applySelection,
  clampGroupDelta,
  footprintRect,
  idsInRect,
  mergeSelection,
  rectArea,
  rectFromCorners,
  rectsOverlap,
} from '../src/selection'

describe('applySelection', () => {
  it('replaces by default, which is what a plain click means', () => {
    expect(applySelection(['a', 'b'], 'c')).toEqual(['c'])
    expect(applySelection([], 'a')).toEqual(['a'])
  })

  it('toggles in and out', () => {
    expect(applySelection(['a'], 'b', 'toggle')).toEqual(['a', 'b'])
    expect(applySelection(['a', 'b'], 'a', 'toggle')).toEqual(['b'])
    expect(applySelection(['a'], 'a', 'toggle')).toEqual([])
  })

  it('adds without ever removing', () => {
    expect(applySelection(['a'], 'b', 'add')).toEqual(['a', 'b'])
    // Re-adding is a no-op, not a duplicate.
    expect(applySelection(['a', 'b'], 'a', 'add')).toEqual(['a', 'b'])
  })

  it('preserves order, so a growing selection does not reshuffle', () => {
    let sel: string[] = []
    for (const id of ['c', 'a', 'b']) sel = applySelection(sel, id, 'toggle')
    expect(sel).toEqual(['c', 'a', 'b'])
  })

  it('never mutates the array it was given', () => {
    const before = ['a', 'b']
    applySelection(before, 'c', 'toggle')
    applySelection(before, 'a', 'add')
    expect(before).toEqual(['a', 'b'])
  })
})

describe('mergeSelection', () => {
  it('appends only what is new', () => {
    expect(mergeSelection(['a'], ['b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('handles both sides empty', () => {
    expect(mergeSelection([], [])).toEqual([])
    expect(mergeSelection([], ['a'])).toEqual(['a'])
    expect(mergeSelection(['a'], [])).toEqual(['a'])
  })
})

describe('clampGroupDelta', () => {
  const limits = { cols: 10, rows: 8 }

  it('passes a move through when the whole group fits', () => {
    const items = [
      { col: 2, row: 2 },
      { col: 4, row: 3 },
    ]
    expect(clampGroupDelta(items, { dCol: 1, dRow: -1 }, limits)).toEqual({ dCol: 1, dRow: -1 })
  })

  it('moves the group as one body rather than deforming it', () => {
    // The left part is already against the edge, so nothing moves left —
    // clamping each part on its own would squash the group instead.
    const items = [
      { col: 0, row: 3 },
      { col: 5, row: 3 },
    ]
    expect(clampGroupDelta(items, { dCol: -1, dRow: 0 }, limits).dCol).toBe(0)
    // ...and the same group still moves right freely.
    expect(clampGroupDelta(items, { dCol: 1, dRow: 0 }, limits).dCol).toBe(1)
  })

  it('reduces an over-large move to what fits instead of refusing it', () => {
    const items = [{ col: 3, row: 3 }]
    expect(clampGroupDelta(items, { dCol: -10, dRow: 0 }, limits).dCol).toBe(-3)
    expect(clampGroupDelta(items, { dCol: 99, dRow: 0 }, limits).dCol).toBe(6)
  })

  it('stops at the right edge using the span, not the anchor column', () => {
    // A 4-wide centerpiece at col 5 already reaches col 8 of 0..9.
    const items = [{ col: 5, row: 0, spanCols: 4 }]
    expect(clampGroupDelta(items, { dCol: 5, dRow: 0 }, limits).dCol).toBe(1)
    // Without the span it would wrongly allow 4 more columns.
    expect(clampGroupDelta([{ col: 5, row: 0 }], { dCol: 5, dRow: 0 }, limits).dCol).toBe(4)
  })

  it('treats a missing, zero or fractional span as one column', () => {
    const at = (spanCols: number | undefined) =>
      clampGroupDelta([{ col: 5, row: 0, spanCols }], { dCol: 9, dRow: 0 }, limits).dCol
    expect(at(undefined)).toBe(4)
    expect(at(0)).toBe(4)
    expect(at(1.4)).toBe(4)
  })

  it('clamps rows independently of columns', () => {
    const items = [{ col: 0, row: 7 }]
    expect(clampGroupDelta(items, { dCol: 3, dRow: 3 }, limits)).toEqual({ dCol: 3, dRow: 0 })
  })

  it('refuses to move a group wider than the board rather than jamming it', () => {
    const items = [{ col: 0, row: 0, spanCols: 20 }]
    expect(clampGroupDelta(items, { dCol: -1, dRow: 0 }, limits).dCol).toBe(0)
    expect(clampGroupDelta(items, { dCol: 1, dRow: 0 }, limits).dCol).toBe(0)
  })

  it('is a no-op on an empty selection', () => {
    expect(clampGroupDelta([], { dCol: 3, dRow: 3 }, limits)).toEqual({ dCol: 0, dRow: 0 })
  })

  it('survives a board with no slots at all', () => {
    const items = [{ col: 0, row: 0 }]
    expect(clampGroupDelta(items, { dCol: 1, dRow: 1 }, { cols: 0, rows: 0 })).toEqual({
      dCol: 0,
      dRow: 0,
    })
  })
})

describe('rectFromCorners', () => {
  it('normalises a drag made in any direction', () => {
    const forward = rectFromCorners({ x: 1, z: 2 }, { x: 5, z: 9 })
    const backward = rectFromCorners({ x: 5, z: 9 }, { x: 1, z: 2 })
    expect(forward).toEqual({ minX: 1, maxX: 5, minZ: 2, maxZ: 9 })
    expect(backward).toEqual(forward)
  })

  it('gives a zero-area rectangle for a click that never moved', () => {
    expect(rectArea(rectFromCorners({ x: 4, z: 4 }, { x: 4, z: 4 }))).toBe(0)
  })
})

describe('rectsOverlap', () => {
  const a = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }

  it('detects a plain overlap', () => {
    expect(rectsOverlap(a, { minX: 5, maxX: 15, minZ: 5, maxZ: 15 })).toBe(true)
  })

  it('counts a shared edge as touching', () => {
    expect(rectsOverlap(a, { minX: 10, maxX: 20, minZ: 0, maxZ: 10 })).toBe(true)
  })

  it('separates on either axis alone', () => {
    expect(rectsOverlap(a, { minX: 10.1, maxX: 20, minZ: 0, maxZ: 10 })).toBe(false)
    expect(rectsOverlap(a, { minX: 0, maxX: 10, minZ: 10.1, maxZ: 20 })).toBe(false)
  })

  it('is symmetric', () => {
    const b = { minX: 5, maxX: 15, minZ: 5, maxZ: 15 }
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a))
  })

  it('finds a rectangle fully inside another', () => {
    expect(rectsOverlap(a, { minX: 2, maxX: 3, minZ: 2, maxZ: 3 })).toBe(true)
  })
})

describe('footprintRect and idsInRect', () => {
  // Roughly a 3x0 Flat Left and a 3x3 Spacer blank beside it.
  const left = footprintRect({ x: 12.8, z: 10.85 }, { x: 13.69, z: 85.7 })
  const spacer = footprintRect({ x: 35.7, z: 13.95 }, { x: 81.6, z: 76.0 })
  const items = [
    { id: 'left', rect: left },
    { id: 'spacer', rect: spacer },
  ]

  it('builds a footprint from an origin and a size', () => {
    expect(left.minX).toBeCloseTo(12.8, 6)
    expect(left.maxX).toBeCloseTo(26.49, 6)
    expect(left.minZ).toBeCloseTo(10.85, 6)
    expect(left.maxZ).toBeCloseTo(96.55, 6)
  })

  it('takes what the marquee touches, not only what it contains', () => {
    // A band clipping the top of the flat and missing the shorter spacer.
    const marquee = { minX: 0, maxX: 200, minZ: 92, maxZ: 95 }
    expect(idsInRect(items, marquee)).toEqual(['left'])
  })

  it('takes everything when dragged across the whole wall', () => {
    expect(idsInRect(items, { minX: -1, maxX: 1000, minZ: -1, maxZ: 1000 })).toEqual([
      'left',
      'spacer',
    ])
  })

  it('takes nothing from empty space', () => {
    expect(idsInRect(items, { minX: 500, maxX: 600, minZ: 500, maxZ: 600 })).toEqual([])
  })

  it('returns ids in placement order, not hit order', () => {
    const reversed = [items[1]!, items[0]!]
    expect(idsInRect(reversed, { minX: -1, maxX: 1000, minZ: -1, maxZ: 1000 })).toEqual([
      'spacer',
      'left',
    ])
  })
})
