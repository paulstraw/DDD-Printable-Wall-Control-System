import { describe, expect, it } from 'vitest'
import {
  type Searchable,
  collectFacets,
  fuzzyScore,
  matchesFacets,
  searchParts,
} from '../src/search'

function part(name: string, over: Partial<Searchable> = {}): Searchable {
  return {
    name,
    searchKey: name.toLowerCase().replace(/[_-]/g, ' '),
    family: 'sidepieces/flats',
    base: name,
    variant: null,
    h: 3,
    w: 0,
    ...over,
  }
}

const LIBRARY: Searchable[] = [
  part('3x0 Flat Left', { variant: 'left' }),
  part('3x0 Flat Right', { variant: 'right' }),
  part('3x0 Flat Center', { variant: 'center' }),
  part('1x1 Spacer blank', { family: 'centerpieces/spacer_blank', h: 1, w: 1 }),
  part('3x3 Spacer blank', { family: 'centerpieces/spacer_blank', h: 3, w: 3 }),
  part('3x3 Spacer clip-on', { family: 'centerpieces/spacer_clip-on', h: 3, w: 3 }),
  part('2x5_milwaukee_M12_battery_x2', {
    family: 'centerpieces/tool_hooks',
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
    expect(matchesFacets(LIBRARY[0] as Searchable, {})).toBe(true)
    expect(matchesFacets(LIBRARY[0] as Searchable, { families: [] })).toBe(true)
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
