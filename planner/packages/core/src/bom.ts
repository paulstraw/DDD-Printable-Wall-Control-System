/**
 * Bill of materials.
 *
 * Turns a wall full of placements into a print list: what to print, how many,
 * which fasteners the families involved require, and roughly how much filament
 * it will take.
 *
 * Fasteners are derived, never placed. A clip-on spacer needs four pins
 * because its family says so, and the count follows the number of clip-ons on
 * the wall — there is nothing for the user to remember.
 *
 * Which fasteners a part needs can depend on how it is mounted. A locking
 * spacer's 8 mm pin passes through the plate and into a hole in the panel;
 * lay the same plate flat as a shelf and the pin points at the ceiling and
 * reaches nothing. Billing for it anyway would put a part in the print list
 * that cannot do its job.
 */

/** Density of PLA. The library is printed in whatever you like, but this is the common case. */
import { resolveColor } from './colors'
import { labelForColor } from './palettes'
import type { Orientation } from './placement'

export const PLA_DENSITY_G_PER_CM3 = 1.24

const MM3_PER_CM3 = 1000

export interface FilamentOptions {
  readonly densityGPerCm3?: number
  /**
   * Fraction of the enclosed volume that ends up as plastic. Defaults to 1,
   * a solid part, which makes the estimate an upper bound rather than a guess
   * at someone's slicer settings.
   */
  readonly solidity?: number
}

export function filamentGrams(volumeMm3: number, options: FilamentOptions = {}): number {
  const density = options.densityGPerCm3 ?? PLA_DENSITY_G_PER_CM3
  const solidity = options.solidity ?? 1
  if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) return 0
  return (volumeMm3 / MM3_PER_CM3) * density * solidity
}

export interface FastenerNeed {
  readonly id: string
  readonly quantity: number
}

/** What the BOM needs to know about a catalog part. */
export interface BomPart {
  readonly id: string
  readonly name: string
  readonly file: string
  readonly volumeMm3: number
  /** What it needs mounted the usual way. */
  readonly fasteners: readonly FastenerNeed[]
  /**
   * Overrides for orientations the default does not describe. Absent for
   * almost every part, because almost every fastener does the same job
   * whichever way round the part goes.
   */
  readonly fastenersByOrientation?: Readonly<
    Partial<Record<Orientation, readonly FastenerNeed[]>>
  >
}

/** What a part needs, mounted this way. */
export function fastenersFor(part: BomPart, orientation: Orientation): readonly FastenerNeed[] {
  return part.fastenersByOrientation?.[orientation] ?? part.fasteners
}

/** What it needs to know about a fastener the families call for. */
export interface BomFastener {
  readonly id: string
  readonly file: string
  readonly volumeMm3?: number
}

export interface BomLine {
  readonly id: string
  readonly name: string
  readonly file: string
  readonly kind: 'part' | 'fastener'
  /**
   * What this line is printed in, already resolved against the wall's
   * default — so it is always a real color and never "whatever".
   */
  readonly color: string
  readonly quantity: number
  readonly unitGrams: number
  readonly totalGrams: number
}

/** How much filament one color accounts for, across parts and fasteners alike. */
export interface ColorTotal {
  readonly color: string
  readonly grams: number
  readonly pieces: number
}

export interface Bom {
  readonly parts: readonly BomLine[]
  readonly fasteners: readonly BomLine[]
  /**
   * Filament per color, heaviest first — what you actually have to have on
   * hand. Ordered by weight rather than by name because the question it
   * answers is "have I got enough of the main one".
   */
  readonly colorTotals: readonly ColorTotal[]
  readonly totalGrams: number
  readonly totalPieces: number
  /** Distinct source STLs — what a download actually has to fetch. */
  readonly files: readonly string[]
}

export interface BuildBomInput {
  readonly placements: readonly {
    readonly partId: string
    readonly orientation: Orientation
    /** Absent means it follows `defaultPartColor`. */
    readonly color?: string
  }[]
  readonly parts: readonly BomPart[]
  readonly fasteners: Readonly<Record<string, BomFastener>>
  /**
   * The wall's default part color, which every unpainted placement inherits.
   *
   * Required rather than defaulted, so a caller cannot quietly bill a wall
   * against a grey nobody chose.
   */
  readonly defaultPartColor: string
}

function toLine(
  kind: 'part' | 'fastener',
  id: string,
  name: string,
  file: string,
  color: string,
  quantity: number,
  volumeMm3: number,
  options: FilamentOptions,
): BomLine {
  const unitGrams = filamentGrams(volumeMm3, options)
  return { id, name, file, kind, color, quantity, unitGrams, totalGrams: unitGrams * quantity }
}

/**
 * A line is one print job, so it is keyed by the thing being printed *and*
 * what it is printed in. A NUL separator because no id or hex contains one,
 * and a naive `id + color` would let two different pairs collide.
 */
function lineKey(id: string, color: string): string {
  return `${id}\u0000${color}`
}

