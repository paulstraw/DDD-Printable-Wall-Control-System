import { describe, expect, it } from 'vitest'
import { DEFAULT_COLORS } from '../src/colors'
import {
  DOCUMENT_VERSION,
  type PlannerState,
  decodeDocument,
  encodeDocument,
  toDocument,
  unknownPartIds,
} from '../src/persistence'

const wall: PlannerState = {
  widthIn: 48,
  heightIn: 32,
  placements: [
    { partId: 'flat-left', col: 6, row: 4, orientation: 'flat' as const },
    { partId: 'blank-3', col: 7, row: 4, orientation: 'flat' as const },
    { partId: 'flat-right', col: 10, row: 4, orientation: 'flat' as const },
    { partId: 'flat-left', col: 6, row: 6, orientation: 'flat' as const },
  ],
  assemblies: [
    {
      id: 'a1',
      name: 'Drill station',
      parts: [
        { partId: 'flat-left', dCol: 0, dRow: 0, orientation: 'flat' as const },
        { partId: 'blank-3', dCol: 1, dRow: 0, orientation: 'flat' as const },
      ],
    },
  ],
  colors: DEFAULT_COLORS,
}

describe('toDocument', () => {
  it('interns each part id once, however often it is used', () => {
    const doc = toDocument(wall)
    // flat-left appears twice on the wall and once in the assembly.
    expect(doc.d).toEqual(['flat-left', 'blank-3', 'flat-right'])
    expect(doc.p).toEqual([
      [0, 6, 4],
      [1, 7, 4],
      [2, 10, 4],
      [0, 6, 6],
    ])
  })

  it('shares one dictionary between placements and assemblies', () => {
    const doc = toDocument(wall)
    expect(doc.a).toEqual([['Drill station', [[0, 0, 0], [1, 1, 0]]]])
  })

  it('stamps the current version and the wall size', () => {
    const doc = toDocument(wall)
    expect(doc.v).toBe(DOCUMENT_VERSION)
    expect(doc.w).toEqual([48, 32])
  })

  it('is worth the trouble — the dictionary is what keeps a link short', () => {
    const long = 'sidepieces-flats-3x0-flat-left'
    const many: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: Array.from({ length: 50 }, (_, i) => ({ partId: long, col: i, row: 2, orientation: 'flat' as const })),
      assemblies: [],
      colors: DEFAULT_COLORS,
    }
    const encoded = encodeDocument(many)
    // The id must appear once, not fifty times.
    expect(encoded.split(long).length - 1).toBe(1)
    expect(encoded.length).toBeLessThan(700)
  })
})

describe('round trip', () => {
  it('returns the same wall it was given', () => {
    const back = decodeDocument(encodeDocument(wall))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.state.widthIn).toBe(48)
    expect(back.state.heightIn).toBe(32)
    expect(back.state.placements).toEqual(wall.placements)
    expect(back.state.assemblies[0]?.name).toBe('Drill station')
    expect(back.state.assemblies[0]?.parts).toEqual(wall.assemblies[0]?.parts)
  })

  it('survives an empty wall', () => {
    const empty: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: [],
      assemblies: [],
      colors: DEFAULT_COLORS,
    }
    const back = decodeDocument(encodeDocument(empty))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.state).toEqual(empty)
  })

  it('keeps names with quotes, commas and emoji intact', () => {
    const awkward: PlannerState = {
      ...wall,
      assemblies: [{ id: 'a1', name: 'He said "one, two" 🔧', parts: [] }],
    }
    const back = decodeDocument(encodeDocument(awkward))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.state.assemblies[0]?.name).toBe('He said "one, two" 🔧')
  })

  it('produces indented output only when asked', () => {
    expect(encodeDocument(wall)).not.toContain('\n')
    expect(encodeDocument(wall, { pretty: true })).toContain('\n')
    // Same document either way.
    const a = decodeDocument(encodeDocument(wall))
    const b = decodeDocument(encodeDocument(wall, { pretty: true }))
    expect(a).toEqual(b)
  })
})

