import { describe, expect, it } from 'vitest'
import type { Orientation } from '../src/placement'
import { makeDictionary, readTriple, writeRow } from '../src/rows'

/**
 * `rows.ts` is internal to `core` and is the one piece of code both the saved
 * document and the clipboard write through, so it is worth proving on its own
 * rather than only through the two things that use it.
 *
 * Two properties matter more than the rest. A row that names nothing unusual
 * must encode to the same bytes it always did, or every share link in
 * existence gets longer for no reason. And a row that names something this
 * version cannot make sense of must be refused rather than guessed at.
 */

describe('writing a row', () => {
  it('is three numbers when the part is flat and unpainted', () => {
    expect(writeRow(0, 4, 11, 'flat')).toEqual([0, 4, 11])
  })

  it('appends an orientation code only when the part is not flat', () => {
    expect(writeRow(2, 1, 1, 'shelf')).toEqual([2, 1, 1, 1])
  })

  it('appends a colour after the orientation', () => {
    expect(writeRow(2, 1, 1, 'shelf', 3)).toEqual([2, 1, 1, 1, 3])
  })

  it('spells out a flat orientation when a colour follows it', () => {
    // Position is the only thing distinguishing these fields, so the fourth
    // slot cannot be skipped once the fifth is occupied.
    expect(writeRow(7, 0, 0, 'flat', 0)).toEqual([7, 0, 0, 0, 0])
  })

  it('treats colour zero as a colour, not as absent', () => {
    // The first colour in the dictionary indexes to 0, and 0 is falsy. A
    // truthiness check anywhere in here would silently unpaint it.
    expect(writeRow(1, 2, 3, 'flat', 0)).toHaveLength(5)
  })
})

describe('the bytes a wall without colours encodes to', () => {
  /**
   * The claim that has to hold across this change: adding colours cost
   * existing walls nothing. Every row below is what the codec emitted before
   * the colour slot existed, character for character.
   */
  it('is unchanged, character for character', () => {
    const rows = [
      writeRow(0, 12, 8, 'flat'),
      writeRow(1, 12, 8, 'shelf'),
      writeRow(2, 15, 8, 'flat'),
      writeRow(1, 13, 4, 'shelf'),
    ]
    expect(JSON.stringify(rows)).toBe('[[0,12,8],[1,12,8,1],[2,15,8],[1,13,4,1]]')
  })

  it('is unchanged when the colour is passed explicitly as absent', () => {
    expect(JSON.stringify(writeRow(0, 12, 8, 'flat', null))).toBe('[0,12,8]')
  })
})

describe('reading a row back', () => {
  it('round-trips every combination of orientation and paint', () => {
    const cases: Array<[orientation: Orientation, colour: number | null]> = [
      ['flat', null],
      ['shelf', null],
      ['flat', 0],
      ['shelf', 2],
    ]
    for (const [orientation, colour] of cases) {
      const row = writeRow(1, 6, 7, orientation, colour)
      expect(readTriple(row, 4, 3)).toEqual([1, 6, 7, orientation, colour])
    }
  })

  it('reads a three-number row as flat and unpainted', () => {
    expect(readTriple([0, 1, 2], 1, 0)).toEqual([0, 1, 2, 'flat', null])
  })

  it('refuses a row of the wrong length', () => {
    expect(readTriple([0, 1], 1, 0)).toBeNull()
    expect(readTriple([0, 1, 2, 0, 0, 0], 1, 1)).toBeNull()
  })

  it('refuses a part index the dictionary does not reach', () => {
    expect(readTriple([3, 1, 2], 3, 0)).toBeNull()
  })

  it('refuses an orientation code this version does not know', () => {
    expect(readTriple([0, 1, 2, 2], 1, 0)).toBeNull()
  })

  it('refuses a colour index the dictionary does not reach', () => {
    // Two colours means 0 and 1. Asking for 2 is a document describing a
    // colour it did not bring with it.
    expect(readTriple([0, 1, 2, 0, 2], 1, 2)).toBeNull()
    expect(readTriple([0, 1, 2, 0, 0], 1, 0)).toBeNull()
  })

  it('refuses a colour that is not an index at all', () => {
    expect(readTriple([0, 1, 2, 0, -1], 1, 2)).toBeNull()
    expect(readTriple([0, 1, 2, 0, 1.5], 1, 2)).toBeNull()
    expect(readTriple([0, 1, 2, 0, '#ff0000'], 1, 2)).toBeNull()
  })

  it('refuses anything that is not an array of numbers', () => {
    expect(readTriple('nope', 1, 0)).toBeNull()
    expect(readTriple({ 0: 0, 1: 1, 2: 2, length: 3 }, 1, 0)).toBeNull()
    expect(readTriple([0, 1, null], 1, 0)).toBeNull()
  })
})

describe('the dictionary', () => {
  it('gives one index per distinct string, in first-seen order', () => {
    const { ids, intern } = makeDictionary()
    expect(intern('#000000')).toBe(0)
    expect(intern('#ff0000')).toBe(1)
    expect(intern('#000000')).toBe(0)
    expect(ids).toEqual(['#000000', '#ff0000'])
  })
})
