import { describe, expect, it } from 'vitest'
import { type IssuePart, type IssuePlacement, countByKind, findIssues } from '../src/issues'

/** Real numbers, taken from the placement rules the indexer bakes. */
function part(over: Partial<IssuePart> & { name: string }): IssuePart {
  return {
    h: 3,
    role: 'sidepiece',
    supported: true,
    placement: {
      occupiesColumns: 1,
      offsetFromSlotXMm: -12.6,
      frontFaceYMm: -10.2,
      bottomBelowSlotCenterMm: { odd: 14.55, even: 36.85 },
    },
    sizeMm: { z: 85.7 },
    ...over,
  }
}

const catalog = new Map<string, IssuePart>([
  ['flat-left', part({ name: '3x0 Flat Left' })],
  ['flat-right', part({ name: '3x0 Flat Right', placement: { ...part({ name: '' }).placement, offsetFromSlotXMm: -1.1 } })],
  [
    'blank-3',
    part({
      name: '3x3 Spacer blank',
      role: 'centerpiece',
      placement: {
        occupiesColumns: 3,
        offsetFromSlotXMm: -2.7,
        frontFaceYMm: -10.2,
        bottomBelowSlotCenterMm: { odd: 11.45, even: 36.85 },
      },
      sizeMm: { z: 76 },
    }),
  ],
  [
    'blank-2',
    part({
      name: '2x3 Spacer blank',
      h: 2,
      role: 'centerpiece',
      placement: {
        occupiesColumns: 3,
        offsetFromSlotXMm: -2.7,
        frontFaceYMm: -10.2,
        bottomBelowSlotCenterMm: { odd: 11.45, even: 36.85 },
      },
      sizeMm: { z: 50.6 },
    }),
  ],
  [
    'horizontal',
    part({
      name: '3x6 Locking Spacer for horizontal Wall Control',
      role: 'centerpiece',
      supported: false,
      unsupportedReason: 'mounts to the 1/4" holes of a horizontal panel',
    }),
  ],
  ['quickhook', part({ name: 'Quickhook 3in Heavy', h: null })],
])

const at = (id: string, partId: string, col: number, row: number): IssuePlacement => ({
  id,
  partId,
  col,
  row,
})

/** The joint the whole project is built around: left, centre, right. */
const goodJoint = [
  at('p1', 'flat-left', 6, 4),
  at('p2', 'blank-3', 7, 4),
  at('p3', 'flat-right', 10, 4),
]

describe('a correct assembly raises nothing', () => {
  it('finds no issues in the canonical joint', () => {
    expect(findIssues(goodJoint, catalog)).toEqual([])
  })

  it('does not mistake interlocking for overlapping', () => {
    // The tab really does sit inside the socket; only shared slot columns
    // count as a conflict, which is why this passes without a tolerance
    // fudge on the X axis.
    const issues = findIssues(goodJoint, catalog)
    expect(issues.filter((i) => i.kind === 'overlap')).toEqual([])
  })

  it('leaves an empty wall alone', () => {
    expect(findIssues([], catalog)).toEqual([])
  })
})

describe('overlap', () => {
  it('catches two parts in the same column at the same height', () => {
    const issues = findIssues([...goodJoint, at('p4', 'flat-left', 6, 4)], catalog)
    const overlap = issues.filter((i) => i.kind === 'overlap')
    expect(overlap).toHaveLength(1)
    expect(overlap[0]?.placementIds).toEqual(['p1', 'p4'])
    expect(overlap[0]?.message).toContain('same space')
  })

  it('catches a centerpiece dropped across a sidepiece', () => {
    // A 3-wide centerpiece at col 5 covers 5,6,7 — including the flat at 6.
    const issues = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'blank-3', 5, 4)], catalog)
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(1)
  })

  it('leaves the same column alone when the heights do not meet', () => {
    // Two rows apart is a whole slot period, so nothing touches.
    const issues = findIssues([at('p1', 'flat-left', 6, 0), at('p2', 'flat-left', 6, 4)], catalog)
    expect(issues.filter((i) => i.kind === 'overlap')).toEqual([])
  })

  it('reports a pair once, not once per part', () => {
    const issues = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'flat-left', 6, 4)], catalog)
    expect(issues.filter((i) => i.kind === 'overlap')).toHaveLength(1)
  })
})

