import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_COLORS, type PlannerState } from '@ddd-planner/core'
import { EMPTY_HISTORY } from '../src/history'
import { type CatalogFile, useStore } from '../src/store'

/**
 * History is written by a subscription rather than by each action calling
 * `record()`, so what needs proving is not the stack — `history.test.ts` does
 * that — but that the *store* pushes an entry exactly when it should. These
 * are the tests that would catch an action quietly falling out of history.
 */

const INITIAL = useStore.getState()

/**
 * Just enough catalog for the store to answer its two questions about a
 * part: which orientations it offers, and how many columns it stands in.
 */
const CATALOG = {
  schemaVersion: 1,
  families: [],
  fasteners: {},
  parts: [
    {
      id: 'part-a',
      h: null,
      orientations: {
        flat: { rule: { occupiesColumns: 1 } },
        shelf: { rule: { occupiesColumns: 1 } },
      },
    },
  ],
} as unknown as CatalogFile

beforeEach(() => {
  useStore.setState({ ...INITIAL, history: EMPTY_HISTORY }, true)
  // Replacing the state is itself a change to `placements`, which the
  // subscription duly records. Clear it back out.
  useStore.setState({ catalog: CATALOG, history: EMPTY_HISTORY })
})

const state = () => useStore.getState()
const place = (col: number) => state().addPlacements([{ partId: 'part-a', col, row: 0 }])
const cols = () => state().placements.map((p) => p.col)

const walled = (widthIn: number, heightIn: number): PlannerState => ({
  widthIn,
  heightIn,
  placements: [{ partId: 'part-a', col: 1, row: 1, orientation: 'flat' }],
  assemblies: [],
  colors: DEFAULT_COLORS,
})

describe('what makes an entry', () => {
  it('records a placement, and undo takes it back off the wall', () => {
    place(2)
    expect(cols()).toEqual([2])

    state().undo()
    expect(state().placements).toEqual([])
  })

  it('records a delete, and undo hands the parts back already selected', () => {
    // The reason moments carry the selection: the obvious next gesture after
    // undoing a delete is to nudge the parts somewhere better.
    place(2)
    const id = state().placements[0]!.id

    state().removeSelected()
    expect(state().placements).toEqual([])

    state().undo()
    expect(state().selectedIds).toEqual([id])
  })

  it('records a turn', () => {
    place(2)
    state().setOrientation('shelf')
    state().undo()
    expect(state().placements[0]!.orientation).toBe('flat')
  })

  it('records a clear', () => {
    place(2)
    place(5)
    state().clear()
    expect(state().placements).toEqual([])

    state().undo()
    expect(cols()).toEqual([2, 5])
  })

  it('does not record a selection change', () => {
    place(2)
    place(5)
    const depth = state().history.past.length

    state().selectAll()
    state().select(null)
    expect(state().history.past).toHaveLength(depth)
  })

  it('does not record a nudge that the board edge refused', () => {
    place(0)
    const depth = state().history.past.length

    state().nudge(-1, 0)
    expect(state().history.past).toHaveLength(depth)
  })
})

describe('a held arrow key', () => {
  it('is one entry, however many keydowns the OS made of it', () => {
    place(2)
    const depth = state().history.past.length

    state().nudge(1, 0)
    for (let n = 0; n < 20; n++) state().nudge(1, 0, true)

    expect(cols()).toEqual([23])
    expect(state().history.past).toHaveLength(depth + 1)

    state().undo()
    expect(cols()).toEqual([2])
  })

  it('starts a new entry when the key is pressed again', () => {
    place(2)
    state().nudge(1, 0)
    state().nudge(1, 0, true)
    state().nudge(1, 0)

    state().undo()
    expect(cols()).toEqual([4])
    state().undo()
    expect(cols()).toEqual([2])
  })
})

describe('the wall size', () => {
  it('makes no entry of its own', () => {
    place(2)
    const depth = state().history.past.length

    state().setWallSize({ widthIn: 48, heightIn: 24 })
    expect(state().history.past).toHaveLength(depth)
  })

  it('rides along, so an undone import does not strand parts on the wrong board', () => {
    state().setWallSize({ widthIn: 32, heightIn: 32 })
    place(2)

    state().hydrate(walled(48, 24))
    expect(state().widthIn).toBe(48)

    state().undo()
    expect(state().widthIn).toBe(32)
    expect(state().heightIn).toBe(32)
    expect(state().board.widthMm).toBe(32 * 25.4)
    expect(cols()).toEqual([2])
  })
})

describe('arriving', () => {
  it('is the beginning, and there is nothing before the beginning', () => {
    state().hydrate(walled(32, 32), { beginning: true })
    expect(state().history).toEqual(EMPTY_HISTORY)
  })

  it('but an import is an edit, and edits come back', () => {
    place(2)
    state().hydrate(walled(32, 32))

    state().undo()
    expect(cols()).toEqual([2])
  })
})

describe('redo', () => {
  it('walks forward again', () => {
    place(2)
    place(5)

    state().undo()
    state().undo()
    expect(state().placements).toEqual([])

    state().redo()
    expect(cols()).toEqual([2])
    state().redo()
    expect(cols()).toEqual([2, 5])
  })

  it('is thrown away by a new edit', () => {
    place(2)
    state().undo()
    expect(state().history.future).toHaveLength(1)

    place(9)
    expect(state().history.future).toEqual([])
  })
})

describe('placement ids', () => {
  it('survive an undo', () => {
    // Everything downstream keys off these: the React key on each model, the
    // selection, and the id of a dismissed issue. A moment that re-issued
    // them would remount the whole wall to undo moving one bracket.
    place(2)
    place(5)
    const before = state().placements.map((p) => p.id)

    state().removeSelected()
    state().undo()

    expect(state().placements.map((p) => p.id)).toEqual(before)
  })
})

describe('painting a part', () => {
  /**
   * The claim colour is built on: because a colour lives on the placement,
   * painting is an edit to `placements`, and the subscription that watches
   * `placements` records it without a line of code written for colour.
   *
   * There is no `paintSelection` yet — this writes the placements array the
   * way that action will, which is the point: any route that replaces the
   * array is on the stack, and any route that does not is off it.
   */
  const paint = (color: string) =>
    useStore.setState({ placements: state().placements.map((p) => ({ ...p, color })) })

  it('lands on the undo stack with no code of its own', () => {
    place(1)
    const before = state().history.past.length
    paint('#ff0000')
    expect(state().history.past.length).toBe(before + 1)
  })

  it('is undone back to unpainted, not to some other colour', () => {
    place(1)
    paint('#ff0000')
    expect(state().placements[0]?.color).toBe('#ff0000')

    state().undo()
    expect(state().placements[0]?.color).toBeUndefined()
    // The part itself is still there — a paint is an edit, not a replacement.
    expect(cols()).toEqual([1])
  })

  it('is redone', () => {
    place(1)
    paint('#ff0000')
    state().undo()
    state().redo()
    expect(state().placements[0]?.color).toBe('#ff0000')
  })

  it('steps back one paint at a time', () => {
    place(1)
    paint('#ff0000')
    paint('#0000ff')
    state().undo()
    expect(state().placements[0]?.color).toBe('#ff0000')
    state().undo()
    expect(state().placements[0]?.color).toBeUndefined()
  })
})
