/**
 * What is selected on the wall, and how a selection moves.
 *
 * Selection is a *set of ids*, and single-select is just the one-element
 * case — there is no separate code path for it. That matters more than it
 * sounds: the alternative, keeping `selectedId` alongside `selectedIds`,
 * means every operation has to decide which one it trusts.
 *
 * Order is preserved. The selection is shown to the user (counts, the BOM,
 * eventually a saved assembly), and a set that reshuffles itself when you
 * add to it reads as a glitch.
 */

/** How a click combines with what is already selected. */
export type SelectMode =
  /** Plain click: this becomes the whole selection. */
  | 'replace'
  /** Shift/Cmd click: in if it was out, out if it was in. */
  | 'toggle'
  /** Add without removing — used by marquee drags. */
  | 'add'

export function applySelection(
  current: readonly string[],
  id: string,
  mode: SelectMode = 'replace',
): string[] {
  switch (mode) {
    case 'replace':
      return [id]
    case 'add':
      return current.includes(id) ? [...current] : [...current, id]
    case 'toggle':
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  }
}

/** Merge marquee hits into an existing selection, preserving order. */
export function mergeSelection(current: readonly string[], ids: readonly string[]): string[] {
  const out = [...current]
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out
}

/* ------------------------------------------------------------------ */
/* Rigid-body movement                                                 */
/* ------------------------------------------------------------------ */

export interface GridItem {
  readonly col: number
  readonly row: number
  /** Slot columns covered, defaulting to 1. */
  readonly spanCols?: number
}

export interface GridLimits {
  /** Number of slot columns on the board. */
  readonly cols: number
  /** Number of slot rows on the board. */
  readonly rows: number
}

export interface GridDelta {
  readonly dCol: number
  readonly dRow: number
}

function clampRange(value: number, lo: number, hi: number): number {
  if (lo > hi) return 0
  // `+ 0` normalises -0 away. Clamping -1 against a lower bound of -0 (a
  // group already at column 0) yields -0, which is arithmetically fine and
  // fails every `toBe(0)` a caller writes.
  return Math.min(hi, Math.max(lo, value)) + 0
}

/**
 * Reduce a nudge until the whole group fits on the board.
 *
 * The group moves as one body: if a single part is already against the left
 * edge, *nothing* moves left. Clamping each part independently would be the
 * obvious implementation and it is wrong — the group would deform, and a
 * user who nudged an assembly into a corner and back out would find it had
 * silently rearranged itself.
 *
 * A group too wide for the board cannot move on that axis at all, which is
 * the `lo > hi` case.
 */
export function clampGroupDelta(
  items: readonly GridItem[],
  delta: GridDelta,
  limits: GridLimits,
): GridDelta {
  if (items.length === 0) return { dCol: 0, dRow: 0 }

  let minCol = Infinity
  let maxRight = -Infinity
  let minRow = Infinity
  let maxRow = -Infinity

  for (const item of items) {
    const span = Math.max(1, Math.round(item.spanCols ?? 1))
    minCol = Math.min(minCol, item.col)
    maxRight = Math.max(maxRight, item.col + span - 1)
    minRow = Math.min(minRow, item.row)
    maxRow = Math.max(maxRow, item.row)
  }

  return {
    dCol: clampRange(delta.dCol, -minCol, limits.cols - 1 - maxRight),
    dRow: clampRange(delta.dRow, -minRow, limits.rows - 1 - maxRow),
  }
}

/* ------------------------------------------------------------------ */
/* Marquee                                                             */
/* ------------------------------------------------------------------ */

/** An axis-aligned rectangle on the wall face, in wall-space mm. */
export interface Rect2 {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface Point2 {
  readonly x: number
  readonly z: number
}

/** Two drag corners in any order become a normalised rectangle. */
export function rectFromCorners(a: Point2, b: Point2): Rect2 {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  }
}

export function rectArea(rect: Rect2): number {
  return (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ)
}

/**
 * Touching counts as overlapping.
 *
 * A marquee dragged exactly along a part's edge should take it; refusing on
 * an exact float match would make the gesture feel unreliable for no gain.
 */
export function rectsOverlap(a: Rect2, b: Rect2): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ
}

/** The wall-face footprint of a part placed at `origin` with size `size`. */
export function footprintRect(
  origin: { x: number; z: number },
  size: { x: number; z: number },
): Rect2 {
  return {
    minX: origin.x,
    maxX: origin.x + size.x,
    minZ: origin.z,
    maxZ: origin.z + size.z,
  }
}

/**
 * Ids whose footprint the marquee touches.
 *
 * Touch, not containment: these parts interlock, so a rectangle that fully
 * contains a sidepiece almost always clips its neighbours too, and demanding
 * containment would mean drawing a marquee far larger than the thing you
 * want.
 */
export function idsInRect(
  items: readonly { readonly id: string; readonly rect: Rect2 }[],
  marquee: Rect2,
): string[] {
  return items.filter((item) => rectsOverlap(item.rect, marquee)).map((item) => item.id)
}
