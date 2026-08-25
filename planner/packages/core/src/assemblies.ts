/**
 * A saved group of parts, stored by *relative* position.
 *
 * The point of an assembly is that it can be placed again somewhere else, so
 * it cannot remember where it was — absolute slots would pin it to the
 * corner of the wall it happened to be built in. Every part records an
 * offset from the group's own bottom-left corner, and placing the assembly
 * supplies the corner.
 *
 * Slot offsets survive that translation exactly, because a part's vertical
 * anchor keys off its *own* height parity rather than the row it sits in
 * (see `bottomOffsetFor`). Move a group up one row and every part moves the
 * same 50.8 mm; nothing re-phases.
 */

import type { Orientation } from './placement'

export interface AssemblyPart {
  readonly partId: string
  /** Slot columns right of the assembly's own left edge. */
  readonly dCol: number
  /** Slot rows above the assembly's own bottom edge. */
  readonly dRow: number
  /**
   * Which way the part was mounted when the assembly was saved.
   *
   * Part of the assembly, not of the part: a shelf between two brackets and
   * the same plate hanging flat between the same two brackets are different
   * things to have built, and re-placing the group has to give back the one
   * that was saved.
   */
  readonly orientation: Orientation
}

export interface Assembly {
  readonly id: string
  readonly name: string
  readonly parts: readonly AssemblyPart[]
}

export interface PlacedRef {
  readonly partId: string
  readonly col: number
  readonly row: number
  readonly orientation: Orientation
}

/**
 * Rebase placements onto their own bottom-left corner.
 *
 * Order is preserved so a saved assembly lists its parts the way the user
 * built it.
 */
export function relativeParts(placements: readonly PlacedRef[]): AssemblyPart[] {
  if (placements.length === 0) return []

  let minCol = Infinity
  let minRow = Infinity
  for (const p of placements) {
    minCol = Math.min(minCol, p.col)
    minRow = Math.min(minRow, p.row)
  }

  return placements.map((p) => ({
    partId: p.partId,
    dCol: p.col - minCol,
    dRow: p.row - minRow,
    orientation: p.orientation,
  }))
}

/** How many slot columns and rows the assembly spans, ignoring part widths. */
export function assemblyExtent(parts: readonly AssemblyPart[]): {
  cols: number
  rows: number
} {
  if (parts.length === 0) return { cols: 0, rows: 0 }
  let maxCol = 0
  let maxRow = 0
  for (const p of parts) {
    maxCol = Math.max(maxCol, p.dCol)
    maxRow = Math.max(maxRow, p.dRow)
  }
  return { cols: maxCol + 1, rows: maxRow + 1 }
}

/** Distinct parts and how many of each — what an assembly costs to print. */
export function assemblyPartCounts(parts: readonly AssemblyPart[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of parts) counts.set(p.partId, (counts.get(p.partId) ?? 0) + 1)
  return counts
}

/**
 * Tidy a name typed into a box.
 *
 * Returns `null` rather than a default when there is nothing left, so the
 * caller decides whether to refuse the save or invent a name — quietly
 * saving an assembly called "Untitled" because someone hit Enter early is
 * the kind of helpfulness that leaves a library full of them.
 */
export function normaliseAssemblyName(raw: string): string | null {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_ASSEMBLY_NAME)
}

export const MAX_ASSEMBLY_NAME = 60

/**
 * Make a name unique against those already taken, comparing
 * case-insensitively — "Drill station" and "drill station" are the same name
 * to everyone except a computer.
 */
export function uniqueAssemblyName(existing: readonly string[], desired: string): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  if (!taken.has(desired.toLowerCase())) return desired

  for (let n = 2; ; n++) {
    const candidate = `${desired} (${n})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** Build an assembly from the placements a user had selected. */
export function createAssembly(
  id: string,
  name: string,
  placements: readonly PlacedRef[],
): Assembly {
  return { id, name, parts: relativeParts(placements) }
}

/**
 * Place an assembly with its bottom-left corner on the given slot.
 *
 * The inverse of `relativeParts`, and the reason offsets are stored at all.
 */
export function absoluteParts(
  assembly: Assembly,
  anchor: { col: number; row: number },
): PlacedRef[] {
  return assembly.parts.map((p) => ({
    partId: p.partId,
    col: anchor.col + p.dCol,
    row: anchor.row + p.dRow,
    orientation: p.orientation,
  }))
}
