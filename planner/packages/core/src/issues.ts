/**
 * What is wrong with a wall — as warnings, never as refusals.
 *
 * The Decisions table settled this: placement is permissive, anything mates,
 * and mismatches surface as dismissible warnings. So nothing here blocks
 * anything. The job is to notice the four things a person building a hanger
 * would want pointed out, and to say which parts are involved so they can be
 * highlighted.
 *
 * Everything is derived from where the parts stand along the wall and how
 * tall they are, never from a part's family name. `role` comes from the
 * family archetype, which is the only honest source: `Sidepieces/Retainers`
 * is a centerpiece and a Quickhook is a sidepiece.
 */

import {
  type Orientation,
  type OrientedPlacement,
  occupiedBays,
  placementOrigin,
} from './placement'

export type IssueKind =
  /** Two parts want the same space. */
  | 'overlap'
  /** A centerpiece and the sidepiece beside it are different heights. */
  | 'height-mismatch'
  /** Nothing for a part to mount to. */
  | 'unmounted'
  /** A horizontal-panel part on a vertical wall. */
  | 'unsupported'
  /** A shelf reaching further out than anything beside it can hold. */
  | 'unsupported-shelf'

export interface Issue {
  /**
   * Stable across recomputes, so dismissing one makes it stay dismissed
   * while the situation lasts. Built from the kind and the parts involved,
   * which is exactly what "the same problem" means here.
   */
  readonly id: string
  readonly kind: IssueKind
  /** One line. Long enough to act on, short enough for a narrow panel. */
  readonly message: string
  /** The full explanation, for a tooltip. Only where there is more to say. */
  readonly detail?: string
  /** Placements to highlight; the first is the subject. */
  readonly placementIds: readonly string[]
}

export interface IssuePart {
  readonly name: string
  readonly h: number | null
  readonly role: 'sidepiece' | 'centerpiece'
  readonly supported: boolean
  readonly unsupportedReason?: string
  /**
   * Every way this part can be mounted. Rotating one changes its wall-space
   * extents and whether it mates by height at all, so the checks below read
   * the orientation the placement actually uses rather than the part's
   * default.
   */
  readonly orientations: Readonly<Partial<Record<Orientation, OrientedPlacement>>>
}

export interface IssuePlacement {
  readonly id: string
  readonly partId: string
  readonly col: number
  readonly row: number
  readonly orientation: Orientation
}

/**
 * Parts that merely touch are not overlapping. Real conflicts are whole
 * slots deep, so half a millimetre is a comfortable floor and keeps float
 * noise out of the panel.
 */
const TOUCH_TOLERANCE_MM = 0.5

interface Span {
  readonly placement: IssuePlacement
  readonly part: IssuePart
  readonly oriented: OrientedPlacement
  /** The bays the body fills — see `occupiedBays`, not the slot columns. */
  readonly firstBay: number
  readonly lastBay: number
  readonly zMin: number
  readonly zMax: number
}

function spanFor(placement: IssuePlacement, part: IssuePart): Span | null {
  // A placement naming an orientation this part does not offer is the
  // import warning's problem, the same as a placement naming a part that
  // left the catalog.
  const oriented = part.orientations[placement.orientation]
  if (!oriented) return null

  const bays = occupiedBays(oriented, placement)
  const origin = placementOrigin(oriented.rule, part.h, placement)
  return {
    placement,
    part,
    oriented,
    firstBay: bays.first,
    lastBay: bays.last,
    zMin: origin.z,
    zMax: origin.z + oriented.sizeMm.z,
  }
}

function sharesBay(a: Span, b: Span): boolean {
  return a.firstBay <= b.lastBay && b.firstBay <= a.lastBay
}

/**
 * Two sidepieces reaching for one slot.
 *
 * A tang fills its slot, so a second one has nowhere to go — and this is the
 * one conflict bays cannot see, because a Left and a Right on the same
 * column stand on opposite sides of it and share no bay at all.
 */
function sharesSlot(a: Span, b: Span): boolean {
  return (
    a.part.role === 'sidepiece' &&
    b.part.role === 'sidepiece' &&
    a.placement.col === b.placement.col
  )
}

function overlapsVertically(a: Span, b: Span): boolean {
  return (
    a.zMax - b.zMin > TOUCH_TOLERANCE_MM && b.zMax - a.zMin > TOUCH_TOLERANCE_MM
  )
}

/** Side by side with no gap: one ends in the bay before the other starts. */
function adjacent(a: Span, b: Span): boolean {
  return a.lastBay + 1 === b.firstBay || b.lastBay + 1 === a.firstBay
}

function issueId(kind: IssueKind, ids: readonly string[]): string {
  return `${kind}:${[...ids].sort().join('+')}`
}

