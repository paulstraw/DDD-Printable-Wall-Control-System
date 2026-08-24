import { create } from 'zustand'
import {
  type Assembly,
  type Board,
  type Point2,
  type PlacementRule,
  type SelectMode,
  absoluteParts,
  applySelection,
  clampGroupDelta,
  createAssembly,
  createBoard,
  footprintRect,
  idsInRect,
  type PlannerState,
  mergeSelection,
  normaliseAssemblyName,
  placementOrigin,
  rectArea,
  rectFromCorners,
  slotColumnCount,
  slotRowCount,
  uniqueAssemblyName,
} from '@ddd-planner/core'

export interface CatalogPart {
  id: string
  family: string
  role: 'sidepiece' | 'centerpiece'
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

  /**
   * What is being dragged onto the wall, if anything.
   *
   * A part and a whole assembly take the same route — hover, snap, drop —
   * so they share one drag rather than two parallel ones that would have to
   * be kept in step in every handler.
   */
  dragging: DragSubject | null
  hoverSlot: { col: number; row: number } | null

  beginPartDrag: (partId: string) => void
  beginAssemblyDrag: (assemblyId: string) => void
  setHoverSlot: (slot: { col: number; row: number } | null) => void
  dropDrag: () => void
  cancelDrag: () => void

  /** Groups the user has saved, newest last. */
  assemblies: Assembly[]
  /**
   * Save what is selected under a name. Returns the name it was actually
   * stored under — which may be numbered — or `null` if there was nothing
   * to save or nothing to call it.
   */
  saveSelectionAsAssembly: (rawName: string) => string | null
  deleteAssembly: (id: string) => void

  /** Everything worth saving, sharing or exporting. */
  snapshot: () => PlannerState
  /** Replace the whole wall — a restored autosave, a link, an imported file. */
  hydrate: (state: PlannerState) => void

  /**
   * Issues the user has waved away. Kept for the session only — they are a
   * reaction to what is on screen now, not a property of the wall, so they
   * are deliberately not part of the saved document.
   */
  dismissedIssues: readonly string[]
  dismissIssue: (id: string) => void
  restoreIssues: () => void

  select: (id: string | null, mode?: SelectMode) => void
  selectAll: () => void
  beginMarquee: (point: Point2, selecting: boolean) => void
  updateMarquee: (point: Point2) => void
  endMarquee: () => void
  nudge: (dCol: number, dRow: number) => void
  removeSelected: () => void
  clear: () => void
}

export type DragSubject =
  | { kind: 'part'; partId: string }
  | { kind: 'assembly'; assemblyId: string }

/**
 * Where an assembly's parts land when dropped on `anchor`, pulled back onto
 * the board if the drop would hang it off an edge.
 *
 * The correction is `clampGroupDelta` asked for a move of *zero*: the
 * allowed range for a group already hanging off the right edge is entirely
 * negative, so clamping zero into it returns exactly the shift needed to
 * bring the group back. One rule, used for both nudging and dropping.
 */
