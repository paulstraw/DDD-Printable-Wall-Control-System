/**
 * Where a part sits once it is dropped on a slot.
 *
 * The indexer bakes one of these into every catalog row, resolved from the
 * family rules, so the app never has to read families.json or know the
 * difference between a sidepiece and a centerpiece at placement time.
 *
 * Assets are exported already rotated into wall orientation with their
 * minimum corner at the origin, so placing one is a translation and nothing
 * more — this returns exactly that translation.
 */

import { COLUMN_PITCH_MM, slotColumnX, slotRowCenterZ } from './grid'
import type { Vec3 } from './transforms'

export interface PlacementRule {
  /**
   * How wide the part's mounting run is in grid columns: 1 for a sidepiece,
   * w for a centerpiece. Where that run lands is `occupiedBays`' business —
   * a sidepiece stands beside its slot column, not on it.
   */
  readonly occupiesColumns: number
  /** Added to the anchor slot's X to get the part's minimum corner. */
  readonly offsetFromSlotXMm: number
  /**
   * The part's front face — its minimum Y, since Y runs into the wall.
   *
   * Shared between a centerpiece and its sidepieces only when the centerpiece
   * is nothing but its mounting plate. What the two really share is the
   * plate; a centerpiece that carries something puts that in front, so a tool
   * hook's front face stands well clear of the flat holding it.
   */
  readonly frontFaceYMm: number
  /**
   * Drop from the engaged slot's centre to the part's bottom edge.
   *
   * Negative for a shelf, which sits *above* the slot centre rather than
   * below it — it is carried by the sidepiece's arm, and the arm is near the
   * top. A shelf also puts the same number in both keys: parity keys off a
   * part's height in grid units, and a shelf's `h` is its depth.
   */
  readonly bottomBelowSlotCenterMm: { readonly odd: number; readonly even: number }
  /**
   * Whether this part lines up with its neighbour by grid height.
   *
   * True for everything that hangs in the plane of the wall, where `h` is
   * both the name and the wall-space height. False for a part rotated out of
   * that plane — a Gridfinity frame is a shelf, so its `h` says how far it
   * projects and comparing it to a sidepiece's `h` would warn about the
   * wrong thing.
   */
  readonly matesByHeight: boolean
}

/**
 * Which way a part is mounted.
 *
 * Most parts have one honest answer and the catalog offers only that. A
 * flat-plate centerpiece has two: the same plate hangs in the wall plane, or
 * lies horizontal as a shelf, and the upstream README recommends both. Which
 * one a given placement is cannot be derived from the part — only the person
 * building the wall knows — so it rides on the placement rather than the
 * catalog row.
 */
export type Orientation = 'flat' | 'shelf'

/**
 * One way a part can be mounted, resolved by the indexer.
 *
 * Rotating a part changes more than its transform: its wall-space extents
 * swap, and `matesByHeight` flips, because a plate that mates by height when
 * it hangs flat does not when its `h` has become depth. Keeping all of that
 * in one record per orientation is what stops the app from having to know
 * which of a part's numbers still apply once it is turned.
 */
export interface OrientedPlacement {
  readonly rule: PlacementRule
  /** Wall-space extents in this orientation, x along the wall, z up. */
  readonly sizeMm: Vec3
  /**
   * Rotation about the wall X axis applied to the asset, in degrees.
   *
   * Assets ship with their minimum corner at the origin, in whichever pose
   * their family's axis map bakes. A plate that ships flat tips a quarter
   * turn to become a shelf, until the face carrying its ribs is underneath —
   * the face the arm pocket holds it by. A family whose map already bakes
   * the turned pose has nothing left to do and says 0.
   */
  readonly rotateXDeg: number
}

export interface SlotRef {
  readonly col: number
  readonly row: number
}

/**
 * Parity keys off the part's own height in grid units, which is what makes
 * the 22.3 mm alternation come out right — odd and even parts engage
 * different slot phases.
 *
 * A shelf has no stake in this: its `h` says how far it projects, not how
 * tall it is, so the indexer writes the same number into both keys and
 * whichever this picks is the same answer.
 */
export function bottomOffsetFor(rule: PlacementRule, heightUnits: number | null): number {
  const odd = heightUnits === null || Math.round(heightUnits) % 2 === 1
  return odd ? rule.bottomBelowSlotCenterMm.odd : rule.bottomBelowSlotCenterMm.even
}

export function placementOrigin(
  rule: PlacementRule,
  heightUnits: number | null,
  slot: SlotRef,
): Vec3 {
  return {
    x: slotColumnX(slot.col) + rule.offsetFromSlotXMm,
    y: rule.frontFaceYMm,
    z: slotRowCenterZ(slot.row) - bottomOffsetFor(rule, heightUnits),
  }
}

/**
 * The run of wall a placed part's body fills, measured in bays.
 *
 * A bay is the 25.4 mm between one slot column and the next, and it is the
 * honest unit for "who is standing where". Slot columns are not: nothing in
 * this system fills a slot column, because a slot column is where parts
 * *join*. A centerpiece's plate runs from the column it is anchored on to
 * the one `occupiesColumns` along, with only its 2.7 mm tabs reaching over
 * either line; the sidepiece at each end puts its body beside that line
 * rather than on it — a Left variant to the -x side, a Right variant to the
 * +x. Counted in columns instead, the joint the whole system is built around
 * reads as a collision at one end and a gap at the other.
 *
 * The run is `occupiesColumns` bays wide and sits where the body actually
 * is: rounding the body's centre onto the bay lattice is what picks the
 * side, which keeps this right for a Center sidepiece — two bodies' worth of
 * thickness, all of it on one side of its slot — without naming a variant.
 */
export function occupiedBays(
  placement: OrientedPlacement,
  slot: SlotRef,
): { readonly first: number; readonly last: number } {
  const width = Math.max(1, Math.round(placement.rule.occupiesColumns))
  const bodyCentreMm = placement.rule.offsetFromSlotXMm + placement.sizeMm.x / 2
  const first =
    slot.col +
    Math.round((bodyCentreMm - (width * COLUMN_PITCH_MM) / 2) / COLUMN_PITCH_MM)
  return { first, last: first + width - 1 }
}
