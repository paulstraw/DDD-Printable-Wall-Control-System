import { describe, expect, it } from 'vitest'
import {
  CLIPBOARD_KIND,
  CLIPBOARD_VERSION,
  type PlacedRef,
  decodeClipping,
  encodeClipping,
} from '../src/index'

const at = (partId: string, col: number, row: number, orientation: 'flat' | 'shelf' = 'flat') =>
  ({ partId, col, row, orientation }) as PlacedRef

/** A bay: two brackets with a plate between them, three columns apart. */
const BAY: PlacedRef[] = [
  at('flat-left', 4, 2),
  at('spacer', 4, 2, 'shelf'),
  at('flat-right', 7, 2),
]

describe('encodeClipping', () => {
  it('records where the copy was taken from', () => {
    const doc = JSON.parse(encodeClipping(BAY))
    expect(doc.o).toEqual([4, 2])
  })

  it('stores parts relative to that origin, so the group can move as one', () => {
    const clipping = decodeClipping(encodeClipping(BAY))!
    expect(clipping.parts.map((p) => [p.dCol, p.dRow])).toEqual([
      [0, 0],
      [0, 0],
      [3, 0],
    ])
  })

  it('interns part ids rather than repeating them', () => {
    const doc = JSON.parse(encodeClipping([at('spacer', 0, 0), at('spacer', 1, 0)]))
    expect(doc.d).toEqual(['spacer'])
    expect(doc.p).toHaveLength(2)
  })

  it('marks the text as ours', () => {
    const doc = JSON.parse(encodeClipping(BAY))
    expect(doc.k).toBe(CLIPBOARD_KIND)
    expect(doc.v).toBe(CLIPBOARD_VERSION)
  })

  it('survives an empty selection without inventing an origin', () => {
    const clipping = decodeClipping(encodeClipping([]))!
    expect(clipping.parts).toEqual([])
    expect(clipping.origin).toEqual({ col: 0, row: 0 })
  })
})

describe('a round trip', () => {
  it('gives back every part, in order, with its orientation', () => {
    expect(decodeClipping(encodeClipping(BAY))!.parts).toEqual([
      { partId: 'flat-left', dCol: 0, dRow: 0, orientation: 'flat' },
      { partId: 'spacer', dCol: 0, dRow: 0, orientation: 'shelf' },
      { partId: 'flat-right', dCol: 3, dRow: 0, orientation: 'flat' },
    ])
  })
})

describe('decodeClipping refuses', () => {
  /**
   * A clipboard holds whatever the user last copied, anywhere. Pasting parts
   * onto a wall because someone's JSON happened to parse is a worse outcome
   * than a paste that does nothing, so everything here is a `null`.
   */
  const refused = (text: string) => expect(decodeClipping(text)).toBeNull()

  it('anything that is not JSON', () => {
    refused('https://example.com/some/link')
    refused('')
    refused('Wall Control 30 in. Metal Pegboard')
  })

  it('JSON that is not an object', () => {
    refused('[1, 2, 3]')
    refused('"a string"')
    refused('null')
  })

  it('an object without our marker', () => {
    // Shape alone is not enough — this is a well-formed clipping in every
    // respect except that nobody said it was one.
    refused(JSON.stringify({ v: 1, o: [0, 0], d: ['spacer'], p: [[0, 0, 0]] }))
  })

  it('a clipping from a newer planner', () => {
    refused(
      JSON.stringify({
        v: CLIPBOARD_VERSION + 1,
        k: CLIPBOARD_KIND,
        o: [0, 0],
        d: ['spacer'],
        p: [[0, 0, 0]],
      }),
    )
  })

  it('a damaged origin', () => {
    const doc = { v: 1, k: CLIPBOARD_KIND, d: ['spacer'], p: [[0, 0, 0]] }
    refused(JSON.stringify({ ...doc, o: [0] }))
    refused(JSON.stringify({ ...doc, o: [-1, 0] }))
    refused(JSON.stringify({ ...doc, o: [0, 1.5] }))
    refused(JSON.stringify({ ...doc, o: 'somewhere' }))
  })

  it('a row pointing outside the dictionary', () => {
    refused(JSON.stringify({ v: 1, k: CLIPBOARD_KIND, o: [0, 0], d: ['spacer'], p: [[3, 0, 0]] }))
  })

  it('an orientation code it does not know', () => {
    refused(JSON.stringify({ v: 1, k: CLIPBOARD_KIND, o: [0, 0], d: ['spacer'], p: [[0, 0, 0, 7]] }))
  })

  it('the whole clipping for one bad row', () => {
    // Half a paste is worse than none: the user cannot see what is missing,
    // only that what landed is wrong.
    refused(
      JSON.stringify({
        v: 1,
        k: CLIPBOARD_KIND,
        o: [0, 0],
        d: ['a', 'b'],
        p: [
          [0, 0, 0],
          [1, -4, 0],
        ],
      }),
    )
  })

  it('a saved wall — a document is not a clipping', () => {
    refused(JSON.stringify({ v: 1, w: [32, 32], d: ['spacer'], p: [[0, 4, 2]], a: [] }))
  })
})

describe('colors on the clipboard', () => {
  const painted: PlacedRef[] = [
    { partId: 'flat-left', col: 6, row: 4, orientation: 'flat', color: '#ff0000' },
    { partId: 'blank-3', col: 7, row: 4, orientation: 'shelf', color: '#ff0000' },
    { partId: 'flat-right', col: 10, row: 4, orientation: 'flat' },
  ]

  it('survives a copy and a paste, because a paste is a duplicate', () => {
    const back = decodeClipping(encodeClipping(painted))
    expect(back?.parts).toEqual([
      { partId: 'flat-left', dCol: 0, dRow: 0, orientation: 'flat', color: '#ff0000' },
      { partId: 'blank-3', dCol: 1, dRow: 0, orientation: 'shelf', color: '#ff0000' },
      { partId: 'flat-right', dCol: 4, dRow: 0, orientation: 'flat' },
    ])
  })

  it('leaves an unpainted part with no color key', () => {
    const back = decodeClipping(encodeClipping(painted))
    expect('color' in back!.parts[2]!).toBe(false)
  })

  it('interns each color once', () => {
    expect(encodeClipping(painted).split('#ff0000').length - 1).toBe(1)
  })

  it('says nothing about colors when nothing was painted', () => {
    const plain: PlacedRef[] = [{ partId: 'a', col: 1, row: 1, orientation: 'flat' }]
    // A clipping of an unpainted bay is byte-for-byte what it always was.
    expect(encodeClipping(plain)).not.toContain('"c"')
  })

  it('refuses a clipping naming a color it did not bring', () => {
    const doc = JSON.stringify({
      v: CLIPBOARD_VERSION,
      k: CLIPBOARD_KIND,
      o: [0, 0],
      d: ['a'],
      p: [[0, 0, 0, 0, 0]],
    })
    expect(decodeClipping(doc)).toBeNull()
  })

  it('refuses a clipping whose color list is not colors', () => {
    const doc = JSON.stringify({
      v: CLIPBOARD_VERSION,
      k: CLIPBOARD_KIND,
      o: [0, 0],
      d: ['a'],
      p: [[0, 0, 0]],
      c: ['rebeccapurple'],
    })
    expect(decodeClipping(doc)).toBeNull()
  })
})