describe('decodeDocument refuses bad input rather than guessing', () => {
  const bad = (text: string) => {
    const result = decodeDocument(text)
    expect(result.ok).toBe(false)
    return result.ok ? '' : result.error
  }

  it('rejects things that are not JSON at all', () => {
    expect(bad('not json')).toMatch(/not valid JSON/)
    expect(bad('')).toMatch(/not valid JSON/)
  })

  it('rejects JSON that is not a document', () => {
    expect(bad('[1,2,3]')).toMatch(/does not contain a wall/)
    expect(bad('"a string"')).toMatch(/does not contain a wall/)
    expect(bad('null')).toMatch(/does not contain a wall/)
  })

  it('rejects a document from a newer planner instead of guessing at it', () => {
    const future = JSON.stringify({ v: DOCUMENT_VERSION + 1, w: [32, 32], d: [], p: [], a: [] })
    expect(bad(future)).toMatch(/newer version/)
  })

  it('rejects a missing or absurd wall size', () => {
    expect(bad('{"v":1,"d":[],"p":[],"a":[]}')).toMatch(/no usable size/)
    expect(bad('{"v":1,"w":[0,32],"d":[],"p":[],"a":[]}')).toMatch(/no usable size/)
    expect(bad('{"v":1,"w":[32],"d":[],"p":[],"a":[]}')).toMatch(/no usable size/)
    expect(bad('{"v":1,"w":["a","b"],"d":[],"p":[],"a":[]}')).toMatch(/no usable size/)
  })

  it('rejects a dictionary that is not strings', () => {
    expect(bad('{"v":1,"w":[32,32],"d":[7],"p":[],"a":[]}')).toMatch(/damaged part list/)
  })

  it('rejects a placement pointing outside the dictionary', () => {
    // Index 5 with a one-entry dictionary would otherwise read undefined.
    expect(bad('{"v":1,"w":[32,32],"d":["a"],"p":[[5,1,1]],"a":[]}')).toMatch(/damaged placement/)
  })

  it('rejects malformed, fractional or negative placements', () => {
    // A fourth element is an orientation code, so the rejections there are
    // codes this version does not know rather than the length itself.
    const cases = [
      '[0,1]',
      '[0,1,1,1,1]',
      '[0,1,1,2]',
      '[0,1,1,-1]',
      '[0,1,1,1.5]',
      '[0,-1,1]',
      '[0,1.5,1]',
      '"nope"',
      'null',
    ]
    for (const entry of cases) {
      expect(bad(`{"v":1,"w":[32,32],"d":["a"],"p":[${entry}],"a":[]}`)).toMatch(
        /damaged placement/,
      )
    }
  })

  it('reads a fourth element as the orientation, and its absence as flat', () => {
    const doc = '{"v":1,"w":[32,32],"d":["a"],"p":[[0,1,1],[0,2,1,1]],"a":[]}'
    const result = decodeDocument(doc)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.placements.map((p) => p.orientation)).toEqual(['flat', 'shelf'])
  })

  it('leaves a wall of flat parts encoding exactly as it did before shelves', () => {
    // The reason orientation is an optional fourth element rather than a
    // version bump: a share link for the common case must not get longer.
    const state = {
      widthIn: 32,
      heightIn: 32,
      placements: [
        { partId: 'a', col: 1, row: 1, orientation: 'flat' as const },
        { partId: 'b', col: 2, row: 1, orientation: 'flat' as const },
      ],
      assemblies: [],
      colors: DEFAULT_COLORS,
    }
    // Every key and every row is what it was; only the version moved. Colors
    // cost an uncolored wall two characters, and those two are the whole
    // price of the feature for anyone who never uses it.
    expect(encodeDocument(state)).toBe('{"v":2,"w":[32,32],"d":["a","b"],"p":[[0,1,1],[1,2,1]],"a":[]}')
  })

  it('round-trips a shelf through encode and decode', () => {
    const state = {
      widthIn: 32,
      heightIn: 32,
      placements: [{ partId: 'a', col: 3, row: 2, orientation: 'shelf' as const }],
      assemblies: [
        { id: 'a1', name: 'Shelf', parts: [{ partId: 'a', dCol: 0, dRow: 0, orientation: 'shelf' as const }] },
      ],
      colors: DEFAULT_COLORS,
    }
    const result = decodeDocument(encodeDocument(state))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.placements[0]!.orientation).toBe('shelf')
    expect(result.state.assemblies[0]!.parts[0]!.orientation).toBe('shelf')
  })

  it('names the assembly whose parts are damaged', () => {
    const doc = '{"v":1,"w":[32,32],"d":["a"],"p":[],"a":[["Shelf",[[9,0,0]]]]}'
    expect(bad(doc)).toContain('Shelf')
  })

  it('rejects an assembly that is not a name and a part list', () => {
    expect(bad('{"v":1,"w":[32,32],"d":[],"p":[],"a":[["only"]]}')).toMatch(/damaged assembly/)
    expect(bad('{"v":1,"w":[32,32],"d":[],"p":[],"a":[[1,[]]]}')).toMatch(/damaged assembly/)
  })

  it('accepts a document with no assemblies key at all', () => {
    const result = decodeDocument('{"v":1,"w":[32,32],"d":["a"],"p":[[0,1,1]]}')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state.assemblies).toEqual([])
  })

  it('accepts an older version, since v1 is the floor', () => {
    const result = decodeDocument('{"v":1,"w":[32,32],"d":[],"p":[],"a":[]}')
    expect(result.ok).toBe(true)
  })
})

describe('unknownPartIds', () => {
  const known = new Set(['flat-left', 'blank-3'])

  it('reports each missing id once, from placements and assemblies alike', () => {
    expect(unknownPartIds(wall, known)).toEqual(['flat-right'])
  })

  it('is empty when the catalog has everything', () => {
    expect(unknownPartIds(wall, new Set(['flat-left', 'blank-3', 'flat-right']))).toEqual([])
  })

  it('catches a part known only to an assembly', () => {
    const state: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: [],
      assemblies: [{ id: 'a1', name: 'x', parts: [{ partId: 'ghost', dCol: 0, dRow: 0, orientation: 'flat' as const }] }],
      colors: DEFAULT_COLORS,
    }
    expect(unknownPartIds(state, known)).toEqual(['ghost'])
  })
})


