/**
 * Catalog search and faceting.
 *
 * Fuzzy rather than substring, because the names people type rarely match the
 * names in the library: "3x0 flat l" should find `3x0 Flat Left`, and
 * "m12 batt" should find `2x5_milwaukee_M12_battery_x2`.
 *
 * Nothing here ever removes a part for being unparseable. A part with no grid
 * dimensions has no facet values, so a facet filter will exclude it, but a
 * search that matches its name still finds it.
 */

/** The fields a catalog row must expose to be searchable. */
export interface Searchable {
  readonly name: string
  readonly searchKey: string
  readonly family: string
  readonly base: string
  readonly variant: string | null
  readonly h: number | null
  readonly w: number | null
}

export interface Facets {
  readonly families: readonly string[]
  readonly variants: readonly (string | null)[]
  readonly heights: readonly number[]
  readonly widths: readonly number[]
}

/**
 * Subsequence match, scored. Every character of the query has to appear in
 * order; runs of adjacent matches and matches at word starts score higher, so
 * "sb" ranks `Spacer blank` above `Spacer clip-on`.
 *
 * Returns null when the query does not match at all — distinct from a score
 * of zero, which an empty query gives.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  if (q === '') return 0

  const t = text.toLowerCase()
  let score = 0
  let at = 0
  let previousMatch = -2

  for (const char of q) {
    if (char === ' ') continue
    const found = t.indexOf(char, at)
    if (found === -1) return null

    // Adjacent to the last match, or starting a word: both are strong signals.
    if (found === previousMatch + 1) score += 8
    else if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '-') score += 6
    else score += 1

    // Earlier matches are worth slightly more than later ones.
    score += Math.max(0, 3 - found / 12)

    previousMatch = found
    at = found + 1
  }

  // A short name that matched is a better hit than a long one that also did.
  return score + Math.max(0, 20 - t.length / 4)
}

export interface FacetFilter {
  readonly families?: readonly string[]
  readonly variants?: readonly (string | null)[]
  readonly heights?: readonly number[]
  readonly widths?: readonly number[]
}

function passes<T>(selected: readonly T[] | undefined, value: T): boolean {
  if (!selected || selected.length === 0) return true
  return selected.includes(value)
}

export function matchesFacets(part: Searchable, filter: FacetFilter): boolean {
  return (
    passes(filter.families, part.family) &&
    passes(filter.variants, part.variant) &&
    passes(filter.heights, part.h as number) &&
    passes(filter.widths, part.w as number)
  )
}

/** Every facet value present in a set of parts, sorted for a stable UI. */
export function collectFacets<T extends Searchable>(parts: readonly T[]): Facets {
  const families = new Set<string>()
  const variants = new Set<string | null>()
  const heights = new Set<number>()
  const widths = new Set<number>()

  for (const part of parts) {
    families.add(part.family)
    variants.add(part.variant)
    if (part.h !== null) heights.add(part.h)
    if (part.w !== null) widths.add(part.w)
  }

  const order = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '')
  return {
    families: [...families].sort(order),
    variants: [...variants].sort(order),
    heights: [...heights].sort((a, b) => a - b),
    widths: [...widths].sort((a, b) => a - b),
  }
}

/**
 * Filter by facets, then rank what is left by the query. With no query the
 * catalog stays in its natural order rather than being shuffled by score.
 */
export function searchParts<T extends Searchable>(
  parts: readonly T[],
  query: string,
  filter: FacetFilter = {},
): T[] {
  const eligible = parts.filter((part) => matchesFacets(part, filter))
  if (query.trim() === '') return eligible

  const scored: { part: T; score: number }[] = []
  for (const part of eligible) {
    // Try both the display name and the separator-flattened key; the flattened
    // one is what lets "m12 batt" reach `2x5_milwaukee_M12_battery_x2`.
    const best = Math.max(
      fuzzyScore(query, part.name) ?? Number.NEGATIVE_INFINITY,
      fuzzyScore(query, part.searchKey) ?? Number.NEGATIVE_INFINITY,
    )
    if (best !== Number.NEGATIVE_INFINITY) scored.push({ part, score: best })
  }

  scored.sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name))
  return scored.map((s) => s.part)
}
