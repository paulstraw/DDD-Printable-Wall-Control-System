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
 */

/** Density of PLA. The library is printed in whatever you like, but this is the common case. */
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

/** What the BOM needs to know about a catalog part. */
export interface BomPart {
  readonly id: string
  readonly name: string
  readonly file: string
  readonly volumeMm3: number
  readonly fasteners: readonly { readonly id: string; readonly quantity: number }[]
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
  readonly quantity: number
  readonly unitGrams: number
  readonly totalGrams: number
}

export interface Bom {
  readonly parts: readonly BomLine[]
  readonly fasteners: readonly BomLine[]
  readonly totalGrams: number
  readonly totalPieces: number
  /** Distinct source STLs — what a download actually has to fetch. */
  readonly files: readonly string[]
}

export interface BuildBomInput {
  readonly placements: readonly { readonly partId: string }[]
  readonly parts: readonly BomPart[]
  readonly fasteners: Readonly<Record<string, BomFastener>>
}

function toLine(
  kind: 'part' | 'fastener',
  id: string,
  name: string,
  file: string,
  quantity: number,
  volumeMm3: number,
  options: FilamentOptions,
): BomLine {
  const unitGrams = filamentGrams(volumeMm3, options)
  return { id, name, file, kind, quantity, unitGrams, totalGrams: unitGrams * quantity }
}

export function buildBom(input: BuildBomInput, options: FilamentOptions = {}): Bom {
  const byId = new Map(input.parts.map((p) => [p.id, p]))

  const partCounts = new Map<string, number>()
  const fastenerCounts = new Map<string, number>()

  for (const placement of input.placements) {
    const part = byId.get(placement.partId)
    // A placement whose part is gone from the catalog is not worth crashing
    // over; it simply contributes nothing to the print list.
    if (!part) continue

    partCounts.set(part.id, (partCounts.get(part.id) ?? 0) + 1)
    for (const need of part.fasteners) {
      fastenerCounts.set(need.id, (fastenerCounts.get(need.id) ?? 0) + need.quantity)
    }
  }

  const parts: BomLine[] = []
  for (const [id, quantity] of partCounts) {
    const part = byId.get(id)
    if (!part) continue
    parts.push(toLine('part', id, part.name, part.file, quantity, part.volumeMm3, options))
  }
  parts.sort((a, b) => a.name.localeCompare(b.name))

  const fasteners: BomLine[] = []
  for (const [id, quantity] of fastenerCounts) {
    const spec = input.fasteners[id]
    fasteners.push(
      toLine('fastener', id, id, spec?.file ?? '', quantity, spec?.volumeMm3 ?? 0, options),
    )
  }
  fasteners.sort((a, b) => a.name.localeCompare(b.name))

  const all = [...parts, ...fasteners]
  return {
    parts,
    fasteners,
    totalGrams: all.reduce((sum, line) => sum + line.totalGrams, 0),
    totalPieces: all.reduce((sum, line) => sum + line.quantity, 0),
    // Unique, because a download fetches each STL once however many you print.
    files: [...new Set(all.map((line) => line.file).filter(Boolean))].sort(),
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function bomToMarkdown(bom: Bom): string {
  if (bom.totalPieces === 0) return '_Nothing placed yet._\n'

  const rows = [...bom.parts, ...bom.fasteners].map(
    (line) =>
      `| ${line.quantity} × | ${line.name} | ${line.kind} | ${round1(line.totalGrams)} g |`,
  )

  return [
    '| Qty | Part | Kind | Filament |',
    '| ---: | --- | --- | ---: |',
    ...rows,
    `| **${bom.totalPieces}** | **total** |  | **${round1(bom.totalGrams)} g** |`,
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
  const header = ['quantity', 'name', 'kind', 'file', 'unit_grams', 'total_grams']
  const rows = [...bom.parts, ...bom.fasteners].map((line) => [
    line.quantity,
    line.name,
    line.kind,
    line.file,
    round1(line.unitGrams),
    round1(line.totalGrams),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}
