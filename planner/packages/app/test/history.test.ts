import { describe, expect, it } from 'vitest'
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  type Moment,
  canRedo,
  canUndo,
  record,
  redo,
  undo,
} from '../src/history'

/** A moment, identified by the one thing the tests need to tell apart. */
const at = (label: string): Moment => ({
  widthIn: 32,
  heightIn: 32,
  placements: [{ id: label, partId: 'x', col: 0, row: 0, orientation: 'flat' }],
  selectedIds: [label],
})

const labels = (moments: readonly Moment[]) => moments.map((m) => m.selectedIds[0])

describe('an empty history', () => {
  it('offers nothing in either direction', () => {
    expect(canUndo(EMPTY_HISTORY)).toBe(false)
    expect(canRedo(EMPTY_HISTORY)).toBe(false)
  })

  it('returns null rather than the present moment back', () => {
    // A caller that wrote the returned moment back unconditionally would
    // otherwise clobber the live wall with a copy of itself.
    expect(undo(EMPTY_HISTORY, at('now'))).toBeNull()
    expect(redo(EMPTY_HISTORY, at('now'))).toBeNull()
  })
})

describe('record', () => {
  it('stacks moments oldest first', () => {
    const history = record(record(EMPTY_HISTORY, at('a')), at('b'))
    expect(labels(history.past)).toEqual(['a', 'b'])
  })

  it('holds the moment by reference rather than copying it', () => {
    // The whole cost argument depends on this: a hundred moments of a
    // five-hundred-part wall must be a hundred pointers, not a hundred walls.
    const moment = at('a')
    expect(record(EMPTY_HISTORY, moment).past[0]).toBe(moment)
  })

  it('drops the oldest moment past the limit', () => {
    let history = EMPTY_HISTORY
    for (let n = 0; n < HISTORY_LIMIT + 5; n++) history = record(history, at(`m${n}`))

    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]!.selectedIds[0]).toBe('m5')
    expect(history.past[HISTORY_LIMIT - 1]!.selectedIds[0]).toBe(`m${HISTORY_LIMIT + 4}`)
  })

  it('throws the future away — an edit orphans whatever redo was offering', () => {
    const history = record(record(EMPTY_HISTORY, at('a')), at('b'))
    const stepped = undo(history, at('c'))!
    expect(canRedo(stepped.history)).toBe(true)

    expect(record(stepped.history, at('d')).future).toEqual([])
  })
})

describe('undo and redo', () => {
  it('walks back through the moments in reverse', () => {
    const history = record(record(EMPTY_HISTORY, at('a')), at('b'))

    const first = undo(history, at('c'))!
    expect(first.moment.selectedIds).toEqual(['b'])

    const second = undo(first.history, first.moment)!
    expect(second.moment.selectedIds).toEqual(['a'])
    expect(canUndo(second.history)).toBe(false)
  })

  it('makes the present the thing redo comes back to', () => {
    const history = record(EMPTY_HISTORY, at('a'))
    const stepped = undo(history, at('present'))!

    expect(redo(stepped.history, stepped.moment)!.moment.selectedIds).toEqual(['present'])
  })

  it('round-trips to exactly where it started', () => {
    const history = record(record(EMPTY_HISTORY, at('a')), at('b'))
    const present = at('c')

    const back = undo(history, present)!
    const forward = redo(back.history, back.moment)!

    expect(forward.moment).toBe(present)
    expect(forward.history).toEqual(history)
  })

  it('cannot push past beyond the limit by redoing', () => {
    // Redo only ever restores what undo took off, which is why neither
    // function needs a cap of its own.
    let history = EMPTY_HISTORY
    for (let n = 0; n < HISTORY_LIMIT; n++) history = record(history, at(`m${n}`))

    const back = undo(history, at('present'))!
    const forward = redo(back.history, back.moment)!
    expect(forward.history.past).toHaveLength(HISTORY_LIMIT)
  })
})
