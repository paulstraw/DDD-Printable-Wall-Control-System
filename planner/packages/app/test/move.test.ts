import { beforeEach, describe, expect, it } from 'vitest'
import {
  COLUMN_PITCH_MM,
  SLOT_ROW_PITCH_MM,
  slotColumnCount,
  slotColumnX,
  slotRowCenterZ,
} from '@ddd-planner/core'
import { EMPTY_HISTORY } from '../src/history'
import { type CatalogFile, useStore } from '../src/store'

/**
 * Dragging parts that are already on the wall.
 *
 * Everything here is fed `Point2`s, because that is all the components hand
 * the store: `PartModel` names what was pressed and where the ray met the
 * wall, and `useWallPointer` reports where it has got to. What the raycast
 * cannot be tested for, the arithmetic and the bookkeeping can — and the
 * bookkeeping is the part that goes wrong quietly, since a drag that leaves
 * two history entries behind, or none, looks perfectly fine until ⌘Z.
 */

const INITIAL = useStore.getState()

/**
 * Enough of a catalog to answer everything the store asks a part: how many
 * columns it stands in, and where its box lands — the marquee hit-tests
 * against that box, so a rule with holes in it fails inside `placementOrigin`
 * rather than in the test that meant to exercise the band.
 */
const rule = (occupiesColumns: number) => ({
  occupiesColumns,
  offsetFromSlotXMm: 0,
  frontFaceYMm: -6,
  bottomBelowSlotCenterMm: { odd: 12.7, even: 12.7 },
  matesByHeight: true,
})

const CATALOG = {
  schemaVersion: 1,
  families: [],
  fasteners: {},
  parts: [
    {
      id: 'part-a',
      h: null,
      orientations: { flat: { rule: rule(1), sizeMm: { x: 20, y: 6, z: 25 }, rotateXDeg: 0 } },
    },
    {
      id: 'wide',
      h: null,
      orientations: { flat: { rule: rule(3), sizeMm: { x: 76, y: 6, z: 25 }, rotateXDeg: 0 } },
    },
  ],
} as unknown as CatalogFile

beforeEach(() => {
  useStore.setState({ ...INITIAL, history: EMPTY_HISTORY }, true)
  useStore.setState({ catalog: CATALOG, history: EMPTY_HISTORY })
})

const state = () => useStore.getState()

/** A point on the wall plane over the given slot. */
const over = (col: number, row: number) => ({ x: slotColumnX(col), z: slotRowCenterZ(row) })

/** Where each part stands, in the order they were placed. */
const slots = () => state().placements.map((p) => ({ col: p.col, row: p.row }))

const ids = () => state().placements.map((p) => p.id)

/**
 * Put parts on the wall with nothing selected and nothing on the stack.
 * `addPlacements` deliberately leaves what it placed selected — see the
 * store — which is the right arrival behaviour and the wrong starting point
 * for a test about what a press does to a selection.
 */
function place(refs: { partId?: string; col: number; row: number }[]) {
  state().addPlacements(refs.map((r) => ({ partId: r.partId ?? 'part-a', col: r.col, row: r.row })))
  useStore.setState({ selectedIds: [], history: EMPTY_HISTORY })
}

/** Press, carry to a slot, release. */
function drag(id: string, from: { col: number; row: number }, to: { col: number; row: number }) {
  state().pressPart(id, false, over(from.col, from.row))
  state().updateMove(over(to.col, to.row))
  state().endMove()
}

