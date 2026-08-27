/**
 * A copied selection, as text.
 *
 * A copied selection is not a new idea in this project — it is an assembly
 * that nobody named. `relativeParts` already rebases placements onto their own
 * bottom-left corner, `absoluteParts` puts them back down on an anchor, and
 * `clampGroupDelta` pulls the result onto the board. So this module adds a
 * wire format and nothing else: paste travels the same road as dropping a
 * saved assembly from the sidebar.
 *
 * It goes on the clipboard as `text/plain` JSON, which is ugly if you paste it
 * into a chat window — and that is the point. You *can* paste it into a chat
 * window, and the person who reads it can paste it back into their planner and
 * get your shelf. That is the same trade the share link already makes.
 *
 * Two things separate this from `persistence.ts`, and both follow from paste
 * being a gesture rather than a command:
 *
 *   * It carries an **origin**. A document has no need of one — it is the
 *     whole wall — but a clipping has to be able to land beside where it was
 *     taken from.
 *   * It fails as `null`, not as a reason. Clipboards hold shopping lists and
 *     stack traces; text that is not ours is the ordinary case, not an error
 *     worth telling anyone about.
 */

import { type AssemblyPart, type PlacedRef, relativeParts } from './assemblies'
import { isIndex, makeDictionary, readTriple, writeRow } from './rows'

export const CLIPBOARD_VERSION = 1

/**
 * What marks the text as ours.
 *
 * Without it, any JSON object with the right-shaped fields would be pasted
 * onto someone's wall.
 */
export const CLIPBOARD_KIND = 'ddd-wall-parts'

/** The wire form. Keys are short for the same reason the document's are. */
export interface ClipboardDocument {
  readonly v: number
  readonly k: typeof CLIPBOARD_KIND
  /** The slot the copy was taken from, as `[col, row]`. */
  readonly o: readonly [number, number]
  /** Part id dictionary; rows index into it. */
  readonly d: readonly string[]
  /** Parts as `[dictIndex, dCol, dRow, o?]`, relative to the origin. */
  readonly p: readonly (readonly number[])[]
}

/** Parts, and where they were cut from. */
export interface Clipping {
  /** Where the copy came from, so a paste can land beside rather than on it. */
  readonly origin: { readonly col: number; readonly row: number }
  readonly parts: readonly AssemblyPart[]
}

export function encodeClipping(placements: readonly PlacedRef[]): string {
  const { ids, intern } = makeDictionary()
  const parts = relativeParts(placements)

  let col = 0
  let row = 0
  if (placements.length > 0) {
    col = Math.min(...placements.map((p) => p.col))
    row = Math.min(...placements.map((p) => p.row))
  }

  const doc: ClipboardDocument = {
    v: CLIPBOARD_VERSION,
    k: CLIPBOARD_KIND,
    o: [col, row],
    d: ids,
    p: parts.map((part) => writeRow(intern(part.partId), part.dCol, part.dRow, part.orientation)),
  }
  return JSON.stringify(doc)
}

/**
 * Read a clipping, or decide the text was never one.
 *
 * Strict on the way in for the reason every clipboard reader has to be: this
 * runs against whatever the user last hit copy on, anywhere, and pasting parts
 * onto a wall because a URL happened to parse is a worse outcome than a paste
 * that does nothing.
 */
export function decodeClipping(text: string): Clipping | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const doc = raw as Record<string, unknown>

  if (doc.k !== CLIPBOARD_KIND) return null
  // A clipping from a newer planner is refused rather than guessed at, the
  // same as a document from the future.
  if (!isIndex(doc.v) || doc.v > CLIPBOARD_VERSION) return null

  const origin = doc.o
  if (!Array.isArray(origin) || origin.length !== 2 || !isIndex(origin[0]) || !isIndex(origin[1])) {
    return null
  }

  const dictionary = doc.d
  if (!Array.isArray(dictionary) || dictionary.some((id) => typeof id !== 'string')) return null
  const ids = dictionary as string[]

  const rows = doc.p
  if (!Array.isArray(rows)) return null

  const parts: AssemblyPart[] = []
  for (const row of rows) {
    const triple = readTriple(row, ids.length)
    // One bad row condemns the whole clipping. Half a paste is worse than
    // none: the user cannot see what is missing, only that what landed is
    // wrong.
    if (!triple) return null
    parts.push({
      partId: ids[triple[0]]!,
      dCol: triple[1],
      dRow: triple[2],
      orientation: triple[3],
    })
  }

  return { origin: { col: origin[0], row: origin[1] }, parts }
}
