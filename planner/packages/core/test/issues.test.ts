import { describe, expect, it } from 'vitest'
import { type IssuePart, type IssuePlacement, countByKind, findIssues } from '../src/issues'
import type { Orientation, OrientedPlacement, PlacementRule } from '../src/placement'
import type { Vec3 } from '../src/transforms'

/** Real numbers, taken from the placement rules the indexer bakes. */
const SIDEPIECE_RULE: PlacementRule = {
  occupiesColumns: 1,
  offsetFromSlotXMm: -12.6,
  frontFaceYMm: -10.2,
  bottomBelowSlotCenterMm: { odd: 14.55, even: 36.85 },
  matesByHeight: true,
}

type PartSpec = Omit<Partial<IssuePart>, 'orientations'> & {
  name: string
  placement?: PlacementRule
  sizeMm?: Partial<Vec3>
  /** Only the families that can be turned get a second entry. */
  shelf?: OrientedPlacement
}

function part(spec: PartSpec): IssuePart {
  const { placement, sizeMm, shelf, ...rest } = spec
  const flat: OrientedPlacement = {
    rule: placement ?? SIDEPIECE_RULE,
    sizeMm: { x: 13.7, y: 18.7, z: 85.7, ...sizeMm },
    rotateXDeg: 0,
  }
  return {
    h: 3,
    role: 'sidepiece',
    supported: true,
    orientations: shelf ? { flat, shelf } : { flat },
    ...rest,
  }
}

/** A centerpiece turned out of the wall plane, as the indexer bakes one. */
function asShelf(rule: Partial<PlacementRule>, sizeMm: Partial<Vec3>): OrientedPlacement {
  return {
    rule: {
      occupiesColumns: 3,
      offsetFromSlotXMm: -2.7,
      frontFaceYMm: -10.2,
      bottomBelowSlotCenterMm: { odd: -7.45, even: -7.45 },
      matesByHeight: false,
      ...rule,
    },
    sizeMm: { x: 81.6, y: 76, z: 6.15, ...sizeMm },
    rotateXDeg: -90,
  }
}

const catalog = new Map<string, IssuePart>([
  ['flat-left', part({ name: '3x0 Flat Left' })],
  [
    'flat-right',
    part({ name: '3x0 Flat Right', placement: { ...SIDEPIECE_RULE, offsetFromSlotXMm: -1.1 } }),
  ],
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
        matesByHeight: true,
      },
      sizeMm: { z: 76 },
      // 3 units deep as a shelf, so it needs a bracket reaching 84 mm.
      shelf: asShelf({ frontFaceYMm: -83.8 }, { y: 76, z: 6.15 }),
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
        matesByHeight: true,
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
  // A 2x2 L bracket reaches 58.65 mm; a 2x4 reaches 109.45.
  ['bracket-2', part({ name: '2x2 L Bracket Flat Left', h: 2, placement: { ...SIDEPIECE_RULE, frontFaceYMm: -58.65 } })],
  ['bracket-4', part({ name: '2x4 L Bracket Flat Left', h: 2, placement: { ...SIDEPIECE_RULE, frontFaceYMm: -109.45 } })],
])