describe('carrying a part to another slot', () => {
  it('moves it, and leaves everything else alone', () => {
    place([{ col: 1, row: 1 }, { col: 5, row: 5 }])
    const [a] = ids()

    drag(a as string, { col: 1, row: 1 }, { col: 4, row: 3 })
    expect(slots()).toEqual([{ col: 4, row: 3 }, { col: 5, row: 5 }])
  })

  it('keeps the id, so the outline and the selection follow it', () => {
    place([{ col: 1, row: 1 }])
    const before = ids()

    drag(before[0] as string, { col: 1, row: 1 }, { col: 2, row: 2 })
    expect(ids()).toEqual(before)
    expect(state().selectedIds).toEqual(before)
  })

  it('carries the whole selection as one body', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 4 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [a as string, b as string] })

    drag(a as string, { col: 1, row: 1 }, { col: 6, row: 1 })
    expect(slots()).toEqual([{ col: 6, row: 1 }, { col: 7, row: 1 }, { col: 3, row: 4 }])
  })

  /*
   * `slotDelta` measures from the grab point, so the part keeps its offset
   * from the pointer. Grabbing the right-hand end of a three-column plate
   * and dropping two columns along moves it two columns, rather than
   * snapping its anchor under the cursor.
   */
  it('preserves where inside the part it was grabbed', () => {
    place([{ partId: 'wide', col: 2, row: 2 }])
    const [a] = ids()

    const grabbed = { x: slotColumnX(4), z: slotRowCenterZ(2) }
    state().pressPart(a as string, false, grabbed)
    state().updateMove({ x: grabbed.x + 2 * COLUMN_PITCH_MM, z: grabbed.z })
    state().endMove()

    expect(slots()).toEqual([{ col: 4, row: 2 }])
  })

  it('ignores travel of less than half a pitch', () => {
    place([{ col: 3, row: 3 }])
    const [a] = ids()
    const grabbed = over(3, 3)

    state().pressPart(a as string, false, grabbed)
    state().updateMove({ x: grabbed.x + COLUMN_PITCH_MM * 0.49, z: grabbed.z + SLOT_ROW_PITCH_MM * 0.49 })
    expect(slots()).toEqual([{ col: 3, row: 3 }])
    state().endMove()
    expect(slots()).toEqual([{ col: 3, row: 3 }])
  })
})

describe('the board edge', () => {
  it('slides a group along the edge rather than folding it up against one', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [a as string, b as string] })

    // Far past the right-hand edge of a 32" board.
    drag(a as string, { col: 1, row: 1 }, { col: 90, row: 1 })

    const [first, second] = slots()
    expect((second as { col: number }).col - (first as { col: number }).col).toBe(1)
    expect((second as { col: number }).col).toBe(slotColumnCount(state().board) - 1)
  })

  /*
   * Every frame is measured from where the drag began rather than from where
   * the last one left off, so pushing into an edge and coming back does not
   * accumulate the moves the clamp refused.
   */
  it('comes back to the slots it left after being held against an edge', () => {
    place([{ col: 4, row: 2 }])
    const [a] = ids()

    state().pressPart(a as string, false, over(4, 2))
    state().updateMove(over(90, 2))
    state().updateMove(over(200, 2))
    state().updateMove(over(4, 2))
    state().endMove()

    expect(slots()).toEqual([{ col: 4, row: 2 }])
  })
})

