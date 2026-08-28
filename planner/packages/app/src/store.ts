import { create } from 'zustand'
import {
  type Assembly,
  type Axis,
  type Board,
  type Point2,
  type Orientation,
  type OrientedPlacement,
  type SelectMode,
  type AssemblyPart,
  type PlacedRef,
  type WallColors,
  applySelection,
  clampGroupDelta,
  createAssembly,
  DEFAULT_COLORS,
  createBoard,
  decodeClipping,
  encodeClipping,
  footprintRect,
  groupColumnSpan,
  idsInRect,
  type PlannerState,
  mergeSelection,
  normaliseAssemblyName,
  placementOrigin,
  rectArea,
  rectFromCorners,
  slotColumnCount,
  slotDelta,
  slotRowCount,
  uniqueAssemblyName,
} from '@ddd-planner/core'
import {
  EMPTY_HISTORY,
  type History,
  type Moment,
  record,
  redo as redoFrom,
  undo as undoFrom,
} from './history'
import { DEFAULT_DEPTH_MM, hiddenBySection, sectionPlane } from './scene/section'

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
  /**
   * What this one is painted, if anyone said.
   *
   * Beside `orientation` for the same reason it is: the same blank is
   * legitimately black here and red there, and only the person building the
   * wall knows which. Being on the placement is also what buys undo — history
   * watches `placements` change, so painting a selection lands on the stack
   * with no code written for it. A color kept in a side map keyed by
   * placement id would be silently skipped by ⌘Z, and nothing would say so.
   *
   * Absent is the common case and does not mean grey. It means *whatever the
   * wall's default is*, so changing that default repaints every part that
   * never asked for anything else — see `resolveColor` in core, which is the
   * only place that rule is written down.
   */
  readonly color?: string
}

/**
 * What a paste did.
 *
 * `ok: false` means the text was not a clipping at all, and the paste is not
 * this app's to consume. `ok: true` means it was, even when `count` is zero —
 * a clipping naming only parts this library lacks is still ours, still eaten,
 * and still worth saying something about.
 *
 * Counts rather than a sentence, because the store does not know where the
 * sentence is going, and a store that carried the wording would be a store
 * that had to be edited to change a comma.
 */
export type PasteResult =
  | { readonly ok: false }
  | { readonly ok: true; readonly count: number; readonly skipped: number }

interface State {
  board: Board
  widthIn: number
  heightIn: number
  setWallSize: (size: { widthIn: number; heightIn: number }) => void

  /**
   * Whether the board is the size it is because of the restore on arrival.
   *
   * True for exactly one thing, and it exists for exactly one reader: the
   * camera. Every other way the board changes size — typing one, importing a
   * wall, stepping through history — is something somebody asked for a
   * moment ago, and re-framing the view to suit is the answer. The restore
   * is the one nobody asked for, and it lands late, because it waits for the
   * catalog so it can name the parts it had to drop. By then the page has
   * been usable for a second or two and the reader may already be looking
   * somewhere of their own choosing. See `useFaceOn`.
   */
  sizeFromRestore: boolean

  /**
   * The three colors that belong to the wall rather than to any part: what
   * is behind it, what the panel is finished in, and what a part is printed
   * in unless it says otherwise.
   *
   * Changing one makes **no history entry**, which is the treatment typing a
   * new wall size already gets and for the same reason — you do not undo your
   * way out of choosing a panel finish. The subscription that writes history
   * watches `placements`, so this needs no code to arrange; it needs only not
   * to touch `placements`. A `Moment` still *carries* these, so undoing an
   * import cannot strand you on the imported wall's scheme.
   */
  colors: WallColors
  setWallColor: (which: keyof WallColors, color: string) => void

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
  marquee: {
    from: Point2
    to: Point2
    selecting: boolean
    /**
     * The part the band started on, if it started on one.
     *
     * A modifier-held press on a part cannot know yet whether it is a click
     * or the start of a sweep, and the two want opposite things: a click
     * toggles that part, a sweep adds everything the band catches and would
     * be spoiled by a toggle it never asked for. So the toggle waits here
     * until `endMarquee` knows which gesture it was.
     */
    pressed: string | null
  } | null

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
   * Parts already on the wall, on their way to other slots.
   *
   * Deliberately its own state rather than a third `DragSubject`. The two
   * kinds of `dragging` end by *adding* parts, and this one ends by leaving
   * the parts it moved exactly where they already are, so a single `dropDrag`
   * would have to branch on which it was before it could do anything.
   * `hoverSlot` and the drop ghost have no meaning here either.
   *
   * What it costs is that a second thing now has to stand the camera down
   * and lock the keyboard, which is why nobody reads this field to find that
   * out — see `handsOnWall`.
   */
  moving: MoveDrag | null
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

