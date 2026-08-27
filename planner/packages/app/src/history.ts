/**
 * Undo and redo, as two stacks of moments.
 *
 * A *moment* is the wall as it stood at one instant: the parts, the board
 * they stand on, and what was in hand. History remembers moments, not
 * actions — there is no inverse operation to write, so a new action cannot
 * quietly arrive with a wrong one attached.
 *
 * Deliberately not `PlannerState`. The document form drops placement ids,
 * and every id in this app is load-bearing: `PlacedParts` keys each model on
 * one, the selection names them, and a dismissed issue's id is built from
 * them. A moment that re-issued ids would restore a wall where every part is
 * a *different* part — remounting every model, orphaning the selection, and
 * reviving warnings the user had already waved away.
 *
 * Moments are cheap because they share. Every mutation in the store builds a
 * new array and leaves untouched placements as the same objects, so a
 * hundred moments of a five-hundred-part wall are a hundred pointers plus
 * the handful of parts that actually changed.
 */

import type { Placement } from './store'

export interface Moment {
  /**
   * The board's size travels with the moment even though resizing the wall
   * does not itself make one. Otherwise undoing an import would hand back
   * your parts on the *imported* wall's dimensions — a 32×32 board that had
   * quietly become 48×24, with nothing to say why.
   */
  readonly widthIn: number
  readonly heightIn: number
  readonly placements: readonly Placement[]
  /**
   * What was selected at this instant — which, for a recorded moment, means
   * *before* the action that replaced it.
   *
   * That is what makes undoing a delete hand the parts back already
   * selected, ready to be nudged somewhere better: at the instant before the
   * delete, those were exactly the parts in hand. Nudge and turn fall out
   * the same way, with no diffing.
   */
  readonly selectedIds: readonly string[]
}

export interface History {
  /** Moments to step back through, oldest first. */
  readonly past: readonly Moment[]
  /** Moments stepped out of, the most recently abandoned last. */
  readonly future: readonly Moment[]
}

export const EMPTY_HISTORY: History = { past: [], future: [] }

/**
 * How far back undo reaches.
 *
 * A moment is nearly free, but "nearly free" times "unbounded" is still
 * unbounded, and nobody walks back a hundred steps.
 */
export const HISTORY_LIMIT = 100

export function canUndo(history: History): boolean {
  return history.past.length > 0
}

export function canRedo(history: History): boolean {
  return history.future.length > 0
}

/**
 * Remember the moment an action is about to replace.
 *
 * Recording drops the future: once you edit from here, what was on the redo
 * stack belongs to a wall that no longer exists. Linear history, no
 * branching — a redo stack that survived an edit would offer to restore a
 * state that never followed from this one.
 */
export function record(history: History, before: Moment): History {
  const past = [...history.past, before]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  }
}

/**
 * Step back, given where we are now.
 *
 * `present` becomes the redo entry, so redo restores the selection you had
 * at the moment you pressed undo rather than some older one.
 *
 * Returns `null` when there is nothing to undo, rather than an unchanged
 * history and the present moment — a caller that wrote that back would clear
 * a live drag's worth of state for no reason.
 */
export function undo(
  history: History,
  present: Moment,
): { history: History; moment: Moment } | null {
  const moment = history.past[history.past.length - 1]
  if (moment === undefined) return null
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, present] },
    moment,
  }
}

/**
 * Step forward. The mirror of `undo`, and the reason neither needs a cap:
 * redo can only ever put back a moment undo took off, so `past` cannot grow
 * past `HISTORY_LIMIT` this way.
 */
export function redo(
  history: History,
  present: Moment,
): { history: History; moment: Moment } | null {
  const moment = history.future[history.future.length - 1]
  if (moment === undefined) return null
  return {
    history: { past: [...history.past, present], future: history.future.slice(0, -1) },
    moment,
  }
}
