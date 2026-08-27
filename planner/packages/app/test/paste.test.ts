import { beforeEach, describe, expect, it } from 'vitest'
import { encodeClipping } from '@ddd-planner/core'
import { EMPTY_HISTORY } from '../src/history'
import { type CatalogFile, useStore } from '../src/store'
import { pasteNotice } from '../src/useClipboard'

/**
 * The clipboard *format* is proved in `core/test/clipboard.test.ts`. What is
 * left to prove is the part that only the store knows: where a paste lands,
 * what happens when you press it again, and what it does with a part this
 * library has never heard of.
 */

const INITIAL = useStore.getState()

/** A one-column bracket and a three-column plate, so span is not always 1. */
const CATALOG = {
  schemaVersion: 1,
  families: [],
  fasteners: {},
  parts: [
    { id: 'bracket', h: null, orientations: { flat: { rule: { occupiesColumns: 1 } } } },
    { id: 'plate', h: null, orientations: { flat: { rule: { occupiesColumns: 3 } } } },
  ],
} as unknown as CatalogFile

beforeEach(() => {
  useStore.setState({ ...INITIAL, history: EMPTY_HISTORY }, true)
  useStore.setState({ catalog: CATALOG, history: EMPTY_HISTORY, clipping: null, pasteAnchor: null })
})

const state = () => useStore.getState()
const cols = () => state().placements.map((p) => p.col)

/** Put parts on the wall and leave them selected, the way a drop does. */
function build(...refs: { partId: string; col: number; row: number }[]) {
  state().addPlacements(refs)
}

describe('copy', () => {
  it('takes the selection, in wall order rather than click order', () => {
    build({ partId: 'bracket', col: 7, row: 0 }, { partId: 'bracket', col: 4, row: 0 })

    const clipping = JSON.parse(state().copySelection()!)
    expect(clipping.o).toEqual([4, 0])
    expect(clipping.p.map((row: number[]) => row[1])).toEqual([0, 3])
  })

  it('is nothing when nothing is selected', () => {
    expect(state().copySelection()).toBeNull()
  })

  it('leaves the wall alone — which is what makes a cut one undo, not two', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    const depth = state().history.past.length

    state().copySelection()
    expect(state().history.past).toHaveLength(depth)

    state().cutSelection()
    expect(state().placements).toEqual([])
    expect(state().history.past).toHaveLength(depth + 1)

    state().undo()
    expect(cols()).toEqual([4])
  })
})

describe('where a paste lands', () => {
  it('flush beside the original, not on top of it', () => {
    build({ partId: 'bracket', col: 4, row: 0 }, { partId: 'bracket', col: 6, row: 0 })
    const text = state().copySelection()!

    state().pasteText(text)
    // The bay spans columns 4..6, so the copy starts at 7 — touching, and
    // generating no overlap warning.
    expect(cols()).toEqual([4, 6, 7, 9])
  })

  it('measures the span by what parts cover, not by how many anchors they use', () => {
    build({ partId: 'plate', col: 4, row: 0 })
    state().pasteText(state().copySelection()!)

    // One part, one anchor column — but three columns wide, so the copy has
    // to clear all three.
    expect(cols()).toEqual([4, 7])
  })

  it('keeps the shape of the group, rows and all', () => {
    build({ partId: 'bracket', col: 4, row: 1 }, { partId: 'bracket', col: 5, row: 3 })
    state().pasteText(state().copySelection()!)

    const pasted = state().placements.slice(2)
    expect(pasted.map((p) => [p.col, p.row])).toEqual([
      [6, 1],
      [7, 3],
    ])
  })

  it('selects what it pasted, so it can be nudged straight away', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    state().pasteText(state().copySelection()!)

    expect(state().selectedIds).toEqual([state().placements[1]!.id])
  })

  it('is pulled back onto the board rather than off the edge', () => {
    state().setWallSize({ widthIn: 8, heightIn: 8 })
    build({ partId: 'bracket', col: 6, row: 0 })

    state().pasteText(state().copySelection()!)
    const pasted = state().placements[1]!
    expect(pasted.col).toBeLessThan(8)
  })
})

describe('pasting again', () => {
  it('marches along the wall instead of piling up', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    const text = state().copySelection()!

    state().pasteText(text)
    state().pasteText(text)
    state().pasteText(text)
    expect(cols()).toEqual([4, 5, 6, 7])
  })

  it('starts over when something different is copied', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    const first = state().copySelection()!
    state().pasteText(first)
    state().pasteText(first)
    expect(cols()).toEqual([4, 5, 6])

    // A different selection is a different payload, so the march restarts
    // from where *that* copy was taken.
    state().select(state().placements[2]!.id)
    state().pasteText(state().copySelection()!)
    expect(cols()).toEqual([4, 5, 6, 7])
  })

  it('carries on when the very same parts are copied again', () => {
    // The cascade is keyed by the payload, and re-copying the same selection
    // produces the same bytes — so this is indistinguishable from pressing
    // paste once more, and behaves that way. Which is the better outcome
    // anyway: restarting would drop the copy on top of one already pasted.
    build({ partId: 'bracket', col: 4, row: 0 })
    state().pasteText(state().copySelection()!)
    state().pasteText(state().copySelection()!)
    expect(cols()).toEqual([4, 5, 6])
  })

  it('counts each paste as its own undo', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    const text = state().copySelection()!
    state().pasteText(text)
    state().pasteText(text)

    state().undo()
    expect(cols()).toEqual([4, 5])
    state().undo()
    expect(cols()).toEqual([4])
  })
})

describe('a part this library does not have', () => {
  const foreign = encodeClipping([
    { partId: 'bracket', col: 0, row: 0, orientation: 'flat' },
    { partId: 'from-another-fork', col: 1, row: 0, orientation: 'flat' },
  ])

  it('is skipped rather than placed where nobody can see or remove it', () => {
    expect(state().pasteText(foreign)).toEqual({ ok: true, count: 1, skipped: 1 })
    expect(state().placements.map((p) => p.partId)).toEqual(['bracket'])
  })

  it('is counted, so it can be said out loud', () => {
    const result = state().pasteText(foreign)
    expect(pasteNotice(result)).toMatch(/1 part not in this library/)
  })

  it('leaves nothing behind when none of it is known, and is still a paste', () => {
    const alien = encodeClipping([
      { partId: 'from-another-fork', col: 0, row: 0, orientation: 'flat' },
    ])
    // `ok` is about whether the text was ours, not whether anything landed:
    // this clipping was consumed, and the gesture is not passed on.
    const result = state().pasteText(alien)
    expect(result).toEqual({ ok: true, count: 0, skipped: 1 })
    expect(state().placements).toEqual([])
    expect(pasteNotice(result)).toMatch(/Nothing in that copy/)
  })

  it('says nothing at all when the whole paste was fine', () => {
    build({ partId: 'bracket', col: 4, row: 0 })
    const result = state().pasteText(state().copySelection()!)
    expect(result).toEqual({ ok: true, count: 1, skipped: 0 })
    expect(pasteNotice(result)).toBeNull()
  })
})

describe('text that is not a clipping', () => {
  it('is refused, and changes nothing', () => {
    build({ partId: 'bracket', col: 4, row: 0 })

    expect(state().pasteText('https://example.com')).toEqual({ ok: false })
    expect(state().pasteText('{"v":1,"w":[32,32],"d":[],"p":[],"a":[]}')).toEqual({ ok: false })
    expect(cols()).toEqual([4])
  })

  it('is not something to comment on — the gesture was never ours', () => {
    expect(pasteNotice({ ok: false })).toBeNull()
  })
})
