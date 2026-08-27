/**
 * The saved document: one shape for autosave, for a share link, and for the
 * JSON a user exports.
 *
 * One format rather than three. A share link wants to be short and an export
 * file wants to be readable, but those are the *same* document — the only
 * difference is whether it is indented. Three encodings would be three
 * parsers, three validators, and three ways for them to disagree about what
 * a wall is.
 *
 * Part ids are interned into a dictionary because they dominate the size:
 * a placement is `[3, 6, 4]` rather than repeating a forty-character slug
 * fifty times. That is what keeps a share link paste-able.
 *
 * Everything arriving here is untrusted — a URL someone was sent, a file
 * someone edited by hand — so `decodeDocument` validates rather than trusts,
 * and returns a reason instead of throwing.
 */

import type { Assembly, AssemblyPart, PlacedRef } from './assemblies'
import { isFiniteNumber, makeDictionary, readTriple, writeRow } from './rows'

export const DOCUMENT_VERSION = 1

/** The wire form. Keys are short because they repeat. */
export interface PlannerDocument {
  /** Schema version. A document from the future is refused, not guessed at. */
  readonly v: number
  /** Wall size in inches, `[width, height]`. */
  readonly w: readonly [number, number]
  /** Part id dictionary; placements and assemblies index into it. */
  readonly d: readonly string[]
  /**
   * Placements as `[dictIndex, col, row]`, or `[dictIndex, col, row, o]`
   * where the part is not mounted flat.
   */
  readonly p: readonly (readonly number[])[]
  /** Assemblies as `[name, [[dictIndex, dCol, dRow, o?], ...]]`. */
  readonly a: readonly (readonly [string, readonly (readonly number[])[]])[]
}

export interface PlannerState {
  readonly widthIn: number
  readonly heightIn: number
  readonly placements: readonly PlacedRef[]
  readonly assemblies: readonly Assembly[]
}

export type DecodeResult =
  | { readonly ok: true; readonly state: PlannerState }
  | { readonly ok: false; readonly error: string }

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

export function toDocument(state: PlannerState): PlannerDocument {
  const { ids: dictionary, intern } = makeDictionary()

  const p = state.placements.map((placement) =>
    writeRow(intern(placement.partId), placement.col, placement.row, placement.orientation),
  )
  const a = state.assemblies.map(
    (assembly) =>
      [
        assembly.name,
        assembly.parts.map((part) =>
          writeRow(intern(part.partId), part.dCol, part.dRow, part.orientation),
        ),
      ] as const,
  )

  return { v: DOCUMENT_VERSION, w: [state.widthIn, state.heightIn], d: dictionary, p, a }
}

/**
 * `pretty` is for a file someone might open; the compact form is for a URL.
 * Same bytes either way once whitespace is removed.
 */
export function encodeDocument(state: PlannerState, options: { pretty?: boolean } = {}): string {
  return JSON.stringify(toDocument(state), null, options.pretty ? 2 : undefined)
}

/* ------------------------------------------------------------------ */
/* Decoding — everything below treats its input as hostile              */
/* ------------------------------------------------------------------ */

export function decodeDocument(text: string): DecodeResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That does not look like a saved wall — it is not valid JSON.' }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'That file does not contain a wall.' }
  }
  const doc = raw as Record<string, unknown>

  if (!isFiniteNumber(doc.v)) return { ok: false, error: 'That file has no version.' }
  if (doc.v > DOCUMENT_VERSION) {
    return {
      ok: false,
      error: `That wall was saved by a newer version of the planner (v${doc.v}).`,
    }
  }

  const wall = doc.w
  if (
    !Array.isArray(wall) ||
    wall.length !== 2 ||
    !isFiniteNumber(wall[0]) ||
    !isFiniteNumber(wall[1]) ||
    wall[0] <= 0 ||
    wall[1] <= 0
  ) {
    return { ok: false, error: 'That wall has no usable size.' }
  }

  const dictionary = doc.d
  if (!Array.isArray(dictionary) || dictionary.some((id) => typeof id !== 'string')) {
    return { ok: false, error: 'That wall has a damaged part list.' }
  }
  const ids = dictionary as string[]

  const placementsRaw = doc.p
  if (!Array.isArray(placementsRaw)) return { ok: false, error: 'That wall has no placements.' }

  const placements: PlacedRef[] = []
  for (const entry of placementsRaw) {
    const triple = readTriple(entry, ids.length)
    // One bad row means the file is not what it claims. Silently dropping it
    // would hand back a wall missing parts with no hint why.
    if (!triple) return { ok: false, error: 'That wall has a damaged placement.' }
    placements.push({
      partId: ids[triple[0]]!,
      col: triple[1],
      row: triple[2],
      orientation: triple[3],
    })
  }

  const assembliesRaw = doc.a ?? []
  if (!Array.isArray(assembliesRaw)) return { ok: false, error: 'That wall has damaged assemblies.' }

  const assemblies: Assembly[] = []
  for (const [i, entry] of assembliesRaw.entries()) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return { ok: false, error: 'That wall has a damaged assembly.' }
    }
    const [name, partsRaw] = entry as unknown[]
    if (typeof name !== 'string' || !Array.isArray(partsRaw)) {
      return { ok: false, error: 'That wall has a damaged assembly.' }
    }
    const parts: AssemblyPart[] = []
    for (const part of partsRaw) {
      const triple = readTriple(part, ids.length)
      if (!triple) return { ok: false, error: `Assembly “${name}” has a damaged part.` }
      parts.push({
        partId: ids[triple[0]]!,
        dCol: triple[1],
        dRow: triple[2],
        orientation: triple[3],
      })
    }
    assemblies.push({ id: `a${i + 1}`, name, parts })
  }

  return {
    ok: true,
    state: { widthIn: wall[0], heightIn: wall[1], placements, assemblies },
  }
}

/**
 * Which placements name a part the catalog does not have.
 *
 * Import says so out loud instead of quietly dropping them — a wall that
 * comes back three parts lighter with no explanation is worse than a wall
 * that explains itself.
 */
export function unknownPartIds(
  state: PlannerState,
  known: ReadonlySet<string>,
): string[] {
  const missing = new Set<string>()
  for (const placement of state.placements) {
    if (!known.has(placement.partId)) missing.add(placement.partId)
  }
  for (const assembly of state.assemblies) {
    for (const part of assembly.parts) if (!known.has(part.partId)) missing.add(part.partId)
  }
  return [...missing]
}