export function findIssues(
  placements: readonly IssuePlacement[],
  parts: ReadonlyMap<string, IssuePart>,
): Issue[] {
  const spans: Span[] = []
  for (const placement of placements) {
    const part = parts.get(placement.partId)
    // A placement whose part left the catalog is the import warning's
    // problem, not this panel's.
    if (!part) continue
    const span = spanFor(placement, part)
    if (span) spans.push(span)
  }

  const issues: Issue[] = []

  for (const span of spans) {
    if (!span.part.supported) {
      issues.push({
        id: issueId('unsupported', [span.placement.id]),
        kind: 'unsupported',
        // The catalog's reason is a paragraph — right for a tooltip, wrong
        // for a list where it would crowd out every other issue.
        message: `${span.part.name} is made for a horizontal panel, so its position here means nothing`,
        ...(span.part.unsupportedReason ? { detail: span.part.unsupportedReason } : {}),
        placementIds: [span.placement.id],
      })
    }
  }

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!
      const b = spans[j]!

      if ((sharesBay(a, b) || sharesSlot(a, b)) && overlapsVertically(a, b)) {
        issues.push({
          id: issueId('overlap', [a.placement.id, b.placement.id]),
          kind: 'overlap',
          message: `${a.part.name} and ${b.part.name} want the same space`,
          placementIds: [a.placement.id, b.placement.id],
        })
        continue
      }

      // A mismatch only means anything where the two would actually mate:
      // same slot row, touching, one of each kind, and both lining up by
      // grid height in the first place. A Gridfinity shelf does not — see
      // `matesByHeight`.
      if (
        a.placement.row === b.placement.row &&
        adjacent(a, b) &&
        a.part.role !== b.part.role &&
        a.oriented.rule.matesByHeight &&
        b.oriented.rule.matesByHeight &&
        a.part.h !== null &&
        b.part.h !== null &&
        a.part.h !== b.part.h
      ) {
        const side = a.part.role === 'sidepiece' ? a : b
        const centre = a.part.role === 'sidepiece' ? b : a
        issues.push({
          id: issueId('height-mismatch', [a.placement.id, b.placement.id]),
          kind: 'height-mismatch',
          message: `${centre.part.name} is ${centre.part.h} high but ${side.part.name} is ${side.part.h} — they will not line up`,
          placementIds: [centre.placement.id, side.placement.id],
        })
      }
    }
  }

  for (const span of spans) {
    // A part with no grid height is not playing the sidepiece/centerpiece
    // game at all — a Quickhook is a complete hanger on its own.
    if (span.part.h === null) continue

    const hasPartner = spans.some(
      (other) =>
        other !== span &&
        other.placement.row === span.placement.row &&
        other.part.role !== span.part.role &&
        adjacent(span, other),
    )
    if (hasPartner) continue

    issues.push({
      id: issueId('unmounted', [span.placement.id]),
      kind: 'unmounted',
      message:
        span.part.role === 'centerpiece'
          ? `${span.part.name} has no sidepiece beside it to mount between`
          : `${span.part.name} has nothing attached — it needs a centerpiece or a retainer`,
      placementIds: [span.placement.id],
    })
  }

  // A shelf is carried by the arm of the sidepiece beside it, and an arm has
  // exactly one pocket per inch it projects. Reach further than that and the
  // last ribs have nothing under them — which is easy to do by accident and
  // impossible to see in a render, since the planner draws the shelf where it
  // would sit if the bracket were long enough.
  //
  // Compared by measured reach rather than by grid units, so it holds for the
  // fractional-width U brackets too, and names no family.
  for (const shelf of spans) {
    if (shelf.placement.orientation !== 'shelf') continue

    const neighbours = spans.filter(
      (other) =>
        other !== shelf &&
        other.part.role === 'sidepiece' &&
        other.placement.row === shelf.placement.row &&
        adjacent(shelf, other),
    )
    if (neighbours.length === 0) continue

    // The deepest neighbour is the one that decides: a shelf held at one end
    // by a bracket long enough is a different problem from one held by none.
    const deepest = Math.max(...neighbours.map((n) => -n.oriented.rule.frontFaceYMm))
    const reach = -shelf.oriented.rule.frontFaceYMm
    if (reach <= deepest + TOUCH_TOLERANCE_MM) continue

    const held = neighbours.find((n) => -n.oriented.rule.frontFaceYMm === deepest)!
    issues.push({
      id: issueId('unsupported-shelf', [shelf.placement.id, held.placement.id]),
      kind: 'unsupported-shelf',
      message: `${shelf.part.name} projects ${Math.round(reach)} mm as a shelf but ${held.part.name} only reaches ${Math.round(deepest)} mm`,
      detail:
        'A shelf drops one rib into each pocket along a sidepiece’s arm, and an arm has one pocket per inch it projects. The ribs past the end of the arm have nothing holding them.',
      placementIds: [shelf.placement.id, held.placement.id],
    })
  }

  return issues
}

/** Group the counts for a one-line summary. */
export function countByKind(issues: readonly Issue[]): Record<IssueKind, number> {
  const counts: Record<IssueKind, number> = {
    overlap: 0,
    'height-mismatch': 0,
    unmounted: 0,
    unsupported: 0,
    'unsupported-shelf': 0,
  }
  for (const issue of issues) counts[issue.kind] += 1
  return counts
}
