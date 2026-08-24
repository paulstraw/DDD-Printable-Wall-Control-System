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

/** A row that can also be ranked against what is selected. */
export interface Rankable extends Searchable {
  readonly role: 'sidepiece' | 'centerpiece'
  /** False for horizontal-panel parts, which cannot mate on this wall. */
  readonly supported: boolean
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
/* ---------------------------------------------------------------- ranking */

/** What the user is working on: the part they most recently selected. */
export interface RankContext {
  readonly role: 'sidepiece' | 'centerpiece'
  readonly h: number | null
  readonly family: string
  readonly variant: string | null
}

/**
 * How well a part goes with what is selected. Zero means no opinion.
 *
 * Ranking, never filtering — the Decisions table says compatible parts sort
 * up and *nothing is hidden*. Someone building something the library did not
 * anticipate must still be able to find every part.
 *
 * Two relationships are worth knowing about, and they are the two moves
 * anyone makes while building a hanger:
 *
 *   - the part that **mates**: the opposite role at the same height, which
 *     is a centerpiece for the sidepiece you just placed;
 *   - the part that **mirrors** it: the same family and height in the other
 *     variant, which is the Right to go with the Left.
 */
export function compatibilityScore(part: Rankable, context: RankContext): number {
  // A horizontal-panel part cannot mate with anything here, so recommending
  // one is worse than useless. No opinion, not a penalty — it keeps its place
  // in the catalog and stays findable, which is what "nothing hidden" means.
  if (!part.supported) return 0

  const sameHeight = part.h !== null && context.h !== null && part.h === context.h
  const opposite = part.role !== context.role

  let score = 0
  if (opposite && sameHeight) score += 4
  else if (opposite) score += 1

  if (
    !opposite &&
    sameHeight &&
    part.family === context.family &&
    part.variant !== context.variant
  ) {
    score += 3
  }

  if (sameHeight) score += 1
  return score
}

export function searchParts<T extends Rankable>(
  parts: readonly T[],
  query: string,
  filter: FacetFilter = {},
  context: RankContext | null = null,
): T[] {
  const eligible = parts.filter((part) => matchesFacets(part, filter))

  // With no query, compatibility is the only ordering signal there is, so it
  // does the sorting outright. `sort` is stable, so parts with nothing to
  // recommend them keep the catalog's own order.
  if (query.trim() === '') {
    if (!context) return eligible
    return [...eligible].sort(
      (a, b) => compatibilityScore(b, context) - compatibilityScore(a, context),
    )
  }

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

  // A typed query wins outright — someone who typed `flat right` wants that,
  // whatever is selected. Compatibility only breaks ties, which is where it
  // is genuinely useful: it puts the matching height first among eight
  // identically-named sizes.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (context ? compatibilityScore(b.part, context) - compatibilityScore(a.part, context) : 0) ||
      a.part.name.localeCompare(b.part.name),
  )
  return scored.map((s) => s.part)
}
