/**
 * The Wall Control slot grid.
 *
 * Board axes match the panel: X = width (right), Y = depth out of the wall,
 * Z = height (up). The origin is the bottom-left front corner of the board.
 *
 * Two interleaved patterns, both on a 1" horizontal pitch:
 *
 *   slot columns  x = 25.4 + 25.4c    slot rows  z = 25.4 + 50.8r  (centre)
 *   hole columns  x = 38.1 + 25.4c    hole rows  z = 25.4 + 25.4r
 *
 * Slots repeat every 2" vertically, holes every 1". A slot is 2.2 mm wide and
 * 25.4 mm tall, so slot bands and gap bands alternate on a 1" pitch.
 *
 * This module is the only place those numbers live.
 */

import type { Point2 } from './selection'

/** Millimetres per inch. The Wall Control grid is an imperial pattern. */
export const MM_PER_INCH = 25.4

/** Horizontal pitch shared by slot columns and hole columns. */
export const COLUMN_PITCH_MM = 25.4

/** X of the first slot column: one inch in from the board's left edge. */
export const SLOT_COLUMN_ORIGIN_MM = 25.4

/** X of the first hole column, offset half an inch from the slot columns. */
export const HOLE_COLUMN_ORIGIN_MM = 38.1

/** Z centre of the lowest slot. */
export const SLOT_ROW_ORIGIN_MM = 25.4

/** Vertical distance between slot centres — two inches. */
export const SLOT_ROW_PITCH_MM = 50.8

/** Z of the lowest hole. */
export const HOLE_ROW_ORIGIN_MM = 25.4

/** Vertical distance between holes — one inch. */
export const HOLE_ROW_PITCH_MM = 25.4

export const SLOT_WIDTH_MM = 2.2
export const SLOT_HEIGHT_MM = 25.4
export const HOLE_DIAMETER_MM = 6.35

/** Thickness of a real Wall Control panel, measured from the reference STL. */
export const PANEL_THICKNESS_MM = 1.587

/**
 * Slack for float comparisons. Positions are built by multiplication rather
 * than accumulation, so the error we tolerate is representation-sized only.
 */
const EPSILON_MM = 1e-6

/** A free-size virtual pegboard. Not tiled: no panel seams are modelled. */
export interface Board {
  readonly widthMm: number
  readonly heightMm: number
}

/** A slot, addressed by its zero-based column and row. */
export interface Slot {
  readonly col: number
  readonly row: number
  /** Centre of the slot. */
  readonly x: number
  readonly z: number
}

/** A 1/4" mounting hole, addressed by its zero-based column and row. */
export interface Hole {
  readonly col: number
  readonly row: number
  readonly x: number
  readonly z: number
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH
}

/** Build a board from the width × height in inches the user typed. */
export function createBoard(widthInches: number, heightInches: number): Board {
  return { widthMm: inchesToMm(widthInches), heightMm: inchesToMm(heightInches) }
}

export function slotColumnX(col: number): number {
  return SLOT_COLUMN_ORIGIN_MM + COLUMN_PITCH_MM * col
}

/** Z of the centre of a slot row. */
export function slotRowCenterZ(row: number): number {
  return SLOT_ROW_ORIGIN_MM + SLOT_ROW_PITCH_MM * row
}

/** Vertical extent of a slot row, i.e. the band a hook tab can enter. */
export function slotRowExtentZ(row: number): { minZ: number; maxZ: number } {
  const centre = slotRowCenterZ(row)
  return { minZ: centre - SLOT_HEIGHT_MM / 2, maxZ: centre + SLOT_HEIGHT_MM / 2 }
}

export function holeColumnX(col: number): number {
  return HOLE_COLUMN_ORIGIN_MM + COLUMN_PITCH_MM * col
}

export function holeRowZ(row: number): number {
  return HOLE_ROW_ORIGIN_MM + HOLE_ROW_PITCH_MM * row
}

/**
 * How many indices of `origin + pitch * i` keep a feature of `size` fully
 * inside `[0, limit]`. Features that overhang the edge are not counted — a
 * half-slot at the border is not a slot you can hang anything from.
 */
function fittingCount(origin: number, pitch: number, size: number, limit: number): number {
  const last = Math.floor((limit - origin - size / 2 + EPSILON_MM) / pitch)
  const firstFits = origin - size / 2 >= -EPSILON_MM
  if (!firstFits) return 0
  return Math.max(0, last + 1)
}

export function slotColumnCount(board: Board): number {
  return fittingCount(SLOT_COLUMN_ORIGIN_MM, COLUMN_PITCH_MM, SLOT_WIDTH_MM, board.widthMm)
}

export function slotRowCount(board: Board): number {
  return fittingCount(SLOT_ROW_ORIGIN_MM, SLOT_ROW_PITCH_MM, SLOT_HEIGHT_MM, board.heightMm)
}

export function holeColumnCount(board: Board): number {
  return fittingCount(HOLE_COLUMN_ORIGIN_MM, COLUMN_PITCH_MM, HOLE_DIAMETER_MM, board.widthMm)
}

export function holeRowCount(board: Board): number {
  return fittingCount(HOLE_ROW_ORIGIN_MM, HOLE_ROW_PITCH_MM, HOLE_DIAMETER_MM, board.heightMm)
}

export function slotAt(col: number, row: number): Slot {
  return { col, row, x: slotColumnX(col), z: slotRowCenterZ(row) }
}

export function holeAt(col: number, row: number): Hole {
  return { col, row, x: holeColumnX(col), z: holeRowZ(row) }
}

/** Every slot the board actually has, in column-major order. */
export function slots(board: Board): Slot[] {
  const cols = slotColumnCount(board)
  const rows = slotRowCount(board)
  const out: Slot[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) out.push(slotAt(col, row))
  }
  return out
}

