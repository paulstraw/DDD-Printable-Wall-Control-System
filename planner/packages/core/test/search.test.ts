import { describe, expect, it } from 'vitest'
import {
  type Rankable,
  collectFacets,
  compatibilityScore,
  fuzzyScore,
  matchesFacets,
  searchParts,
} from '../src/search'

function part(name: string, over: Partial<Rankable> = {}): Rankable {
  return {
    name,
    searchKey: name.toLowerCase().replace(/[_-]/g, ' '),
    family: 'sidepieces/flats',
    base: name,
    variant: null,
    role: 'sidepiece',
    supported: true,
    h: 3,
    w: 0,
    ...over,
  }
}

const LIBRARY: Rankable[] = [
  part('3x0 Flat Left', { variant: 'left' }),
  part('3x0 Flat Right', { variant: 'right' }),
  part('3x0 Flat Center', { variant: 'center' }),
  part('1x1 Spacer blank', { family: 'centerpieces/spacer_blank', role: 'centerpiece', h: 1, w: 1 }),
  part('3x3 Spacer blank', { family: 'centerpieces/spacer_blank', role: 'centerpiece', h: 3, w: 3 }),
  part('3x3 Spacer clip-on', { family: 'centerpieces/spacer_clip-on', role: 'centerpiece', h: 3, w: 3 }),
  part('2x5_milwaukee_M12_battery_x2', {
    family: 'centerpieces/tool_hooks',
    role: 'centerpiece',
    h: 2,
    w: 5,
    searchKey: '2x5 milwaukee m12 battery x2',
  }),
  part('Quickhook Retainer', { family: 'quickhooks', h: null, w: null }),
]

describe('fuzzyScore', () => {
  it('matches a subsequence, not just a substring', () => {
    expect(fuzzyScore('flt', 'Flat Left')).not.toBeNull()
    expect(fuzzyScore('3x0fl', '3x0 Flat Left')).not.toBeNull()
  })

  it('returns null when a character is missing', () => {
    expect(fuzzyScore('zq', 'Flat Left')).toBeNull()
  })

  it('requires the characters in order', () => {
    expect(fuzzyScore('tal', 'Flat')).toBeNull()
    expect(fuzzyScore('fla', 'Flat')).not.toBeNull()
  })

  it('scores an empty query as neutral rather than as no match', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
    expect(fuzzyScore('   ', 'anything')).toBe(0)
  })

  it('rewards adjacent runs over scattered hits', () => {
    const run = fuzzyScore('flat', 'Flat Left') as number
    const scattered = fuzzyScore('flat', 'Fine Large Angle Tray') as number
    expect(run).toBeGreaterThan(scattered)
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('FLAT', 'flat left')).toEqual(fuzzyScore('flat', 'Flat Left'))
  })
})

describe('searchParts', () => {
  it('returns everything for an empty query, in the original order', () => {
    expect(searchParts(LIBRARY, '')).toEqual(LIBRARY)
  })

  it('finds a part by an abbreviated query', () => {
    const hits = searchParts(LIBRARY, 'flat l')
    expect(hits[0]?.name).toBe('3x0 Flat Left')
  })

  it('reaches through the underscores of a community part', () => {
    const hits = searchParts(LIBRARY, 'm12 batt')
    expect(hits.map((h) => h.name)).toContain('2x5_milwaukee_M12_battery_x2')
  })

  it('keeps every part a broad query matches', () => {
    const hits = searchParts(LIBRARY, 'spacer').map((h) => h.name)
    expect(hits).toContain('1x1 Spacer blank')
    expect(hits).toContain('3x3 Spacer blank')
    expect(hits).toContain('3x3 Spacer clip-on')
  })

  it('narrows as the query gets more specific', () => {
    // `clip-on` has no `b` to match, so it drops out rather than ranking low.
    const hits = searchParts(LIBRARY, 'spacer bl').map((h) => h.name)
    expect(hits).toEqual(['1x1 Spacer blank', '3x3 Spacer blank'])
  })

  it('puts the closer name first when several match', () => {
    const hits = searchParts(LIBRARY, 'flat cent')
    expect(hits[0]?.name).toBe('3x0 Flat Center')
  })

  it('drops non-matches entirely', () => {
    expect(searchParts(LIBRARY, 'zzzz')).toEqual([])
  })

  it('still finds a part that has no grid dimensions', () => {
    const hits = searchParts(LIBRARY, 'quickhook')
    expect(hits.map((h) => h.name)).toContain('Quickhook Retainer')
  })
})

describe('facets', () => {
  it('collects every value present, sorted', () => {
    const facets = collectFacets(LIBRARY)
    expect(facets.families).toEqual([
      'centerpieces/spacer_blank',
      'centerpieces/spacer_clip-on',
      'centerpieces/tool_hooks',
      'quickhooks',
      'sidepieces/flats',
    ])
    expect(facets.heights).toEqual([1, 2, 3])
    expect(facets.widths).toEqual([0, 1, 3, 5])
  })

  it('treats an empty selection as no filter at all', () => {
    expect(matchesFacets(LIBRARY[0]!, {})).toBe(true)
    expect(matchesFacets(LIBRARY[0]!, { families: [] })).toBe(true)
  })

  it('narrows by family', () => {
    const hits = searchParts(LIBRARY, '', { families: ['centerpieces/spacer_blank'] })
    expect(hits).toHaveLength(2)
  })

  it('combines facets with each other', () => {
    const hits = searchParts(LIBRARY, '', {
      families: ['centerpieces/spacer_blank'],
      heights: [3],
    })
    expect(hits.map((h) => h.name)).toEqual(['3x3 Spacer blank'])
  })

  it('combines facets with the query', () => {
    const hits = searchParts(LIBRARY, 'flat', { variants: ['left'] })
    expect(hits.map((h) => h.name)).toEqual(['3x0 Flat Left'])
  })

  it('excludes a dimensionless part when a dimension facet is active', () => {
    // Risk 4: it keeps its catalog row, it just has no value to match on.
    const hits = searchParts(LIBRARY, '', { heights: [3] })
    expect(hits.map((h) => h.name)).not.toContain('Quickhook Retainer')
  })
})

