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
import { DEFAULT_COLORS, type WallColors, isDefaultColors, isHexColor } from './colors'
import { isFiniteNumber, makeDictionary, readTriple, writeRow } from './rows'

/**
 * 2 added colors. A v1 document still decodes — it simply says nothing about
 * color, and nothing is exactly what the defaults mean.
 *
 * The bump costs one thing, knowingly: a build cached before this change
 * refuses every v2 link, including links to walls nobody recolored. Writing
 * v1 for an uncolored wall would have avoided that, at the price of a
 * document whose version depends on its contents.
 */
export const DOCUMENT_VERSION = 2

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
  /**
   * Color dictionary; painted rows index into it. Absent when nothing on the
   * wall was painted, which is most walls.
   */
  readonly c?: readonly string[]
  /**
   * The wall's own colors, `[background, panel, parts]` — positional for the
   * same reason `w` is. Absent when they are the defaults, so a wall nobody
   * recolored carries no trace of the feature.
   */
  readonly s?: readonly [string, string, string]
}

export interface PlannerState {
  readonly widthIn: number
  readonly heightIn: number
  readonly placements: readonly PlacedRef[]
  readonly assemblies: readonly Assembly[]
  /**
   * Always present, even for a document that never mentioned them — a decoded
   * wall should not make every reader work out what "unset" looks like.
   */
  readonly colors: WallColors
}

export type DecodeResult =
  | { readonly ok: true; readonly state: PlannerState }
  | { readonly ok: false; readonly error: string }

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

export function toDocument(state: PlannerState): PlannerDocument {
  const { ids: dictionary, intern } = makeDictionary()
  // A second dictionary, for the same reason as the first: a wall painted in
  // three colors should pay for three strings, not one per part.
  const { ids: colors, intern: internColor } = makeDictionary()
  const paint = (color: string | undefined) => (color === undefined ? null : internColor(color))

  const p = state.placements.map((placement) =>
    writeRow(
      intern(placement.partId),
      placement.col,
      placement.row,
      placement.orientation,
      paint(placement.color),
    ),
  )
  const a = state.assemblies.map(
    (assembly) =>
      [
        assembly.name,
        assembly.parts.map((part) =>
          writeRow(intern(part.partId), part.dCol, part.dRow, part.orientation, paint(part.color)),
        ),
      ] as const,
  )

  // Both color keys are omitted when they have nothing to say, and they come
  // last, so an uncolored wall serialises to the same keys in the same order
  // it always did — only the version number moves.
  return {
    v: DOCUMENT_VERSION,
    w: [state.widthIn, state.heightIn],
    d: dictionary,
    p,
    a,
    ...(colors.length > 0 ? { c: colors } : {}),
    ...(isDefaultColors(state.colors)
      ? {}
      : { s: [state.colors.background, state.colors.panel, state.colors.parts] as const }),
  }
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

  // Validated up front rather than row by row, so a document naming a color
  // that is not one says so once instead of once per part that used it.
  const colorsRaw = doc.c ?? []
  if (!Array.isArray(colorsRaw) || !colorsRaw.every(isHexColor)) {
    return { ok: false, error: 'That wall has a damaged color list.' }
  }
  const colors = colorsRaw as string[]

  const wallColors = readWallColors(doc.s)
  if (wallColors === null) return { ok: false, error: 'That wall has damaged colors.' }

  const placementsRaw = doc.p
  if (!Array.isArray(placementsRaw)) return { ok: false, error: 'That wall has no placements.' }

  const placements: PlacedRef[] = []
  for (const entry of placementsRaw) {
    const triple = readTriple(entry, ids.length, colors.length)
    // One bad row means the file is not what it claims. Silently dropping it
    // would hand back a wall missing parts with no hint why.
    if (!triple) return { ok: false, error: 'That wall has a damaged placement.' }
    placements.push({
      partId: ids[triple[0]]!,
      col: triple[1],
      row: triple[2],
      orientation: triple[3],
      // Spread rather than `color: undefined`, so an unpainted placement has
      // no key at all and compares equal to one built by hand.
      ...(triple[4] === null ? {} : { color: colors[triple[4]]! }),
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
      const triple = readTriple(part, ids.length, colors.length)
      if (!triple) return { ok: false, error: `Assembly “${name}” has a damaged part.` }
      parts.push({
        partId: ids[triple[0]]!,
        dCol: triple[1],
        dRow: triple[2],
        orientation: triple[3],
        ...(triple[4] === null ? {} : { color: colors[triple[4]]! }),
      })
    }
    assemblies.push({ id: `a${i + 1}`, name, parts })
  }

  return {
    ok: true,
    state: { widthIn: wall[0], heightIn: wall[1], placements, assemblies, colors: wallColors },
  }
}

/**
 * The three wall colors, or the defaults when the document says nothing.
 *
 * `null` is damage, not absence: a document that bothered to write `s` and got
 * it wrong is a document that has been edited by something that did not
 * understand it, and the rest of it is no more trustworthy than that field.
 */
function readWallColors(value: unknown): WallColors | null {
  if (value === undefined) return DEFAULT_COLORS
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isHexColor)) return null
  const [background, panel, parts] = value as [string, string, string]
  return { background, panel, parts }
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

