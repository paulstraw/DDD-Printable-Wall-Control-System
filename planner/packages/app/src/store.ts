import { create } from 'zustand'
import { type Board, type PlacementRule, createBoard } from '@ddd-planner/core'

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
  sizeMm: { x: number; y: number; z: number }
  model: string
  thumb: string
  fasteners: { id: string; quantity: number }[]
  placement: PlacementRule
}

export interface CatalogFile {
  schemaVersion: number
  families: { id: string; label: string; kind: string; dir: string }[]
  fasteners: Record<string, { id: string; file: string; model: string; thumb: string; volumeMm3: number }>
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
  selectedId: string | null

  /** The part currently being dragged out of the catalog, if any. */
  draggingPartId: string | null
  hoverSlot: { col: number; row: number } | null

  beginDrag: (partId: string) => void
  setHoverSlot: (slot: { col: number; row: number } | null) => void
  dropDrag: () => void
  cancelDrag: () => void

  select: (id: string | null) => void
  nudge: (dCol: number, dRow: number) => void
  removeSelected: () => void
  clear: () => void
}

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
  selectedId: null,

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
      selectedId: placement.id,
      draggingPartId: null,
      hoverSlot: null,
    })
  },

  select: (selectedId) => set({ selectedId }),

  nudge: (dCol, dRow) => {
    const { selectedId, placements } = get()
    if (!selectedId) return
    set({
      placements: placements.map((p) =>
        p.id === selectedId
          ? { ...p, col: Math.max(0, p.col + dCol), row: Math.max(0, p.row + dRow) }
          : p,
      ),
    })
  },

  removeSelected: () => {
    const { selectedId, placements } = get()
    if (!selectedId) return
    set({ placements: placements.filter((p) => p.id !== selectedId), selectedId: null })
  },

  clear: () => set({ placements: [], selectedId: null }),
}))

export function partById(catalog: CatalogFile | null, id: string | null): CatalogPart | null {
  if (!catalog || !id) return null
  return catalog.parts.find((p) => p.id === id) ?? null
}
