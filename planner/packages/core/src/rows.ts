/**
 * The compact row a part-at-a-slot encodes to, and the validation that reads
 * one back.
 *
 * Internal to `core` — deliberately not re-exported from `index.ts`. It exists
 * because two things now write this row: the saved document and the clipboard.
 * A copied selection *is* an assembly, so it encodes the same way an assembly
 * inside a document does, and a second encoder written to look the same would
 * eventually stop being the same.
 *
 * Everything here treats its input as hostile. A row arrives from a URL
 * someone was sent, a file someone hand-edited, or a clipboard that could hold
 * anything at all.
 */

import type { Orientation } from './placement'

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A slot index: a non-negative integer, and nothing else. */
export function isIndex(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

/**
 * Orientation codes. Absent means flat, which is what every document written
 * before shelves existed means, and what most rows still mean today.
 */
export const ORIENTATION_CODES: Record<number, Orientation> = { 0: 'flat', 1: 'shelf' }
export const CODE_FOR: Record<Orientation, number> = { flat: 0, shelf: 1 }

/** The compact form of a placement, with orientation appended only when set. */
export function writeRow(index: number, a: number, b: number, orientation: Orientation): number[] {
  // Omitting the common case is what keeps a share link the length it was:
  // a wall with no shelves encodes to exactly the bytes it did before.
  return orientation === 'flat' ? [index, a, b] : [index, a, b, CODE_FOR[orientation]]
}

export function readTriple(
  value: unknown,
  dictSize: number,
): [number, number, number, Orientation] | null {
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4)) return null
  const [id, a, b, o] = value as unknown[]
  if (!isIndex(id) || id >= dictSize) return null
  if (!isIndex(a) || !isIndex(b)) return null
  // A code this version does not know is a document from the future in
  // miniature, and gets the same treatment: refused, not guessed at.
  if (o !== undefined && (!isIndex(o) || ORIENTATION_CODES[o] === undefined)) return null
  return [id, a, b, o === undefined ? 'flat' : ORIENTATION_CODES[o as number]!]
}

/**
 * Intern part ids into a dictionary that rows index into.
 *
 * Ids dominate the size of anything holding many placements — a forty-character
 * slug repeated fifty times — so both the document and the clipboard pay for
 * each one once.
 */
export function makeDictionary(): {
  readonly ids: string[]
  intern: (partId: string) => number
} {
  const index = new Map<string, number>()
  const ids: string[] = []
  return {
    ids,
    intern(partId: string): number {
      const seen = index.get(partId)
      if (seen !== undefined) return seen
      index.set(partId, ids.length)
      ids.push(partId)
      return ids.length - 1
    },
  }
}