describe('height mismatch', () => {
  it('catches a short centerpiece between tall sidepieces', () => {
    const issues = findIssues(
      [at('p1', 'flat-left', 6, 4), at('p2', 'blank-2', 7, 4), at('p3', 'flat-right', 10, 4)],
      catalog,
    )
    const mismatch = issues.filter((i) => i.kind === 'height-mismatch')
    expect(mismatch).toHaveLength(2)
    expect(mismatch[0]?.message).toContain('2 high')
    expect(mismatch[0]?.message).toContain('3')
  })

  it('says nothing about two sidepieces of different heights side by side', () => {
    // Two separate hangers next to each other is not a mistake.
    const tall = new Map(catalog)
    tall.set('flat-5', part({ name: '5x0 Flat Left', h: 5, sizeMm: { z: 136.5 } }))
    const issues = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'flat-5', 7, 4)], tall)
    expect(issues.filter((i) => i.kind === 'height-mismatch')).toEqual([])
  })

  it('says nothing when the parts are not touching', () => {
    const issues = findIssues(
      [at('p1', 'flat-left', 2, 4), at('p2', 'blank-2', 7, 4), at('p3', 'flat-right', 10, 4)],
      catalog,
    )
    const mismatch = issues.filter((i) => i.kind === 'height-mismatch')
    // Only the right-hand flat touches the short centerpiece.
    expect(mismatch).toHaveLength(1)
  })

  it('says nothing across different rows', () => {
    const issues = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'blank-2', 7, 6)], catalog)
    expect(issues.filter((i) => i.kind === 'height-mismatch')).toEqual([])
  })
})

describe('unmounted', () => {
  it('flags a centerpiece with nothing to mount between', () => {
    const issues = findIssues([at('p1', 'blank-3', 7, 4)], catalog)
    const unmounted = issues.filter((i) => i.kind === 'unmounted')
    expect(unmounted).toHaveLength(1)
    expect(unmounted[0]?.message).toContain('no sidepiece beside it')
  })

  it('flags a lone sidepiece, which needs a centerpiece or a retainer', () => {
    const issues = findIssues([at('p1', 'flat-left', 6, 4)], catalog)
    const unmounted = issues.filter((i) => i.kind === 'unmounted')
    expect(unmounted).toHaveLength(1)
    expect(unmounted[0]?.message).toContain('retainer')
  })

  it('is satisfied by a partner on either side', () => {
    const left = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'blank-3', 7, 4)], catalog)
    expect(left.filter((i) => i.kind === 'unmounted')).toEqual([])
  })

  it('leaves a Quickhook alone — it is a whole hanger by itself', () => {
    const issues = findIssues([at('p1', 'quickhook', 6, 4)], catalog)
    expect(issues).toEqual([])
  })

  it('is not satisfied by a partner on another row', () => {
    const issues = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'blank-3', 7, 8)], catalog)
    expect(issues.filter((i) => i.kind === 'unmounted')).toHaveLength(2)
  })
})

describe('unsupported', () => {
  it('keeps the message short and puts the catalog paragraph in the detail', () => {
    const issues = findIssues([at('p1', 'horizontal', 6, 4)], catalog)
    const flagged = issues.filter((i) => i.kind === 'unsupported')
    expect(flagged).toHaveLength(1)
    expect(flagged[0]?.message).toContain('horizontal panel')
    // A list row cannot carry a paragraph without crowding out every other
    // issue, which is what this length cap is really guarding.
    expect(flagged[0]?.message.length).toBeLessThan(120)
    expect(flagged[0]?.detail).toBe('mounts to the 1/4\" holes of a horizontal panel')
  })

  it('leaves detail off issues that have nothing more to say', () => {
    const issues = findIssues([at('p1', 'blank-3', 7, 4)], catalog)
    expect(issues[0]?.detail).toBeUndefined()
  })
})

describe('issue identity', () => {
  it('is stable across recomputes, so a dismissal sticks', () => {
    const once = findIssues(goodJoint.slice(0, 1), catalog)
    const twice = findIssues(goodJoint.slice(0, 1), catalog)
    expect(once.map((i) => i.id)).toEqual(twice.map((i) => i.id))
  })

  it('does not depend on the order the parts were placed in', () => {
    const forward = findIssues([at('p1', 'flat-left', 6, 4), at('p2', 'flat-left', 6, 4)], catalog)
    const backward = findIssues([at('p2', 'flat-left', 6, 4), at('p1', 'flat-left', 6, 4)], catalog)
    const ids = (list: typeof forward) => list.map((i) => i.id).sort()
    expect(ids(forward)).toEqual(ids(backward))
  })

  it('gives different problems different ids', () => {
    const issues = findIssues([at('p1', 'horizontal', 6, 4)], catalog)
    expect(new Set(issues.map((i) => i.id)).size).toBe(issues.length)
  })
})

describe('robustness', () => {
  it('skips a placement whose part is not in the catalog', () => {
    const issues = findIssues([...goodJoint, at('p9', 'ghost', 20, 4)], catalog)
    expect(issues).toEqual([])
  })
})

describe('countByKind', () => {
  it('counts every kind, including the zeroes', () => {
    const issues = findIssues([at('p1', 'horizontal', 6, 4)], catalog)
    expect(countByKind(issues)).toEqual({
      overlap: 0,
      'height-mismatch': 0,
      unmounted: 1,
      unsupported: 1,
    })
  })

  it('is all zero for a clean wall', () => {
    expect(countByKind(findIssues(goodJoint, catalog))).toEqual({
      overlap: 0,
      'height-mismatch': 0,
      unmounted: 0,
      unsupported: 0,
    })
  })
})
