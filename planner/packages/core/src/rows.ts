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

/**
 * The compact form of a placement: `[index, a, b]`, with orientation appended
 * only when it is not flat, and a color after that only when the part has
 * been painted.
 *
 * `color` is an index into the document's color dictionary, not a hex
 * string — the same trick the part ids use, and for the same reason. A wall
 * painted in three colors pays for those three strings once instead of once
 * per part.
 *
 * Absent means unpainted, which is not the same as painted the default
 * color: an unpainted part follows the wall's default and repaints when the
 * default changes, and that is the whole of the color model in one sentence.
 */
export function writeRow(
  index: number,
  a: number,
  b: number,
  orientation: Orientation,
  color: number | null = null,
): number[] {
  // Omitting the common case is what keeps a share link the length it was: a
  // wall with no shelves and no paint encodes to exactly the bytes it did
  // before colors existed, which is the point of doing it this way round.
  if (color === null) {
    return orientation === 'flat' ? [index, a, b] : [index, a, b, CODE_FOR[orientation]]
  }
  // A color has to sit in the fifth slot, so the fourth cannot be skipped
  // even when it is flat. Position is the only thing telling these apart.
  return [index, a, b, CODE_FOR[orientation], color]
}

export function readTriple(
  value: unknown,
  dictSize: number,
  colorCount: number,
): [number, number, number, Orientation, number | null] | null {
  const lengths = [3, 4, 5]
  if (!Array.isArray(value) || !lengths.includes(value.length)) return null
  const [id, a, b, o, c] = value as unknown[]
  if (!isIndex(id) || id >= dictSize) return null
  if (!isIndex(a) || !isIndex(b)) return null
  // A code this version does not know is a document from the future in
  // miniature, and gets the same treatment: refused, not guessed at.
  if (o !== undefined && (!isIndex(o) || ORIENTATION_CODES[o] === undefined)) return null
  // A color index pointing past the end of the dictionary is the same kind of
  // damage as an unknown orientation, and earns the same answer. Guessing
  // would mean painting a part a color nobody chose.
  if (c !== undefined && (!isIndex(c) || c >= colorCount)) return null
  return [
    id,
    a,
    b,
    o === undefined ? 'flat' : ORIENTATION_CODES[o as number]!,
    c === undefined ? null : (c as number),
  ]
}

/**
 * Intern repeated strings into a dictionary that rows index into.
 *
 * Written for part ids, which dominate the size of anything holding many
 * placements — a forty-character slug repeated fifty times — so both the
 * document and the clipboard pay for each one once. Colors want exactly the
 * same treatment for exactly the same reason, so they use exactly the same
 * thing; nothing here was ever specific to ids beyond the parameter name.
 */
export function makeDictionary(): {
  readonly ids: string[]
  intern: (value: string) => number
} {
  const index = new Map<string, number>()
  const ids: string[] = []
  return {
    ids,
    intern(value: string): number {
      const seen = index.get(value)
      if (seen !== undefined) return seen
      index.set(value, ids.length)
      ids.push(value)
      return ids.length - 1
    },
  }
}