describe('compatibilityScore', () => {
  const flatLeft = { role: 'sidepiece' as const, h: 3, family: 'sidepieces/flats', variant: 'left' }
  const named = (name: string) => LIBRARY.find((p) => p.name === name)!

  it('puts what mates above what merely matches the height', () => {
    // A 3-high centerpiece is what goes between two 3-high sidepieces.
    expect(compatibilityScore(named('3x3 Spacer blank'), flatLeft)).toBeGreaterThan(
      compatibilityScore(named('3x0 Flat Center'), flatLeft),
    )
  })

  it('ranks the mirror piece highly — the Right to go with the Left', () => {
    expect(compatibilityScore(named('3x0 Flat Right'), flatLeft)).toBeGreaterThan(
      compatibilityScore(named('3x0 Flat Left'), flatLeft),
    )
  })

  it('prefers the matching height over the same kind at the wrong size', () => {
    expect(compatibilityScore(named('3x3 Spacer blank'), flatLeft)).toBeGreaterThan(
      compatibilityScore(named('1x1 Spacer blank'), flatLeft),
    )
  })

  it('has no opinion about a part with no grid height', () => {
    expect(compatibilityScore(named('Quickhook Retainer'), flatLeft)).toBe(0)
  })

  it('never recommends a horizontal-panel part, which cannot mate here', () => {
    const horizontal = part('3x1 Locking Retainer for Horizontal Wall Control', {
      family: 'sidepieces/retainers',
      role: 'centerpiece',
      supported: false,
      h: 3,
      w: 1,
    })
    // It would otherwise score top marks: opposite role, matching height.
    expect(compatibilityScore(horizontal, flatLeft)).toBe(0)
    expect(compatibilityScore({ ...horizontal, supported: true }, flatLeft)).toBeGreaterThan(0)
  })

  it('still lists the horizontal part — no opinion is not a filter', () => {
    const horizontal = part('3x1 Locking Retainer for Horizontal Wall Control', {
      role: 'centerpiece',
      supported: false,
    })
    const ranked = searchParts([...LIBRARY, horizontal], '', {}, flatLeft)
    expect(ranked.map((p) => p.name)).toContain(horizontal.name)
  })

  it('works the other way round too', () => {
    const blank = {
      role: 'centerpiece' as const,
      h: 3,
      family: 'centerpieces/spacer_blank',
      variant: null,
    }
    expect(compatibilityScore(named('3x0 Flat Left'), blank)).toBeGreaterThan(
      compatibilityScore(named('1x1 Spacer blank'), blank),
    )
  })
})

describe('searchParts with context', () => {
  const flatLeft = { role: 'sidepiece' as const, h: 3, family: 'sidepieces/flats', variant: 'left' }

  it('sorts the whole catalog by compatibility when nothing is typed', () => {
    const ranked = searchParts(LIBRARY, '', {}, flatLeft)
    expect(ranked[0]?.name).toBe('3x3 Spacer blank')
    // Ranking is not filtering: everything is still there.
    expect(ranked).toHaveLength(LIBRARY.length)
  })

  it('hides nothing, however unrelated', () => {
    const ranked = searchParts(LIBRARY, '', {}, flatLeft)
    expect(ranked.map((p) => p.name)).toContain('Quickhook Retainer')
    expect(ranked.map((p) => p.name)).toContain('2x5_milwaukee_M12_battery_x2')
  })

  it('keeps the catalog order among parts it has no opinion about', () => {
    const ranked = searchParts(LIBRARY, '', {}, flatLeft)
    const neutral = ranked.filter((p) => compatibilityScore(p, flatLeft) === 0)
    const original = LIBRARY.filter((p) => compatibilityScore(p, flatLeft) === 0)
    expect(neutral).toEqual(original)
  })

  it('lets a typed query win over compatibility', () => {
    // "clip" names one part; context must not float a spacer blank above it.
    expect(searchParts(LIBRARY, 'clip', {}, flatLeft)[0]?.name).toBe('3x3 Spacer clip-on')
  })

  it('breaks ties among equally good matches by compatibility', () => {
    const blank = {
      role: 'centerpiece' as const,
      h: 3,
      family: 'centerpieces/spacer_blank',
      variant: null,
    }
    // Both flats score the same on "flat"; the one that mirrors nothing and
    // the one that mates are separated only by context.
    const names = searchParts(LIBRARY, 'flat', {}, blank).map((p) => p.name)
    expect(names).toContain('3x0 Flat Left')
    expect(names.length).toBeGreaterThan(1)
  })

  it('behaves exactly as before when there is no context', () => {
    expect(searchParts(LIBRARY, '', {})).toEqual(LIBRARY)
    expect(searchParts(LIBRARY, '', {}, null)).toEqual(LIBRARY)
  })
})
