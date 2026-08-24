import { describe, expect, it } from 'vitest'
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
    { partId: 'flat-left', col: 6, row: 4 },
    { partId: 'blank-3', col: 7, row: 4 },
    { partId: 'flat-right', col: 10, row: 4 },
    { partId: 'flat-left', col: 6, row: 6 },
  ],
  assemblies: [
    {
      id: 'a1',
      name: 'Drill station',
      parts: [
        { partId: 'flat-left', dCol: 0, dRow: 0 },
        { partId: 'blank-3', dCol: 1, dRow: 0 },
      ],
    },
  ],
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
      placements: Array.from({ length: 50 }, (_, i) => ({ partId: long, col: i, row: 2 })),
      assemblies: [],
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
    const empty: PlannerState = { widthIn: 32, heightIn: 32, placements: [], assemblies: [] }
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
    const cases = ['[0,1]', '[0,1,1,1]', '[0,-1,1]', '[0,1.5,1]', '"nope"', 'null']
    for (const entry of cases) {
      expect(bad(`{"v":1,"w":[32,32],"d":["a"],"p":[${entry}],"a":[]}`)).toMatch(
        /damaged placement/,
      )
    }
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
      assemblies: [{ id: 'a1', name: 'x', parts: [{ partId: 'ghost', dCol: 0, dRow: 0 }] }],
    }
    expect(unknownPartIds(state, known)).toEqual(['ghost'])
  })
})

