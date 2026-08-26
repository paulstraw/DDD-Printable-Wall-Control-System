import { create } from 'zustand'
import {
  type Assembly,
  type Axis,
  type Board,
  type Point2,
  type Orientation,
  type OrientedPlacement,
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
  fastenersByOrientation?: Partial<Record<Orientation, { id: string; quantity: number }[]>>
  supported: boolean
  unsupportedReason?: string
  /** Every way this part can be mounted. Almost every part has one entry. */
  orientations: Partial<Record<Orientation, OrientedPlacement>>
}

/**
 * How a part is mounted, when the catalog offers a choice.
 *
 * Falls back to whichever single orientation the part has, so a caller never
 * has to ask whether this part is one of the ones that can be turned.
 */
export function orientedFor(part: CatalogPart, orientation: Orientation): OrientedPlacement {
  return (
    part.orientations[orientation] ??
    part.orientations.flat ??
    (part.orientations.shelf as OrientedPlacement)
  )
}

/** The orientations a part offers, in a stable order. */
export function orientationsOf(part: CatalogPart): Orientation[] {
  return (['flat', 'shelf'] as const).filter((o) => part.orientations[o] !== undefined)
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
  /**
   * Which way this one is mounted.
   *
   * On the placement rather than the part, because the same spacer blank is
   * legitimately a wall plate here and a shelf there, and only the person
   * building the wall knows which.
   */
  readonly orientation: Orientation
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
  /**
   * Whether the pointer has moved since the drag began.
   *
   * A press that never moves is a *tap*, and on a touch screen that is the
   * only way to pick a part without fighting the scrolling list. Tapping a
   * card leaves it armed; tapping the wall then places it. A press that does
   * move is an ordinary drag and drops on release.
   */
  dragMoved: boolean

  /** Add parts at given slots and select them. Used by a drop and by the example. */
  addPlacements: (
    refs: readonly { partId: string; col: number; row: number; orientation?: Orientation }[],
  ) => void

  /**
   * Turn every part in the selection that can be turned.
   *
   * Acts on the whole selection, the way nudge and delete do — a selection of
   * one is not a special case. Parts that offer only one orientation are left
   * alone rather than refusing the whole gesture, so selecting a joint and
   * pressing R turns the spacer and leaves the brackets where they are.
   */
  setOrientation: (orientation: Orientation) => void

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

  /**
   * The cross-section overlay. Depth is the axis the 3D view reads worst, so
   * this exists to let a depth claim be looked at rather than argued about.
   */
  section: SectionState
  /** `C`. Keeps where the plane was, so a glance away and back is free. */
  toggleSection: () => void
  setSectionAxis: (axis: Axis) => void
  setSectionDepth: (depth: number) => void
  flipSection: () => void
  setSectionDragging: (dragging: boolean) => void

  select: (id: string | null, mode?: SelectMode) => void
  selectAll: () => void
  beginMarquee: (point: Point2, selecting: boolean) => void
  updateMarquee: (point: Point2) => void
  endMarquee: () => void
  nudge: (dCol: number, dRow: number) => void
  removeSelected: () => void
  clear: () => void
}

/**
 * The cross-section overlay: one clipping plane, and where it sits.
 *
 * Ephemeral on purpose. It is not in the document, not in the share link and
 * not in localStorage — the document schema is versioned and validated, and
 * view state has no business riding a share link into someone else's session.
 */
export interface SectionState {
  readonly on: boolean
  readonly axis: Axis
  /** Where the plane cuts, in wall-space mm along `axis`. */
  readonly depth: number
  /**
   * Which half is kept. Fixed per axis and flipped only by hand — never
   * derived from where the camera is, or the picture would change as you
   * orbited and stop being a measurement.
   */
  readonly flipped: boolean
  /**
   * Set while the margin handle is held, so OrbitControls stands down — the
   * same job `dragging` and `marquee.selecting` already do in `Scene`.
   */
  readonly dragging: boolean
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
      spanCols: spanColsOf(state.catalog, p.partId, p.orientation),
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
    const oriented = orientedFor(part, placement.orientation)
    const origin = placementOrigin(oriented.rule, part.h, placement)
    out.push({ id: placement.id, rect: footprintRect(origin, oriented.sizeMm) })
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