  /**
   * Paint every part in the selection, or strip the paint off them.
   *
   * `null` means "back to the wall default" and removes the override
   * entirely, rather than writing today's default onto each part — which
   * would look identical and then quietly stop following the wall.
   *
   * Unlike `setOrientation` this asks nothing of the catalog: every part can
   * be printed in every color, so there is no such thing as a part the
   * gesture has to skip.
   */
  paintSelection: (color: string | null) => void

  /**
   * The pointer went down on a placed part.
   *
   * One entry point for what used to be a bare `select`, because the press
   * on a part now has three futures — a click, a move, a box-select — and
   * only the release knows which. Deciding here is what broke the old
   * behaviour: selecting on `pointerdown` collapsed a six-part selection to
   * one the instant you reached for it.
   */
  pressPart: (id: string, additive: boolean, point: Point2) => void
  /** Carry the selection to wherever the pointer has got to. */
  updateMove: (point: Point2) => void
  /** Release: commit where the parts stand, in one history entry. */
  endMove: () => void
  /** Escape: put them back, and leave no trace on the stack. */
  cancelMove: () => void

  beginPartDrag: (partId: string) => void
  beginAssemblyDrag: (assemblyId: string) => void
  setHoverSlot: (slot: { col: number; row: number } | null) => void
  dropDrag: () => void
  cancelDrag: () => void

  /**
   * The last thing copied in this session.
   *
   * A fallback, not the truth. The system clipboard is the truth — see
   * `useClipboard` — and this is consulted only where the system one cannot
   * be read at all, which in practice means the Paste button on a phone.
   */
  clipping: string | null

  /**
   * The selection as clipboard text, and `null` if nothing is selected.
   * Copying changes no placements, so a cut costs one history entry rather
   * than two.
   */
  copySelection: () => string | null
  cutSelection: () => string | null

  /**
   * Put a clipping on the wall, beside where it was taken from.
   *
   * Reports whether the text *was* a clipping — which is not the same as
   * whether anything landed. A clipping naming only parts this library lacks
   * is still ours, still consumed, and still worth a word about.
   *
   * It reports the counts rather than the sentence, because the store does not
   * know where the sentence is going. The two callers say it differently: the
   * paste *event* has a wall under the pointer, the Paste *button* has a
   * person who pressed it and is owed an answer either way.
   */
  pasteText: (text: string) => PasteResult

  /**
   * Where the last paste landed, so pressing paste again marches the copy
   * along the wall instead of piling it up on itself. Keyed by the payload,
   * so copying something new starts over.
   */
  pasteAnchor: { key: string; col: number; row: number } | null

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
  /**
   * Replace the whole wall — a restored autosave, a link, an imported file.
   *
   * `beginning` marks the restore that happens on arrival. There is nothing
   * before the beginning, so it is the one wholesale replacement that must
   * not be undoable; an import, which discards an hour's work with no
   * confirmation, very much is.
   */
  hydrate: (state: PlannerState, options?: { readonly beginning?: boolean }) => void

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
  /**
   * Move the selection by whole slots.
   *
   * `repeat` is the browser's own `KeyboardEvent.repeat`: the parts move,
   * but no history entry is pushed. A held arrow key is one gesture and
   * should cost one undo, not the thirty the OS generated it out of.
   */
  nudge: (dCol: number, dRow: number, repeat?: boolean) => void
  removeSelected: () => void
  clear: () => void