const at = (
  id: string,
  partId: string,
  col: number,
  row: number,
  orientation: Orientation = 'flat',
): IssuePlacement => ({
  id,
  partId,
  col,
  row,
  orientation,
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

  it('says nothing about a part that does not mate by height', () => {
    // A Gridfinity frame is a shelf: rotated out of the wall it stands
    // 10.8 mm tall whatever its name says, so h has nothing to compare.
    const shelf = new Map(catalog)
    shelf.set(
      'gridfinity',
      part({
        name: '2x3 Gridfinity Frame 1x1',
        h: 2,
        role: 'centerpiece',
        placement: {
          occupiesColumns: 3,
          offsetFromSlotXMm: -2.7,
          frontFaceYMm: -50.6,
          bottomBelowSlotCenterMm: { odd: 5.4, even: 5.4 },
          matesByHeight: false,
        },
        sizeMm: { z: 10.8 },
      }),
    )
    const issues = findIssues(
      [at('p1', 'flat-left', 6, 4), at('p2', 'gridfinity', 7, 4), at('p3', 'flat-right', 10, 4)],
      shelf,
    )
    expect(issues.filter((i) => i.kind === 'height-mismatch')).toEqual([])
    // It still has to be mounted between something.
    expect(issues.filter((i) => i.kind === 'unmounted')).toEqual([])
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

describe('a shelf that overruns what holds it', () => {
  // A shelf drops one rib into each pocket along the arm, and an arm has one
  // pocket per inch it projects. A 3-deep shelf on a 2-deep bracket has a rib
  // hanging in the air, and the render cannot show it — the planner draws the
  // shelf where it would sit if the bracket were long enough.
  it('warns when the shelf reaches past the deepest sidepiece beside it', () => {
    const issues = findIssues(
      [at('s', 'blank-3', 4, 2, 'shelf'), at('l', 'bracket-2', 3, 2)],
      catalog,
    )
    const overrun = issues.filter((i) => i.kind === 'unsupported-shelf')
    expect(overrun).toHaveLength(1)
    expect(overrun[0]?.message).toContain('84 mm')
    expect(overrun[0]?.message).toContain('59 mm')
    expect(overrun[0]?.placementIds).toEqual(['s', 'l'])
  })

  it('says nothing when the bracket is long enough', () => {
    const issues = findIssues(
      [at('s', 'blank-3', 4, 2, 'shelf'), at('l', 'bracket-4', 3, 2)],
      catalog,
    )
    expect(issues.filter((i) => i.kind === 'unsupported-shelf')).toEqual([])
  })

  it('judges by the deepest neighbour, not by every neighbour', () => {
    // Held at one end by a bracket that reaches: not the problem this warns
    // about, which is a shelf nothing beside it can carry.
    const issues = findIssues(
      [at('s', 'blank-3', 4, 2, 'shelf'), at('l', 'bracket-2', 3, 2), at('r', 'bracket-4', 7, 2)],
      catalog,
    )
    expect(issues.filter((i) => i.kind === 'unsupported-shelf')).toEqual([])
  })

  it('leaves the same part alone when it is mounted flat', () => {
    const issues = findIssues(
      [at('s', 'blank-3', 4, 2), at('l', 'bracket-2', 3, 2)],
      catalog,
    )
    expect(issues.filter((i) => i.kind === 'unsupported-shelf')).toEqual([])
  })

  it('does not warn about a shelf with no sidepiece at all — that is unmounted', () => {
    const issues = findIssues([at('s', 'blank-3', 4, 2, 'shelf')], catalog)
    expect(issues.filter((i) => i.kind === 'unsupported-shelf')).toEqual([])
    expect(issues.filter((i) => i.kind === 'unmounted')).toHaveLength(1)
  })

  it('stops comparing a shelf to its neighbour by grid height', () => {
    // Flat, a 3-high plate beside a 2-high bracket is a mismatch worth
    // saying. As a shelf the plate's h is depth, so the comparison is
    // meaningless and matesByHeight turns it off.
    const flat = findIssues([at('s', 'blank-3', 4, 2), at('l', 'bracket-2', 3, 2)], catalog)
    expect(flat.filter((i) => i.kind === 'height-mismatch')).toHaveLength(1)

    const shelf = findIssues([at('s', 'blank-3', 4, 2, 'shelf'), at('l', 'bracket-4', 3, 2)], catalog)
    expect(shelf.filter((i) => i.kind === 'height-mismatch')).toEqual([])
  })
})

describe('countByKind', () => {
  it('counts every kind, including the zeroes', () => {
    const issues = findIssues([at('p1', 'horizontal', 6, 4)], catalog)
    expect(countByKind(issues)).toEqual({
      overlap: 0,
      'height-mismatch': 0,
      unmounted: 1,
      unsupported: 1, 'unsupported-shelf': 0,
    })
  })

  it('is all zero for a clean wall', () => {
    expect(countByKind(findIssues(goodJoint, catalog))).toEqual({
      overlap: 0,
      'height-mismatch': 0,
      unmounted: 0,
      unsupported: 0, 'unsupported-shelf': 0,
    })
  })
})