function assemblyLanding(
  state: Pick<State, 'assemblies' | 'catalog' | 'board'>,
  assemblyId: string,
  anchor: { col: number; row: number },
): { partId: string; col: number; row: number }[] {
  const assembly = state.assemblies.find((a) => a.id === assemblyId)
  if (!assembly) return []

  const landed = absoluteParts(assembly, anchor)
  const move = clampGroupDelta(
    landed.map((p) => ({
      col: p.col,
      row: p.row,
      spanCols: partById(state.catalog, p.partId)?.placement.occupiesColumns ?? 1,
    })),
    { dCol: 0, dRow: 0 },
    { cols: slotColumnCount(state.board), rows: slotRowCount(state.board) },
  )

  return landed.map((p) => ({ ...p, col: p.col + move.dCol, row: p.row + move.dRow }))
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
let nextAssemblyId = 1

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
  assemblies: [],
  dismissedIssues: [],

  dragging: null,
  hoverSlot: null,

  beginPartDrag: (partId) => set({ dragging: { kind: 'part', partId }, hoverSlot: null }),
  beginAssemblyDrag: (assemblyId) =>
    set({ dragging: { kind: 'assembly', assemblyId }, hoverSlot: null }),
  setHoverSlot: (hoverSlot) => set({ hoverSlot }),
  cancelDrag: () => set({ dragging: null, hoverSlot: null }),

  dropDrag: () => {
    const state = get()
    const { dragging, hoverSlot, placements } = state
    // Releasing away from the wall is a cancelled drag, not a failed one.
    if (!dragging || !hoverSlot) {
      set({ dragging: null, hoverSlot: null })
      return
    }

    const landing =
      dragging.kind === 'part'
        ? [{ partId: dragging.partId, col: hoverSlot.col, row: hoverSlot.row }]
        : assemblyLanding(state, dragging.assemblyId, hoverSlot)

    if (landing.length === 0) {
      set({ dragging: null, hoverSlot: null })
      return
    }

    const added: Placement[] = landing.map((p) => ({ id: `p${nextId++}`, ...p }))
    set({
      placements: [...placements, ...added],
      selectedIds: added.map((p) => p.id),
      dragging: null,
      hoverSlot: null,
    })
  },

  deleteAssembly: (id) =>
    set((s) => ({
      assemblies: s.assemblies.filter((a) => a.id !== id),
      // Deleting the definition must not disturb anything already on the
      // wall — placed parts stopped being part of it the moment they landed.
      dragging: s.dragging?.kind === 'assembly' && s.dragging.assemblyId === id ? null : s.dragging,
    })),

  saveSelectionAsAssembly: (rawName) => {
    const { selectedIds, placements, assemblies } = get()
    const name = normaliseAssemblyName(rawName)
    if (!name || selectedIds.length === 0) return null

    // Save in wall order, not click order: an assembly the user built
    // left-to-right should read that way when it is listed.
    const chosen = new Set(selectedIds)
    const members = placements
      .filter((p) => chosen.has(p.id))
      .slice()
      .sort((a, b) => a.col - b.col || a.row - b.row)

    const unique = uniqueAssemblyName(
      assemblies.map((a) => a.name),
      name,
    )
    const assembly = createAssembly(`a${nextAssemblyId++}`, unique, members)
    set({ assemblies: [...assemblies, assembly] })
    return unique
  },

  dismissIssue: (id) =>
    set((s) => ({
      dismissedIssues: s.dismissedIssues.includes(id)
        ? s.dismissedIssues
        : [...s.dismissedIssues, id],
    })),

  restoreIssues: () => set({ dismissedIssues: [] }),

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

  snapshot: () => {
    const { widthIn, heightIn, placements, assemblies } = get()
    return {
      widthIn,
      heightIn,
      // Placement ids are this session's own bookkeeping; a saved wall is
      // just parts at slots.
      placements: placements.map((p) => ({ partId: p.partId, col: p.col, row: p.row })),
      assemblies,
    }
  },

  hydrate: (state) =>
    set({
      widthIn: state.widthIn,
      heightIn: state.heightIn,
      board: createBoard(state.widthIn, state.heightIn),
      placements: state.placements.map((p) => ({ id: `p${nextId++}`, ...p })),
      // Ids from the document are positional; re-issue them from this
      // session's counter so a later save cannot collide with them.
      assemblies: state.assemblies.map((a) => ({ ...a, id: `a${nextAssemblyId++}` })),
      selectedIds: [],
      marquee: null,
      dragging: null,
      hoverSlot: null,
    }),

  clear: () => set({ placements: [], selectedIds: [], marquee: null }),
}))

export function partById(catalog: CatalogFile | null, id: string | null): CatalogPart | null {
  if (!catalog || !id) return null
  return catalog.parts.find((p) => p.id === id) ?? null
}