/** Every mounting hole the board actually has, in column-major order. */
export function holes(board: Board): Hole[] {
  const cols = holeColumnCount(board)
  const rows = holeRowCount(board)
  const out: Hole[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) out.push(holeAt(col, row))
  }
  return out
}

/**
 * A rectangle of solid panel, given by its centre and its size — the same
 * way a slot is given by its centre.
 */
export interface PanelSolid {
  readonly x: number
  readonly z: number
  readonly widthMm: number
  readonly heightMm: number
}

/**
 * The panel itself: everything that is *not* a slot.
 *
 * A slot is an absence, and the material left around the absences is exactly
 * a set of rectangles, because the slots sit on a lattice. Bands of slots
 * (one slot tall) alternate with unbroken bands of material; inside a slot
 * band the material is the width of the board with the slot columns taken
 * out of it, which is one piece before the first column, one between each
 * pair, and one after the last.
 *
 * That is what lets the board be drawn with real holes in it rather than
 * with dark objects standing in for them. Nothing here is about rendering:
 * the rectangles are a fact about the grid, and the tests state them as one
 * — the pieces are disjoint, none of them overlaps a slot, and their area is
 * the board's area less every slot's.
 *
 * Bottom-up, and never empty: a board too small to hold a single slot is one
 * unbroken rectangle.
 */
export function panelSolids(board: Board): PanelSolid[] {
  const cols = slotColumnCount(board)
  const rows = slotRowCount(board)

  // The x ranges of material inside a slot band. Shared by every band,
  // because every slot band has the same columns punched out of it.
  const spansX: [number, number][] = []
  let x = 0
  for (let col = 0; col < cols; col++) {
    const centre = slotColumnX(col)
    spansX.push([x, centre - SLOT_WIDTH_MM / 2])
    x = centre + SLOT_WIDTH_MM / 2
  }
  spansX.push([x, board.widthMm])

  const out: PanelSolid[] = []
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    // A board whose edge lands exactly on a slot edge leaves a piece of no
    // width. It is not material; it is the absence of a margin.
    if (x1 - x0 <= EPSILON_MM || z1 - z0 <= EPSILON_MM) return
    out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, widthMm: x1 - x0, heightMm: z1 - z0 })
  }

  let z = 0
  for (let row = 0; row < rows; row++) {
    const { minZ, maxZ } = slotRowExtentZ(row)
    add(0, board.widthMm, z, minZ)
    for (const [x0, x1] of spansX) add(x0, x1, minZ, maxZ)
    z = maxZ
  }
  add(0, board.widthMm, z, board.heightMm)

  return out
}

export function isSlotOnBoard(board: Board, col: number, row: number): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    row >= 0 &&
    col < slotColumnCount(board) &&
    row < slotRowCount(board)
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Quantise an arbitrary point on the wall plane to the slot it belongs to.
 * This is what a drag raycast hit gets fed through. Points beyond the edge
 * clamp inward rather than failing, so a drag that overshoots still places.
 *
 * Returns null only when the board is too small to hold a single slot.
 */
export function nearestSlot(board: Board, x: number, z: number): Slot | null {
  const cols = slotColumnCount(board)
  const rows = slotRowCount(board)
  if (cols === 0 || rows === 0) return null

  const col = clamp(Math.round((x - SLOT_COLUMN_ORIGIN_MM) / COLUMN_PITCH_MM), 0, cols - 1)
  const row = clamp(Math.round((z - SLOT_ROW_ORIGIN_MM) / SLOT_ROW_PITCH_MM), 0, rows - 1)
  return slotAt(col, row)
}

/**
 * Height spanned by `slotCount` consecutive slot rows, measured from the
 * bottom of the lowest to the top of the highest.
 *
 * This is the backbone of every sidepiece height: a part engaging k slots is
 * this tall plus whatever lip its family adds. See the Flats cross-check in
 * the tests.
 */
export function slotSpanHeightMm(slotCount: number): number {
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new RangeError(`slotCount must be a positive integer, got ${slotCount}`)
  }
  return (slotCount - 1) * SLOT_ROW_PITCH_MM + SLOT_HEIGHT_MM
}

/**
 * How many slots a pointer has carried something, from where it went down to
 * where it is now.
 *
 * Quantising the *difference*, rather than differencing two quantisations.
 * That is what keeps a drag honest wherever inside a slot it began: grab a
 * part a millimetre from a column line, and taking `nearestSlot` at both ends
 * would let a two-millimetre twitch carry it a whole column. Measured from
 * the grab point, half a pitch of travel is what moves a slot, and the part
 * keeps its offset from the pointer for free — a three-column plate grabbed
 * at its right end stays grabbed there.
 *
 * The row pitch is twice the column pitch, so each axis carries its own
 * divisor rather than sharing one.
 */
export function slotDelta(from: Point2, to: Point2): { dCol: number; dRow: number } {
  return {
    dCol: pitches(to.x - from.x, COLUMN_PITCH_MM),
    dRow: pitches(to.z - from.z, SLOT_ROW_PITCH_MM),
  }
}

/**
 * Travel in whole pitches, with the sign taken off zero.
 *
 * `Math.round` gives `-0` for anything in the last half-pitch below zero.
 * It adds and compares as zero, so nothing downstream would notice — but it
 * is a different value under `Object.is`, which is what `toEqual` and every
 * memo comparison use, so a zero delta would fail to match a zero delta.
 */
function pitches(distanceMm: number, pitchMm: number): number {
  const n = Math.round(distanceMm / pitchMm)
  return n === 0 ? 0 : n
}