describe('colors in the document', () => {
  /** A v1 wall: written before colors existed, and saying nothing about them. */
  const v1 = '{"v":1,"w":[32,32],"d":["a"],"p":[[0,1,1]],"a":[]}'

  it('decodes a wall written before colors existed', () => {
    const back = decodeDocument(v1)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.state.placements).toEqual([{ partId: 'a', col: 1, row: 1, orientation: 'flat' }])
    // Saying nothing is not the same as saying grey — but it decodes to the
    // grey the planner always drew, so an old link opens looking as it did.
    expect(back.state.colors).toEqual(DEFAULT_COLORS)
  })

  it('leaves an unpainted placement with no color key at all', () => {
    const back = decodeDocument(v1)
    if (!back.ok) throw new Error(back.error)
    expect('color' in back.state.placements[0]!).toBe(false)
  })

  it('says nothing about colors when there is nothing to say', () => {
    const plain: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: [{ partId: 'a', col: 1, row: 1, orientation: 'flat' }],
      assemblies: [],
      colors: DEFAULT_COLORS,
    }
    const doc = toDocument(plain)
    expect(doc.c).toBeUndefined()
    expect(doc.s).toBeUndefined()
  })

  it('round-trips painted parts and a recolored wall', () => {
    const painted: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: [
        { partId: 'a', col: 1, row: 1, orientation: 'flat', color: '#ff0000' },
        { partId: 'a', col: 2, row: 1, orientation: 'shelf', color: '#ff0000' },
        { partId: 'b', col: 3, row: 1, orientation: 'flat' },
      ],
      assemblies: [],
      colors: { background: '#101014', panel: '#000000', parts: '#cccccc' },
    }
    const back = decodeDocument(encodeDocument(painted))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.state.placements).toEqual(painted.placements)
    expect(back.state.colors).toEqual(painted.colors)
  })

  it('interns each color once however many parts wear it', () => {
    const red = '#ff0000'
    const many: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: Array.from({ length: 20 }, (_, i) => ({
        partId: 'a',
        col: i,
        row: 1,
        orientation: 'flat' as const,
        color: red,
      })),
      assemblies: [],
      colors: DEFAULT_COLORS,
    }
    const encoded = encodeDocument(many)
    expect(encoded.split(red).length - 1).toBe(1)
  })

  it('keeps a color on a part inside an assembly', () => {
    const state: PlannerState = {
      widthIn: 32,
      heightIn: 32,
      placements: [],
      assemblies: [
        {
          id: 'a1',
          name: 'Bay',
          parts: [{ partId: 'a', dCol: 0, dRow: 0, orientation: 'flat', color: '#00ff00' }],
        },
      ],
      colors: DEFAULT_COLORS,
    }
    const back = decodeDocument(encodeDocument(state))
    if (!back.ok) throw new Error(back.error)
    expect(back.state.assemblies[0]?.parts).toEqual(state.assemblies[0]?.parts)
  })
})

describe('a document whose colors are damaged', () => {
  const refuses = (doc: string) => {
    const back = decodeDocument(doc)
    expect(back.ok).toBe(false)
    return back.ok ? '' : back.error
  }

  it('refuses a color list holding something that is not a color', () => {
    expect(refuses('{"v":2,"w":[32,32],"d":["a"],"p":[],"a":[],"c":["red"]}')).toMatch(/color list/)
    expect(refuses('{"v":2,"w":[32,32],"d":["a"],"p":[],"a":[],"c":["#f00"]}')).toMatch(/color list/)
    expect(refuses('{"v":2,"w":[32,32],"d":["a"],"p":[],"a":[],"c":[16711680]}')).toMatch(/color list/)
  })

  it('refuses wall colors that are the wrong shape or not colors', () => {
    expect(refuses('{"v":2,"w":[32,32],"d":[],"p":[],"a":[],"s":["#fff","#000000","#111111"]}')).toMatch(/damaged colors/)
    expect(refuses('{"v":2,"w":[32,32],"d":[],"p":[],"a":[],"s":["#000000","#111111"]}')).toMatch(/damaged colors/)
    expect(refuses('{"v":2,"w":[32,32],"d":[],"p":[],"a":[],"s":"#000000"}')).toMatch(/damaged colors/)
  })

  it('refuses a placement pointing at a color the document did not bring', () => {
    expect(
      refuses('{"v":2,"w":[32,32],"d":["a"],"p":[[0,1,1,0,0]],"a":[]}'),
    ).toMatch(/damaged placement/)
    expect(
      refuses('{"v":2,"w":[32,32],"d":["a"],"p":[[0,1,1,0,1]],"a":[],"c":["#ff0000"]}'),
    ).toMatch(/damaged placement/)
  })

  it('refuses a document from a version it does not know', () => {
    expect(refuses('{"v":3,"w":[32,32],"d":[],"p":[],"a":[]}')).toMatch(/newer version/)
  })
})
