import { create } from 'zustand'
import {
  type Board,
  type Point2,
  type PlacementRule,
  type SelectMode,
  applySelection,
  clampGroupDelta,
  createBoard,
  footprintRect,
  idsInRect,
  mergeSelection,
  placementOrigin,
  rectArea,
  rectFromCorners,
  slotColumnCount,
  slotRowCount,
} from '@ddd-planner/core'

export interface CatalogPart {
  id: string
  family: string
  file: string
  name: string
  base: string
  variant: string | null
  h: number | null
  w: number | null
  searchKey: string
  triangles: number
  vertices: number
  volumeMm3: number
  sourceBytes: number
  sizeMm: { x: number; y: number; z: number }
  model: string
  thumb: string
  fasteners: { id: string; quantity: number }[]
  supported: boolean
  unsupportedReason?: string
  placement: PlacementRule
}

export interface CatalogFile {
  schemaVersion: number
  families: { id: string; label: string; kind: string; dir: string }[]
  fasteners: Record<string, { id: string; file: string; model: string; thumb: string; volumeMm3: number; sourceBytes: number }>
  parts: CatalogPart[]
}

/** One part placed on the wall. */
export interface Placement {
  readonly id: string
  readonly partId: string
  readonly col: number
  readonly row: number
}

interface State {
  board: Board
  widthIn: number
  heightIn: number
  setWallSize: (size: { widthIn: number; heightIn: number }) => void

  catalog: CatalogFile | null
  catalogError: string | null
  setCatalog: (catalog: CatalogFile) => void
  setCatalogError: (message: string) => void

  placements: Placement[]
  /**
   * Selection is a set, and one part selected is just the one-element case.
   * Keeping a separate `selectedId` beside it would mean every operation had
   * to decide which of the two it trusted.
   */
  selectedIds: string[]

  /**
   * A drag that began on bare wall, in wall-space mm.
   *
   * Every such drag is tracked, but only a modifier-held one *selects* —
   * plain drag has to stay free for the camera, which the Decisions table
   * settled. Tracking the rest is still worth it: it is what tells a click
   * apart from an orbit, so orbiting no longer wipes the selection.
   */
  marquee: { from: Point2; to: Point2; selecting: boolean } | null

  /** The part currently being dragged out of the catalog, if any. */
  draggingPartId: string | null
  hoverSlot: { col: number; row: number } | null

  beginDrag: (partId: string) => void
  setHoverSlot: (slot: { col: number; row: number } | null) => void
  dropDrag: () => void
  cancelDrag: () => void

  select: (id: string | null, mode?: SelectMode) => void
  selectAll: () => void
  beginMarquee: (point: Point2, selecting: boolean) => void
  updateMarquee: (point: Point2) => void
  endMarquee: () => void
  nudge: (dCol: number, dRow: number) => void
  removeSelected: () => void
  clear: () => void
}

/** The wall-face rectangle each placement covers, for marquee hit-testing. */
function footprints(state: Pick<State, 'placements' | 'catalog'>) {
  const out: { id: string; rect: ReturnType<typeof footprintRect> }[] = []
  for (const placement of state.placements) {
    const part = partById(state.catalog, placement.partId)
    if (!part) continue
    const origin = placementOrigin(part.placement, part.h, placement)
    out.push({ id: placement.id, rect: footprintRect(origin, part.sizeMm) })
  }
  return out
}

/**
 * A marquee smaller than this is a click that wobbled, not a drag.
 * 4 mm square, well inside one slot.
 */
const MARQUEE_MIN_AREA_MM2 = 16

let nextId = 1

