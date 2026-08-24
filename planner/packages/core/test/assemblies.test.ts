import { describe, expect, it } from 'vitest'
import {
  MAX_ASSEMBLY_NAME,
  absoluteParts,
  assemblyExtent,
  assemblyPartCounts,
  createAssembly,
  normaliseAssemblyName,
  relativeParts,
  uniqueAssemblyName,
} from '../src/assemblies'

// A left flat, a 3-wide blank spanning to the right, and a right flat —
// the joint the whole project is built around.
const joint = [
  { partId: 'flat-left', col: 6, row: 4 },
  { partId: 'blank-3', col: 7, row: 4 },
  { partId: 'flat-right', col: 10, row: 4 },
]

describe('relativeParts', () => {
  it('rebases onto the group corner, not the wall corner', () => {
    expect(relativeParts(joint)).toEqual([
      { partId: 'flat-left', dCol: 0, dRow: 0 },
      { partId: 'blank-3', dCol: 1, dRow: 0 },
      { partId: 'flat-right', dCol: 4, dRow: 0 },
    ])
  })

  it('gives the same answer wherever the group was built', () => {
    const moved = joint.map((p) => ({ ...p, col: p.col + 17, row: p.row + 5 }))
    expect(relativeParts(moved)).toEqual(relativeParts(joint))
  })

  it('anchors on the minimum of both axes independently', () => {
    // The leftmost part is not the lowest one.
    const stack = [
      { partId: 'a', col: 2, row: 9 },
      { partId: 'b', col: 8, row: 3 },
    ]
    expect(relativeParts(stack)).toEqual([
      { partId: 'a', dCol: 0, dRow: 6 },
      { partId: 'b', dCol: 6, dRow: 0 },
    ])
  })

  it('preserves the order the parts were given in', () => {
    const reversed = [...joint].reverse()
    expect(relativeParts(reversed).map((p) => p.partId)).toEqual([
      'flat-right',
      'blank-3',
      'flat-left',
    ])
  })

  it('keeps repeats rather than collapsing them', () => {
    const pair = [
      { partId: 'hook', col: 3, row: 3 },
      { partId: 'hook', col: 5, row: 3 },
    ]
    expect(relativeParts(pair)).toHaveLength(2)
  })

  it('handles a single part and an empty selection', () => {
    expect(relativeParts([{ partId: 'a', col: 9, row: 9 }])).toEqual([
      { partId: 'a', dCol: 0, dRow: 0 },
    ])
    expect(relativeParts([])).toEqual([])
  })
})

describe('assemblyExtent', () => {
  it('counts slots spanned, not the largest offset', () => {
    expect(assemblyExtent(relativeParts(joint))).toEqual({ cols: 5, rows: 1 })
  })

  it('is one by one for a single part', () => {
    expect(assemblyExtent([{ partId: 'a', dCol: 0, dRow: 0 }])).toEqual({ cols: 1, rows: 1 })
  })

  it('is zero by zero for nothing', () => {
    expect(assemblyExtent([])).toEqual({ cols: 0, rows: 0 })
  })
})

describe('assemblyPartCounts', () => {
  it('counts each distinct part', () => {
    const counts = assemblyPartCounts(
      relativeParts([
        { partId: 'flat-left', col: 0, row: 0 },
        { partId: 'flat-right', col: 4, row: 0 },
        { partId: 'flat-left', col: 0, row: 2 },
      ]),
    )
    expect(counts.get('flat-left')).toBe(2)
    expect(counts.get('flat-right')).toBe(1)
    expect(counts.size).toBe(2)
  })

  it('is empty for an empty assembly', () => {
    expect(assemblyPartCounts([]).size).toBe(0)
  })
})

describe('normaliseAssemblyName', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseAssemblyName('  Drill   station  ')).toBe('Drill station')
    expect(normaliseAssemblyName('a\n\tb')).toBe('a b')
  })

  it('returns null for nothing at all, rather than inventing a name', () => {
    expect(normaliseAssemblyName('')).toBeNull()
    expect(normaliseAssemblyName('   ')).toBeNull()
    expect(normaliseAssemblyName('\n\t ')).toBeNull()
  })

  it('caps the length', () => {
    const long = 'x'.repeat(200)
    expect(normaliseAssemblyName(long)).toHaveLength(MAX_ASSEMBLY_NAME)
  })

  it('leaves ordinary punctuation alone', () => {
    expect(normaliseAssemblyName('Drill & driver (v2)')).toBe('Drill & driver (v2)')
  })
})

describe('uniqueAssemblyName', () => {
  it('leaves a free name alone', () => {
    expect(uniqueAssemblyName(['a', 'b'], 'c')).toBe('c')
    expect(uniqueAssemblyName([], 'c')).toBe('c')
  })

  it('numbers a collision from 2', () => {
    expect(uniqueAssemblyName(['Drill'], 'Drill')).toBe('Drill (2)')
  })

  it('keeps counting past an existing numbered name', () => {
    expect(uniqueAssemblyName(['Drill', 'Drill (2)'], 'Drill')).toBe('Drill (3)')
  })

  it('treats case as the same name, because people do', () => {
    expect(uniqueAssemblyName(['drill station'], 'Drill Station')).toBe('Drill Station (2)')
  })

  it('does not renumber a name that only looks numbered', () => {
    expect(uniqueAssemblyName(['Shelf'], 'Shelf (2)')).toBe('Shelf (2)')
  })
})

describe('createAssembly and absoluteParts', () => {
  const assembly = createAssembly('a1', 'Drill station', joint)

  it('stores relative offsets, never the slots it was built on', () => {
    expect(assembly).toEqual({
      id: 'a1',
      name: 'Drill station',
      parts: [
        { partId: 'flat-left', dCol: 0, dRow: 0 },
        { partId: 'blank-3', dCol: 1, dRow: 0 },
        { partId: 'flat-right', dCol: 4, dRow: 0 },
      ],
    })
    expect(JSON.stringify(assembly)).not.toContain('"col"')
  })

  it('round-trips back to where it was built', () => {
    expect(absoluteParts(assembly, { col: 6, row: 4 })).toEqual(joint)
  })

  it('places anywhere else with the shape intact', () => {
    const moved = absoluteParts(assembly, { col: 0, row: 11 })
    expect(moved).toEqual([
      { partId: 'flat-left', col: 0, row: 11 },
      { partId: 'blank-3', col: 1, row: 11 },
      { partId: 'flat-right', col: 4, row: 11 },
    ])
    // Same shape, different place.
    expect(relativeParts(moved)).toEqual(assembly.parts)
  })

  it('survives an empty selection without throwing', () => {
    const empty = createAssembly('a2', 'Nothing', [])
    expect(empty.parts).toEqual([])
    expect(absoluteParts(empty, { col: 3, row: 3 })).toEqual([])
  })
})
