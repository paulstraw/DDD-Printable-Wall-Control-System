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

import { slotColumnX, slotRowCenterZ } from './grid'
import type { Vec3 } from './transforms'

export interface PlacementRule {
  /** Slot columns the part occupies: 1 for a sidepiece, w for a centerpiece. */
  readonly occupiesColumns: number
  /** Added to the anchor slot's X to get the part's minimum corner. */
  readonly offsetFromSlotXMm: number
  /** Front face, shared between a centerpiece and its sidepieces. */
  readonly frontFaceYMm: number
  /** Drop from the engaged slot's centre to the part's bottom edge. */
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

export interface SlotRef {
  readonly col: number
  readonly row: number
}

/**
 * Parity keys off the part's own height in grid units, which is what makes
 * the 22.3 mm alternation come out right — odd and even parts engage
 * different slot phases.
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

/** The slot columns a placed part covers, for overlap checks and nudging. */
export function occupiedColumns(rule: PlacementRule, slot: SlotRef): number[] {
  const out: number[] = []
  for (let i = 0; i < Math.max(1, Math.round(rule.occupiesColumns)); i++) out.push(slot.col + i)
  return out
}