export function buildBom(input: BuildBomInput, options: FilamentOptions = {}): Bom {
  const byId = new Map(input.parts.map((p) => [p.id, p]))

  const partCounts = new Map<string, { id: string; color: string; quantity: number }>()
  const fastenerCounts = new Map<string, { id: string; color: string; quantity: number }>()

  const bump = (
    counts: Map<string, { id: string; color: string; quantity: number }>,
    id: string,
    color: string,
    by: number,
  ) => {
    const key = lineKey(id, color)
    const seen = counts.get(key)
    if (seen) counts.set(key, { ...seen, quantity: seen.quantity + by })
    else counts.set(key, { id, color, quantity: by })
  }

  for (const placement of input.placements) {
    const part = byId.get(placement.partId)
    // A placement whose part is gone from the catalog is not worth crashing
    // over; it simply contributes nothing to the print list.
    if (!part) continue

    const color = resolveColor(placement, input.defaultPartColor)
    bump(partCounts, part.id, color, 1)

    // Fasteners take the color of the part that called for them. A pin billed
    // by a red spacer bills as red, which is how you would actually print it:
    // the spacer and its pins come off the bed in one filament. They stay
    // derived and never placed, so there is still nothing to remember.
    for (const need of fastenersFor(part, placement.orientation)) {
      bump(fastenerCounts, need.id, color, need.quantity)
    }
  }

  const parts: BomLine[] = []
  for (const { id, color, quantity } of partCounts.values()) {
    const part = byId.get(id)
    if (!part) continue
    parts.push(toLine('part', id, part.name, part.file, color, quantity, part.volumeMm3, options))
  }

  const fasteners: BomLine[] = []
  for (const { id, color, quantity } of fastenerCounts.values()) {
    const spec = input.fasteners[id]
    fasteners.push(
      toLine('fastener', id, id, spec?.file ?? '', color, quantity, spec?.volumeMm3 ?? 0, options),
    )
  }

  // Name first, then color, so the two lines for one part printed twice sit
  // together rather than being separated by everything else alphabetically
  // between them.
  const byNameThenColor = (a: BomLine, b: BomLine) =>
    a.name.localeCompare(b.name) || a.color.localeCompare(b.color)
  parts.sort(byNameThenColor)
  fasteners.sort(byNameThenColor)

  const all = [...parts, ...fasteners]

  const totals = new Map<string, { grams: number; pieces: number }>()
  for (const line of all) {
    const seen = totals.get(line.color) ?? { grams: 0, pieces: 0 }
    totals.set(line.color, {
      grams: seen.grams + line.totalGrams,
      pieces: seen.pieces + line.quantity,
    })
  }

  return {
    parts,
    fasteners,
    colorTotals: [...totals.entries()]
      .map(([color, t]) => ({ color, grams: t.grams, pieces: t.pieces }))
      .sort((a, b) => b.grams - a.grams || a.color.localeCompare(b.color)),
    totalGrams: all.reduce((sum, line) => sum + line.totalGrams, 0),
    totalPieces: all.reduce((sum, line) => sum + line.quantity, 0),
    // Unique, because a download fetches each STL once however many you print
    // and whatever you print it in. Color splits a print *job*, not a file.
    files: [...new Set(all.map((line) => line.file).filter(Boolean))].sort(),
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function bomToMarkdown(bom: Bom): string {
  if (bom.totalPieces === 0) return '_Nothing placed yet._\n'

  const rows = [...bom.parts, ...bom.fasteners].map(
    (line) =>
      `| ${line.quantity} × | ${line.name} | ${line.kind} | ${labelForColor(line.color)} | ${round1(line.totalGrams)} g |`,
  )

  // Where the preset names earn their keep. A pasted list has no swatches
  // beside it, so the words are the only thing that survives the paste — and
  // "Red" is a shopping list where "#c0392b" is a puzzle.
  const perColor = bom.colorTotals
    .map((t) => `${labelForColor(t.color)} ${round1(t.grams)} g`)
    .join(' · ')

  return [
    '| Qty | Part | Kind | Color | Filament |',
    '| ---: | --- | --- | --- | ---: |',
    ...rows,
    `| **${bom.totalPieces}** | **total** |  |  | **${round1(bom.totalGrams)} g** |`,
    '',
    `_${perColor}_`,
    '',
    `_${bom.files.length} distinct STL${bom.files.length === 1 ? '' : 's'}. Filament assumes solid parts, so treat it as an upper bound._`,
    '',
  ].join('\n')
}

/** RFC 4180 quoting: doubled quotes, and quote anything with a separator in it. */
function csvCell(value: string | number): string {
  const text = String(value)
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function bomToCsv(bom: Bom): string {
  // Both the name and the hex, unlike the Markdown. A spreadsheet is
  // something you sort and filter, and a column that is sometimes a word and
  // sometimes a hex code sorts into nonsense.
  const header = [
    'quantity',
    'name',
    'kind',
    'color',
    'color_hex',
    'file',
    'unit_grams',
    'total_grams',
  ]
  const rows = [...bom.parts, ...bom.fasteners].map((line) => [
    line.quantity,
    line.name,
    line.kind,
    labelForColor(line.color),
    line.color,
    line.file,
    round1(line.unitGrams),
    round1(line.totalGrams),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}