  // Opens on Y at 0: the plane of the board's front face, where the wall
  // side and the room part company.
  section: { on: false, axis: 'y', depth: 0, flipped: false, dragging: false },
  // Toggling off mid-drag would otherwise leave the camera standing down
  // with no handle left to release it.
  toggleSection: () =>
    set((s) => ({ section: { ...s.section, on: !s.section.on, dragging: false } })),
  // Depth carries across an axis change. It is one number by design, and
  // resetting it would throw away a place the user had swept to.
  setSectionAxis: (axis) => set((s) => ({ section: { ...s.section, axis } })),
  setSectionDepth: (depth) => set((s) => ({ section: { ...s.section, depth } })),
  flipSection: () => set((s) => ({ section: { ...s.section, flipped: !s.section.flipped } })),
  setSectionDragging: (dragging) => set((s) => ({ section: { ...s.section, dragging } })),

  dragging: null,
  hoverSlot: null,
  dragMoved: false,

  beginPartDrag: (partId) =>
    set((s) => ({
      // Tapping the armed card again puts it down rather than re-arming it.
      dragging:
        s.dragging?.kind === 'part' && s.dragging.partId === partId
          ? null
          : { kind: 'part', partId },
      hoverSlot: null,
      dragMoved: false,
    })),
  beginAssemblyDrag: (assemblyId) =>
    set((s) => ({
      dragging:
        s.dragging?.kind === 'assembly' && s.dragging.assemblyId === assemblyId
          ? null
          : { kind: 'assembly', assemblyId },
      hoverSlot: null,
      dragMoved: false,
    })),
  setHoverSlot: (hoverSlot) => set({ hoverSlot, dragMoved: true }),
  cancelDrag: () => set({ dragging: null, hoverSlot: null, dragMoved: false }),

  dropDrag: () => {
    const state = get()
    const { dragging, hoverSlot, dragMoved } = state
    if (!dragging) return

    // A press that never moved is a tap: stay armed and wait for a tap on
    // the wall. This is what makes placing work on a touch screen, where
    // dragging out of a scrolling list is a fight.
    if (!dragMoved && !hoverSlot) return

    // Releasing away from the wall is a cancelled drag, not a failed one.
    if (!hoverSlot) {
      set({ dragging: null, hoverSlot: null, dragMoved: false })
      return
    }

    const landing =
      dragging.kind === 'part'
        ? [{ partId: dragging.partId, col: hoverSlot.col, row: hoverSlot.row }]
        : assemblyLanding(state, dragging.assemblyId, hoverSlot)

    set({ dragging: null, hoverSlot: null, dragMoved: false })
    if (landing.length === 0) return
    get().addPlacements(landing)
  },

  addPlacements: (refs) => {
    if (refs.length === 0) return
    const catalog = get().catalog
    const added: Placement[] = refs.map((ref) => {
      const part = partById(catalog, ref.partId)
      // A part with no flat orientation — a Gridfinity frame — is placed as
      // the only thing it can be, without the caller having to know that.
      const fallback = part ? (orientationsOf(part)[0] ?? 'flat') : 'flat'
      return {
        id: `p${nextId++}`,
        partId: ref.partId,
        col: ref.col,
        row: ref.row,
        orientation: ref.orientation ?? fallback,
      }
    })
    set((s) => ({
      placements: [...s.placements, ...added],
      // Newly placed parts arrive selected, so they can be nudged straight
      // away and so the catalog ranks itself around them.
      selectedIds: added.map((p) => p.id),
    }))
  },

  setOrientation: (orientation) => {
    const { catalog, placements, selectedIds } = get()
    if (selectedIds.length === 0) return

    let changed = false
    const next = placements.map((placement) => {
      if (!selectedIds.includes(placement.id)) return placement
      if (placement.orientation === orientation) return placement
      const part = partById(catalog, placement.partId)
      if (!part || part.orientations[orientation] === undefined) return placement
      changed = true
      return { ...placement, orientation }
    })
    if (changed) set({ placements: next })
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
      spanCols: spanColsOf(catalog, p.partId, p.orientation),
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
      placements: placements.map((p) => ({
        partId: p.partId,
        col: p.col,
        row: p.row,
        orientation: p.orientation,
      })),
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

/** Column span, which the turn does not change — it is about the wall X axis. */
function spanColsOf(
  catalog: CatalogFile | null,
  partId: string,
  orientation: Orientation,
): number {
  const part = partById(catalog, partId)
  return part ? orientedFor(part, orientation).rule.occupiesColumns : 1
}

export function partById(catalog: CatalogFile | null, id: string | null): CatalogPart | null {
  if (!catalog || !id) return null
  return catalog.parts.find((p) => p.id === id) ?? null
}