describe('what the press means', () => {
  it('takes a part that was not selected, so a loose bracket moves at once', () => {
    place([{ col: 1, row: 1 }, { col: 5, row: 1 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [b as string] })

    state().pressPart(a as string, false, over(1, 1))
    expect(state().selectedIds).toEqual([a])
  })

  /*
   * The bug this whole rule exists for: selecting on the press collapsed a
   * six-part selection to one the instant you reached for it, and the drag
   * that followed carried a single bracket.
   */
  it('leaves a selection it was pressed inside of alone', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [a as string, b as string] })

    state().pressPart(a as string, false, over(1, 1))
    expect(state().selectedIds).toEqual([a, b])
  })

  it('collapses onto the pressed part when the press turns out to be a click', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [a as string, b as string] })

    state().pressPart(a as string, false, over(1, 1))
    state().endMove()
    expect(state().selectedIds).toEqual([a])
  })

  it('keeps the selection when the press turns out to be a drag', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const [a, b] = ids()
    useStore.setState({ selectedIds: [a as string, b as string] })

    drag(a as string, { col: 1, row: 1 }, { col: 4, row: 1 })
    expect(state().selectedIds).toEqual([a, b])
  })

  it('hands a modifier-held press to the marquee, with the toggle held back', () => {
    place([{ col: 1, row: 1 }])
    const [a] = ids()

    state().pressPart(a as string, true, over(1, 1))
    expect(state().moving).toBeNull()
    expect(state().marquee).toMatchObject({ selecting: true, pressed: a })
    expect(state().selectedIds).toEqual([])
  })

  it('toggles the part when that band never grew', () => {
    place([{ col: 1, row: 1 }])
    const [a] = ids()

    state().pressPart(a as string, true, over(1, 1))
    state().endMarquee()
    expect(state().selectedIds).toEqual([a])

    state().pressPart(a as string, true, over(1, 1))
    state().endMarquee()
    expect(state().selectedIds).toEqual([])
  })

  it('adds what a swept band caught, and does not toggle the part it began on', () => {
    place([{ col: 1, row: 1 }, { col: 2, row: 1 }])
    const [a, b] = ids()

    state().pressPart(a as string, true, over(1, 1))
    state().updateMarquee(over(6, 6))
    state().endMarquee()
    expect(state().selectedIds).toEqual([a, b])
  })

  it('ignores a press on a part while a catalog part is in hand', () => {
    place([{ col: 1, row: 1 }])
    const [a] = ids()
    state().beginPartDrag('part-a')

    state().pressPart(a as string, false, over(1, 1))
    expect(state().moving).toBeNull()
    expect(state().marquee).toBeNull()
  })
})

describe('history', () => {
  it('costs one entry for the whole drag, however many frames it took', () => {
    place([{ col: 1, row: 1 }])
    const [a] = ids()

    state().pressPart(a as string, false, over(1, 1))
    for (let col = 2; col <= 8; col++) state().updateMove(over(col, 1))
    state().endMove()

    expect(state().history.past).toHaveLength(1)
  })

  it('steps back to where the parts started, not to somewhere mid-drag', () => {
    place([{ col: 1, row: 1 }])
    const [a] = ids()

    state().pressPart(a as string, false, over(1, 1))
    for (let col = 2; col <= 8; col++) state().updateMove(over(col, 1))
    state().endMove()
    expect(slots()).toEqual([{ col: 8, row: 1 }])

    state().undo()
    expect(slots()).toEqual([{ col: 1, row: 1 }])
    expect(ids()).toEqual([a])
  })

  it('writes nothing for a drag that ends where it began', () => {
    place([{ col: 4, row: 4 }])
    const [a] = ids()

    state().pressPart(a as string, false, over(4, 4))
    state().updateMove(over(7, 7))
    state().updateMove(over(4, 4))
    state().endMove()

    expect(slots()).toEqual([{ col: 4, row: 4 }])
    expect(state().history.past).toEqual([])
  })

  it('leaves no entry behind when a move is abandoned', () => {
    place([{ col: 2, row: 2 }])
    const [a] = ids()

    state().pressPart(a as string, false, over(2, 2))
    state().updateMove(over(6, 6))
    expect(slots()).toEqual([{ col: 6, row: 6 }])

    state().cancelMove()
    expect(slots()).toEqual([{ col: 2, row: 2 }])
    expect(state().moving).toBeNull()
    expect(state().history.past).toEqual([])
  })

  /*
   * A cancel that left a dead entry would make the next ⌘Z look broken:
   * one press that visibly does nothing, because it restores a wall the
   * user is already looking at.
   */
  it('lets undo reach past an abandoned move to the edit before it', () => {
    place([{ col: 2, row: 2 }])
    const [a] = ids()
    state().nudge(1, 0)

    state().pressPart(a as string, false, over(3, 2))
    state().updateMove(over(6, 6))
    state().cancelMove()

    state().undo()
    expect(slots()).toEqual([{ col: 2, row: 2 }])
  })
})
