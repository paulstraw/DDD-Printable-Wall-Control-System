/**
 * Filename parser.
 *
 * The repo carries no metadata of any kind, so everything the catalog knows
 * about a part is derived from its path and filename. Naming is mostly
 * `HxW Name Variant.stl`, but 141 community `Tool_hooks` parts use `_` and `-`
 * separators, some brackets carry fractional widths (`2x2.25`), and a handful
 * of accessories carry no dimensions at all.
 *
 * Nothing here throws and nothing is ever dropped: a part whose dimensions
 * cannot be read still gets a row in the catalog, just without facet values.
 */

export type PartVariant = 'left' | 'right' | 'center'

export const PART_VARIANTS: readonly PartVariant[] = ['left', 'right', 'center']

export interface ParsedPartName {
  /** Basename with any `.stl` extension stripped and whitespace trimmed. */
  readonly filename: string
  /**
   * Height in grid units, or null when the name carries no readable
   * dimensions. Always null or non-null together with `w`.
   */
  readonly h: number | null
  /**
   * Second dimension in grid units. Sidepieces name `height x depth`;
   * centerpieces name `height x width`. Which one this is depends on the
   * directory, not the filename — the caller decides.
   */
  readonly w: number | null
  /** Descriptive remainder, with dimensions and variant token removed. */
  readonly base: string
  /** Trailing Left/Right/Center token, which keys the socket count. */
  readonly variant: PartVariant | null
  /** Lowercased, separator-normalised whole name, for fuzzy search. */
  readonly searchKey: string
}

/**
 * Leading `HxW`, anchored, and only when followed by a separator or the end of
 * the name. The lookahead is what rejects `4x10x8mm Pin` — a 4x10x8 mm dowel
 * pin, not a 4-by-10 part — and it leaves `8mm Lock Pin` and `3-4in Dowel Cap`
 * alone too.
 */
const DIMENSIONS_RE = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?=$|[\s_-])/i

const VARIANT_BY_TOKEN: Readonly<Record<string, PartVariant>> = {
  left: 'left',
  right: 'right',
  center: 'center',
  centre: 'center',
}

function basename(pathOrFilename: string): string {
  const cut = Math.max(pathOrFilename.lastIndexOf('/'), pathOrFilename.lastIndexOf('\\'))
  return cut === -1 ? pathOrFilename : pathOrFilename.slice(cut + 1)
}

/**
 * Underscores stand in for spaces in the community parts; hyphens do not —
 * they appear inside real names (`clip-on`, `NWS 138-69-200`), so only the one
 * directly after the dimensions is treated as a separator.
 */
function toWords(text: string): string[] {
  return text.replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean)
}

export function parsePartName(pathOrFilename: string): ParsedPartName {
  const filename = basename(pathOrFilename).replace(/\.stl$/i, '').trim()

  const dims = DIMENSIONS_RE.exec(filename)
  const rest = dims ? filename.slice(dims[0].length).replace(/^[\s_-]+/, '') : filename

  const words = toWords(rest)
  const last = words.at(-1)?.toLowerCase()
  const variant = last !== undefined ? (VARIANT_BY_TOKEN[last] ?? null) : null
  if (variant !== null) words.pop()

  return {
    filename,
    h: dims ? Number.parseFloat(dims[1] as string) : null,
    w: dims ? Number.parseFloat(dims[2] as string) : null,
    base: words.join(' '),
    variant,
    searchKey: filename.replace(/[_-]/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase(),
  }
}