  /**
   * Where the wall has been. See `history.ts` — and note that nothing here
   * calls `record`: entries are pushed by watching `placements` change, so
   * an action added later cannot silently fall out of history.
   */
  history: History
  undo: () => void
  redo: () => void
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

/** A move of parts that are already on the wall. */
export interface MoveDrag {
  /**
   * Where on the wall plane the press landed. Every delta is measured from
   * here rather than from the part, so the part keeps its offset from the
   * pointer and a grab near a column line behaves like a grab in the middle
   * of one — see `slotDelta`.
   */
  readonly from: Point2
  /**
   * The wall as it stood at the press.
   *
   * Two jobs. It is what Escape puts back, and it is what the single history
   * entry is written against — the drag itself is silent, so without this
   * there would be no moment left to record by the time the pointer came up.
   */
  readonly origin: Placement[]
  /**
   * The part under the press.
   *
   * Kept because a release that never moved a slot turns out to have been a
   * click, and a click on a part that was already selected collapses the
   * selection onto it. That collapse cannot happen at `pointerdown` without
   * destroying the very selection the drag is about to carry.
   */
  readonly pressed: string
}

/**
 * Whether a pointer gesture has hold of the wall.
 *
 * One question with one answer. The camera stands down for it, the keyboard
 * hands over to it, and the pointer tracking runs off it — three call sites
 * that used to spell the condition out for themselves, which works until a
 * fourth gesture arrives and one of them is not updated. That failure is
 * silent and looks like a bug in something else: the camera swinging away
 * mid-drag, with nothing on screen to say why.
 */
export function handsOnWall(s: State): boolean {
  return (
    s.dragging !== null ||
    s.moving !== null ||
    s.marquee?.selecting === true ||
    s.section.dragging
  )
}

/**
 * Where a group of parts lands when its bottom-left corner is put on
 * `anchor`, pulled back onto the board if that would hang it off an edge.
 *
 * The correction is `clampGroupDelta` asked for a move of *zero*: the
 * allowed range for a group already hanging off the right edge is entirely
 * negative, so clamping zero into it returns exactly the shift needed to
 * bring the group back. One rule, used for nudging, for dropping an assembly,
 * and for pasting — which is the whole reason a clipping is stored as an
 * assembly and not as some format of its own.
 */
function landGroup(
  state: Pick<State, 'catalog' | 'board'>,
  parts: readonly AssemblyPart[],
  anchor: { col: number; row: number },
): PlacedRef[] {
  const landed = parts.map((p) => ({
    partId: p.partId,
    col: anchor.col + p.dCol,
    row: anchor.row + p.dRow,
    orientation: p.orientation,
  }))
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

function assemblyLanding(
  state: Pick<State, 'assemblies' | 'catalog' | 'board'>,
  assemblyId: string,
  anchor: { col: number; row: number },
): PlacedRef[] {
  const assembly = state.assemblies.find((a) => a.id === assemblyId)
  if (!assembly) return []
  return landGroup(state, assembly.parts, anchor)
}

/**
 * The wall-face rectangle each placement covers, for marquee hit-testing.
 *
 * A part the section has cut away entirely is left out. Sweeping a band over
 * a part you cannot see and selecting it is the same defect as clicking one —
 * worse, really, since nothing on screen says it happened.
 */
function footprints(state: Pick<State, 'placements' | 'catalog' | 'section'>) {
  const plane = state.section.on
    ? sectionPlane(state.section.axis, state.section.depth, state.section.flipped)
    : null
  const out: { id: string; rect: ReturnType<typeof footprintRect> }[] = []
  for (const placement of state.placements) {
    const part = partById(state.catalog, placement.partId)
    if (!part) continue
    const oriented = orientedFor(part, placement.orientation)
    const origin = placementOrigin(oriented.rule, part.h, placement)
    const { x, y, z } = oriented.sizeMm
    if (
      plane !== null &&
      hiddenBySection({ min: origin, max: { x: origin.x + x, y: origin.y + y, z: origin.z + z } }, plane)
    ) {
      continue
    }
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

/**
 * Whether a change to `placements` should be remembered.
 *
 * History is recorded by *watching* the store, not by asking each action to
 * remember to record — see the subscription at the foot of this file. That
 * inverts which way the mistake goes. Under the obvious design, an action
 * added later that forgot its `record()` call would fail silently: nothing
 * throws, nothing looks wrong, and the bug arrives months later as "sometimes
 * undo jumps too far back". Here recording is the default, and switching it
 * off is something you have to write on purpose.
 *
 * Exactly two things switch it off, and both say why at the call site.
 */
let recording = true

function withoutHistory(apply: () => void): void {
  recording = false
  try {
    apply()
  } finally {
    recording = true
  }
}

/** The wall as it stands, for the history stack to hold on to. */
function momentOf(state: State): Moment {
  return {
    widthIn: state.widthIn,
    heightIn: state.heightIn,
    colors: state.colors,
    placements: state.placements,
    selectedIds: state.selectedIds,
  }
}

export const useStore = create<State>((set, get) => ({
  board: createBoard(32, 32),
  widthIn: 32,
  heightIn: 32,
  sizeFromRestore: false,
  setWallSize: ({ widthIn, heightIn }) =>
    set({ widthIn, heightIn, board: createBoard(widthIn, heightIn), sizeFromRestore: false }),

  colors: DEFAULT_COLORS,
  setWallColor: (which, color) => set((s) => ({ colors: { ...s.colors, [which]: color } })),

  catalog: null,
  catalogError: null,
  setCatalog: (catalog) => set({ catalog, catalogError: null }),
  setCatalogError: (catalogError) => set({ catalogError }),

  placements: [],
  selectedIds: [],
  marquee: null,
  assemblies: [],
  dismissedIssues: [],
  history: EMPTY_HISTORY,
  clipping: null,
  pasteAnchor: null,

  // Opens on Y at 0: the plane of the board's front face, where the wall
  // side and the room part company.
  section: { on: false, axis: 'y', depth: DEFAULT_DEPTH_MM, flipped: false, dragging: false },
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
  moving: null,
  dragMoved: false,

  pressPart: (id, additive, point) => {
    const state = get()
    // A press that arrives with a catalog part already in hand belongs to
    // that drop, not to this part. The component drops its handler in that
    // case so the press falls through to the board; this is the belt to that
    // brace.
    if (state.dragging !== null) return

    if (additive) {
      // A band from here, and the toggle held back until `endMarquee` can
      // see whether one was actually swept. Before this, a modifier press on
      // a part could only ever toggle — box-selecting a crowded wall meant
      // finding bare board to start from.
      set({ marquee: { from: point, to: point, selecting: true, pressed: id } })
      return
    }

    // A part outside the selection becomes the selection, so a loose bracket
    // is one press away from moving. A part already inside it changes
    // nothing yet: collapsing here would empty the very selection this drag
    // exists to carry, and `endMove` can do the collapse later if the
    // pointer turns out never to have gone anywhere.
    set({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds : [id],
      moving: { from: point, origin: state.placements, pressed: id },
    })
  },

  updateMove: (point) => {
    const state = get()
    const { moving } = state
    if (moving === null) return

    const landed = movedBy(state, moving, slotDelta(moving.from, point))
    if (landed === state.placements) return
    // Every frame of the drag is silent. The one entry is written by
    // `endMove`, which is what lets Escape cost nothing.
    withoutHistory(() => set({ placements: landed }))
  },

  endMove: () => {
    const state = get()
    const { moving } = state
    if (moving === null) return
    const landed = state.placements

    // Never left the slot it started in, so that was a click — and a click
    // on a part takes the selection, which is the half of `select('replace')`
    // that had to wait for the release.
    if (landed === moving.origin) {
      set({ moving: null, selectedIds: [moving.pressed] })
      return
    }

    // Put the wall back, silently, and then set it down where the pointer
    // left it. That is what hands the subscription in `history.ts` the right
    // moment to keep: every frame until now was suppressed, so `previous`
    // would otherwise be the wall mid-drag and ⌘Z would step back to a
    // position the user never chose. Both writes land in one batch, so
    // nothing is drawn in between.
    withoutHistory(() => set({ placements: moving.origin, moving: null }))
    set({ placements: landed })
  },

  cancelMove: () => {
    const { moving } = get()
    if (moving === null) return
    withoutHistory(() => set({ placements: moving.origin, moving: null }))
  },

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

  paintSelection: (color) => {
    const { placements, selectedIds } = get()
    if (selectedIds.length === 0) return

    const chosen = new Set(selectedIds)
    let changed = false
    const next = placements.map((placement) => {
      if (!chosen.has(placement.id)) return placement
      if (placement.color === (color ?? undefined)) return placement
      changed = true
      if (color === null) {
        // Delete the key rather than set it to undefined. An unpainted part
        // is one with no color at all, all the way out to the document.
        const { color: _cleared, ...rest } = placement
        return rest
      }
      return { ...placement, color }
    })

    // Same guard `setOrientation` uses, and it is load-bearing rather than an
    // optimisation: leaving `placements` identical is what keeps a paint that
    // changed nothing off the undo stack.
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

  copySelection: () => {
    const { placements, selectedIds } = get()
    if (selectedIds.length === 0) return null

    // Wall order, not click order — the same reason an assembly is saved
    // sorted. A group copied left-to-right should come back that way.
    const chosen = new Set(selectedIds)
    const members = placements
      .filter((p) => chosen.has(p.id))
      .slice()
      .sort((a, b) => a.col - b.col || a.row - b.row)

    const text = encodeClipping(members)
    set({ clipping: text })
    return text
  },

  cutSelection: () => {
    const text = get().copySelection()
    if (text !== null) get().removeSelected()
    return text
  },

  pasteText: (text) => {
    const clipping = decodeClipping(text)
    if (clipping === null) return { ok: false }

    const state = get()
    const { catalog } = state

    // Unlike an import, which keeps parts it cannot draw so a round trip is
    // lossless, a paste drops them. A pasted unknown is inert: nothing renders
    // it, the marquee cannot catch it and it cannot be clicked, so it is
    // litter you can neither see nor remove.
    const known = catalog ? new Set(catalog.parts.map((p) => p.id)) : null
    const usable = known ? clipping.parts.filter((p) => known.has(p.partId)) : clipping.parts
    const skipped = clipping.parts.length - usable.length

    if (usable.length === 0) return { ok: true, count: 0, skipped }

    // Beside itself, not on top of itself: a bay copied to be repeated along
    // the wall should land flush to the right of the one it came from.
    const span = groupColumnSpan(
      usable.map((p) => ({
        col: p.dCol,
        row: p.dRow,
        spanCols: spanColsOf(catalog, p.partId, p.orientation),
      })),
    )
    const cascading = state.pasteAnchor?.key === text
    const from = cascading ? state.pasteAnchor! : clipping.origin
    const landed = landGroup(state, usable, { col: from.col + span, row: from.row })

    get().addPlacements(landed)
    set({
      // Where it *actually* landed, which is not where it was aimed if the
      // board edge pulled it back.
      pasteAnchor: {
        key: text,
        col: Math.min(...landed.map((p) => p.col)),
        row: Math.min(...landed.map((p) => p.row)),
      },
    })
    return { ok: true, count: landed.length, skipped }
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

  beginMarquee: (point, selecting) =>
    set({ marquee: { from: point, to: point, selecting, pressed: null } }),

  updateMarquee: (point) =>
    set((s) => (s.marquee ? { marquee: { ...s.marquee, to: point } } : {})),

  endMarquee: () => {
    const state = get()
    const marquee = state.marquee
    if (!marquee) return

    const rect = rectFromCorners(marquee.from, marquee.to)

    // Barely moved: that was a click, and what a click means depends on what
    // it landed on. On bare wall it clears. On a part held under a modifier
    // it is the toggle `pressPart` deferred — it had to wait here to find
    // out whether a sweep was coming after it.
    if (rectArea(rect) < MARQUEE_MIN_AREA_MM2) {
      if (marquee.pressed !== null) {
        set({
          marquee: null,
          selectedIds: applySelection(state.selectedIds, marquee.pressed, 'toggle'),
        })
        return
      }
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

  nudge: (dCol, dRow, repeat = false) => {
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
    const shifted = placements.map((p) =>
      moving.has(p.id) ? { ...p, col: p.col + move.dCol, row: p.row + move.dRow } : p,
    )
    // The OS repeating a held key is still the one gesture the user started.
    if (repeat) withoutHistory(() => set({ placements: shifted }))
    else set({ placements: shifted })
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
        // Spread rather than always writing the key, so an unpainted
        // placement stays unpainted in the document instead of being stamped
        // with `undefined` — which `JSON.stringify` drops anyway, but which
        // would make an unpainted part stop comparing equal to one built by
        // hand along the way.
        ...(p.color === undefined ? {} : { color: p.color }),
      })),
      assemblies,
      colors: get().colors,
    }
  },

  hydrate: (state, options) => {
    const next = {
      widthIn: state.widthIn,
      heightIn: state.heightIn,
      board: createBoard(state.widthIn, state.heightIn),
      // Taken wholesale, not merged. A document always carries all three —
      // one written before colors existed decodes to the defaults — so there
      // is no such thing as a wall that means "keep the panel you had". An
      // import is somebody else's wall arriving entire, and half their scheme
      // over half yours is a third thing neither of you chose.
      colors: state.colors,
      placements: state.placements.map((p) => ({ id: `p${nextId++}`, ...p })),
      // Ids from the document are positional; re-issue them from this
      // session's counter so a later save cannot collide with them.
      assemblies: state.assemblies.map((a) => ({ ...a, id: `a${nextAssemblyId++}` })),
      selectedIds: [],
      marquee: null,
      dragging: null,
      hoverSlot: null,
      moving: null,
      sizeFromRestore: options?.beginning === true,
    }
    if (options?.beginning) withoutHistory(() => set({ ...next, history: EMPTY_HISTORY }))
    else set(next)
  },

  clear: () => set({ placements: [], selectedIds: [], marquee: null, moving: null }),

  undo: () => {
    const state = get()
    const step = undoFrom(state.history, momentOf(state))
    if (step) restore(set, step.moment, step.history)
  },

  redo: () => {
    const state = get()
    const step = redoFrom(state.history, momentOf(state))
    if (step) restore(set, step.moment, step.history)
  },
}))

/**
 * Put a moment back on the wall.
 *
 * The board is rebuilt rather than stored, for the same reason `setWallSize`
 * rebuilds it: `widthIn`/`heightIn` are the truth and `board` is derived, and
 * two copies of a fact eventually disagree.
 *
 * Copying the arrays keeps the moment's own frozen — a moment that shared a
 * mutable array with the live store would quietly change under the stack.
 */
function restore(
  set: (partial: Partial<State>) => void,
  moment: Moment,
  history: History,
): void {
  withoutHistory(() =>
    set({
      widthIn: moment.widthIn,
      heightIn: moment.heightIn,
      board: createBoard(moment.widthIn, moment.heightIn),
      // Not copied, unlike the arrays below: `WallColors` is three strings
      // and nothing in the store ever mutates one in place.
      colors: moment.colors,
      placements: [...moment.placements],
      selectedIds: [...moment.selectedIds],
      sizeFromRestore: false,
      history,
    }),
  )
}

/**
 * The only thing that writes history.
 *
 * `placements` alone is the trigger. Neither a resize nor a change of wall
 * color makes an entry — you do not undo your way out of typing a wall size,
 * or out of choosing a panel finish — but the moment carries both, so undo
 * never leaves you at an instant with the wrong board or the wrong scheme
 * under it.
 *
 * Writing to the store from inside its own subscriber re-enters here once
 * more; the identity check turns that second pass straight back around.
 */
useStore.subscribe((state, previous) => {
  if (!recording || state.placements === previous.placements) return
  useStore.setState({ history: record(previous.history, momentOf(previous)) })
})

/**
 * The wall with the selection carried `wanted` slots from where it started,
 * or `origin` itself when the clamped move comes to nothing.
 *
 * Returning the original array by identity is the signal the whole gesture
 * runs on: `updateMove` skips a write, and `endMove` reads it as "the pointer
 * never took this anywhere", which is how a drag that wanders out and back
 * costs no history entry and how a press that only wobbled is still a click.
 *
 * Measured from `origin` every time rather than from wherever the last frame
 * left things, so the arithmetic cannot accumulate: drag a group into the
 * edge, hold it there while `clampGroupDelta` refuses to move it further,
 * then come back, and it returns to exactly the slots it left.
 */
function movedBy(
  state: State,
  moving: MoveDrag,
  wanted: { dCol: number; dRow: number },
): Placement[] {
  const carried = new Set(state.selectedIds)
  const items = moving.origin
    .filter((p) => carried.has(p.id))
    .map((p) => ({
      col: p.col,
      row: p.row,
      spanCols: spanColsOf(state.catalog, p.partId, p.orientation),
    }))
  if (items.length === 0) return moving.origin

  // The same clamp the arrow keys use: the group travels as one body or not
  // at all, so dragging into an edge slides it along rather than folding it
  // up against the boundary.
  const move = clampGroupDelta(items, wanted, {
    cols: slotColumnCount(state.board),
    rows: slotRowCount(state.board),
  })
  if (move.dCol === 0 && move.dRow === 0) return moving.origin

  return moving.origin.map((p) =>
    carried.has(p.id) ? { ...p, col: p.col + move.dCol, row: p.row + move.dRow } : p,
  )
}

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