export const useStore = create<State>((set, get) => ({
  board: createBoard(32, 32),
  widthIn: 32,
  heightIn: 32,
  setWallSize: ({ widthIn, heightIn }) =>
    set({ widthIn, heightIn, board: createBoard(widthIn, heightIn) }),

  catalog: null,
  catalogError: null,
  setCatalog: (catalog) => set({ catalog, catalogError: null }),
  setCatalogError: (catalogError) => set({ catalogError }),

  placements: [],
  selectedIds: [],
  marquee: null,

  draggingPartId: null,
  hoverSlot: null,

  beginDrag: (partId) => set({ draggingPartId: partId, hoverSlot: null }),
  setHoverSlot: (hoverSlot) => set({ hoverSlot }),
  cancelDrag: () => set({ draggingPartId: null, hoverSlot: null }),

  dropDrag: () => {
    const { draggingPartId, hoverSlot, placements } = get()
    // Releasing away from the wall is a cancelled drag, not a failed one.
    if (!draggingPartId || !hoverSlot) {
      set({ draggingPartId: null, hoverSlot: null })
      return
    }
    const placement: Placement = {
      id: `p${nextId++}`,
      partId: draggingPartId,
      col: hoverSlot.col,
      row: hoverSlot.row,
    }
    set({
      placements: [...placements, placement],
      selectedIds: [placement.id],
      draggingPartId: null,
      hoverSlot: null,
    })
  },

  select: (id, mode = 'replace') =>
    set((s) => ({ selectedIds: id === null ? [] : applySelection(s.selectedIds, id, mode) })),

  selectAll: () => set((s) => ({ selectedIds: s.placements.map((p) => p.id) })),

  beginMarquee: (point, selecting) => set({ marquee: { from: point, to: point, selecting } }),

  updateMarquee: (point) =>
    set((s) => (s.marquee ? { marquee: { ...s.marquee, to: point } } : {})),

  endMarquee: () => {
    const state = get()
    const marquee = state.marquee
    if (!marquee) return

    const rect = rectFromCorners(marquee.from, marquee.to)

    // Barely moved: that was a click on bare wall, which clears.
    if (rectArea(rect) < MARQUEE_MIN_AREA_MM2) {
      set({ marquee: null, selectedIds: marquee.selecting ? state.selectedIds : [] })
      return
    }

    // Moved, without a modifier: the user was orbiting. Leave the selection
    // alone — losing it every time you look at the wall from an angle is a
    // small thing that gets infuriating fast.
    if (!marquee.selecting) {
      set({ marquee: null })
      return
    }

    // The band adds, exactly as a modifier-click does. One meaning for one
    // modifier, whether you click or sweep.
    set({
      marquee: null,
      selectedIds: mergeSelection(state.selectedIds, idsInRect(footprints(state), rect)),
    })
  },

  nudge: (dCol, dRow) => {
    const { selectedIds, placements, catalog, board } = get()
    if (selectedIds.length === 0) return

    const selected = placements.filter((p) => selectedIds.includes(p.id))
    const items = selected.map((p) => ({
      col: p.col,
      row: p.row,
      spanCols: partById(catalog, p.partId)?.placement.occupiesColumns ?? 1,
    }))

    // The whole selection moves as one body, or not at all — see
    // clampGroupDelta. Clamping each part on its own would deform the group.
    const move = clampGroupDelta(items, { dCol, dRow }, {
      cols: slotColumnCount(board),
      rows: slotRowCount(board),
    })
    if (move.dCol === 0 && move.dRow === 0) return

    const moving = new Set(selectedIds)
    set({
      placements: placements.map((p) =>
        moving.has(p.id) ? { ...p, col: p.col + move.dCol, row: p.row + move.dRow } : p,
      ),
    })
  },

  removeSelected: () => {
    const { selectedIds, placements } = get()
    if (selectedIds.length === 0) return
    const doomed = new Set(selectedIds)
    set({ placements: placements.filter((p) => !doomed.has(p.id)), selectedIds: [] })
  },

  clear: () => set({ placements: [], selectedIds: [], marquee: null }),
}))

export function partById(catalog: CatalogFile | null, id: string | null): CatalogPart | null {
  if (!catalog || !id) return null
  return catalog.parts.find((p) => p.id === id) ?? null
}
