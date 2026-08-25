import { describe, expect, it } from 'vitest'
import type { Orientation } from '../src/placement'
import {
  type BomFastener,
  type BomPart,
  PLA_DENSITY_G_PER_CM3,
  bomToCsv,
  bomToMarkdown,
  buildBom,
  filamentGrams,
} from '../src/bom'

const FLAT_LEFT: BomPart = {
  id: 'flat-left',
  name: '3x0 Flat Left',
  file: 'Sidepieces/Flats/3x0 Flat Left.stl',
  volumeMm3: 12_000,
  fasteners: [],
}

const CLIP_ON: BomPart = {
  id: 'clip-on',
  name: '3x3 Spacer clip-on',
  file: 'Centerpieces/Spacer_clip-on/3x3 Spacer clip-on.stl',
  volumeMm3: 30_000,
  fasteners: [{ id: '4x10x8mm Pin', quantity: 4 }],
}

const FASTENERS: Record<string, BomFastener> = {
  '4x10x8mm Pin': { id: '4x10x8mm Pin', file: 'Accessories/4x10x8mm Pin.stl', volumeMm3: 240 },
}

const place = (partId: string, times: number, orientation: Orientation = 'flat') =>
  Array.from({ length: times }, () => ({ partId, orientation }))

describe('filamentGrams', () => {
  it('converts a cubic centimetre at the density of PLA', () => {
    expect(filamentGrams(1000)).toBeCloseTo(PLA_DENSITY_G_PER_CM3, 6)
  })

  it('scales linearly with volume', () => {
    expect(filamentGrams(2000)).toBeCloseTo(filamentGrams(1000) * 2, 6)
  })

  it('takes another material when told', () => {
    // PETG is a little denser.
    expect(filamentGrams(1000, { densityGPerCm3: 1.27 })).toBeCloseTo(1.27, 6)
  })

  it('assumes a solid part unless told otherwise', () => {
    expect(filamentGrams(1000, { solidity: 0.4 })).toBeCloseTo(PLA_DENSITY_G_PER_CM3 * 0.4, 6)
  })

  it('returns zero rather than NaN for a missing or absurd volume', () => {
    expect(filamentGrams(0)).toBe(0)
    expect(filamentGrams(-5)).toBe(0)
    expect(filamentGrams(Number.NaN)).toBe(0)
  })
})

const LOCKING: BomPart = {
  id: 'locking',
  name: '3x3 Locking Spacer',
  file: 'Centerpieces/Locking_spacer/3x3 Locking Spacer.stl',
  volumeMm3: 20_000,
  fasteners: [{ id: '8mm Lock Pin', quantity: 1 }],
  // Rotated to a shelf the pin no longer reaches the panel, so it is not
  // something to print.
  fastenersByOrientation: { shelf: [] },
}

describe('buildBom', () => {
  it('drops a fastener that the orientation makes useless', () => {
    const flat = buildBom({
      placements: place('locking', 2),
      parts: [LOCKING],
      fasteners: FASTENERS,
    })
    expect(flat.fasteners.find((f) => f.id === '8mm Lock Pin')?.quantity).toBe(2)

    const shelf = buildBom({
      placements: place('locking', 2, 'shelf'),
      parts: [LOCKING],
      fasteners: FASTENERS,
    })
    expect(shelf.fasteners).toEqual([])
    // The part itself is still printed, and still twice.
    expect(shelf.parts[0]?.quantity).toBe(2)
  })

  it('counts each orientation on its own terms when both are on the wall', () => {
    const bom = buildBom({
      placements: [...place('locking', 3), ...place('locking', 2, 'shelf')],
      parts: [LOCKING],
      fasteners: FASTENERS,
    })
    expect(bom.parts[0]?.quantity).toBe(5)
    expect(bom.fasteners.find((f) => f.id === '8mm Lock Pin')?.quantity).toBe(3)
  })

  it('aggregates repeats into one line with a quantity', () => {
    const bom = buildBom({
      placements: place('flat-left', 3),
      parts: [FLAT_LEFT],
      fasteners: FASTENERS,
    })
    expect(bom.parts).toHaveLength(1)
    expect(bom.parts[0]?.quantity).toBe(3)
    expect(bom.parts[0]?.totalGrams).toBeCloseTo(filamentGrams(12_000) * 3, 6)
  })

  it('adds the fasteners a family requires, scaled by how many are placed', () => {
    const bom = buildBom({
      placements: place('clip-on', 5),
      parts: [CLIP_ON],
      fasteners: FASTENERS,
    })
    // Four pins each, five spacers.
    expect(bom.fasteners).toHaveLength(1)
    expect(bom.fasteners[0]?.quantity).toBe(20)
    expect(bom.fasteners[0]?.name).toBe('4x10x8mm Pin')
  })

  it('adds no fasteners for a family that needs none', () => {
    const bom = buildBom({
      placements: place('flat-left', 2),
      parts: [FLAT_LEFT],
      fasteners: FASTENERS,
    })
    expect(bom.fasteners).toEqual([])
  })

  it('totals filament across parts and fasteners together', () => {
    const bom = buildBom({
      placements: [...place('flat-left', 2), ...place('clip-on', 1)],
      parts: [FLAT_LEFT, CLIP_ON],
      fasteners: FASTENERS,
    })
    const expected =
      filamentGrams(12_000) * 2 + filamentGrams(30_000) * 1 + filamentGrams(240) * 4
    expect(bom.totalGrams).toBeCloseTo(expected, 6)
    expect(bom.totalPieces).toBe(2 + 1 + 4)
  })

  it('lists each distinct STL once, however many are printed', () => {
    // What a download actually has to fetch — the doc's 8-12 files for a
    // 50-hanger wall.
    const bom = buildBom({
      placements: [...place('flat-left', 20), ...place('clip-on', 20)],
      parts: [FLAT_LEFT, CLIP_ON],
      fasteners: FASTENERS,
    })
    expect(bom.files).toHaveLength(3)
    expect(bom.totalPieces).toBe(120)
  })

  it('sorts by name so the list is stable between runs', () => {
    const bom = buildBom({
      placements: [...place('clip-on', 1), ...place('flat-left', 1)],
      parts: [CLIP_ON, FLAT_LEFT],
      fasteners: FASTENERS,
    })
    expect(bom.parts.map((p) => p.name)).toEqual(['3x0 Flat Left', '3x3 Spacer clip-on'])
  })

  it('is empty for an empty wall', () => {
    const bom = buildBom({ placements: [], parts: [FLAT_LEFT], fasteners: FASTENERS })
    expect(bom.totalPieces).toBe(0)
    expect(bom.totalGrams).toBe(0)
    expect(bom.files).toEqual([])
  })

  it('ignores a placement whose part has left the catalog', () => {
    const bom = buildBom({
      placements: [{ partId: 'gone', orientation: 'flat' as const }, ...place('flat-left', 1)],
      parts: [FLAT_LEFT],
      fasteners: FASTENERS,
    })
    expect(bom.parts).toHaveLength(1)
    expect(bom.totalPieces).toBe(1)
  })

  it('still counts a fastener the catalog has no entry for', () => {
    // Better to tell someone they need a pin with no weight estimate than to
    // leave it off the list entirely.
    const bom = buildBom({ placements: place('clip-on', 1), parts: [CLIP_ON], fasteners: {} })
    expect(bom.fasteners[0]?.quantity).toBe(4)
    expect(bom.fasteners[0]?.totalGrams).toBe(0)
  })
})

describe('serialisation', () => {
  const bom = buildBom({
    placements: [...place('flat-left', 2), ...place('clip-on', 1)],
    parts: [FLAT_LEFT, CLIP_ON],
    fasteners: FASTENERS,
  })

  it('writes a Markdown table with a total row', () => {
    const md = bomToMarkdown(bom)
    expect(md).toContain('| Qty | Part | Kind | Filament |')
    expect(md).toContain('3x0 Flat Left')
    expect(md).toContain('4x10x8mm Pin')
    expect(md).toContain('**total**')
    expect(md).toContain('3 distinct STLs')
  })

  it('says so plainly when nothing is placed', () => {
    const empty = buildBom({ placements: [], parts: [], fasteners: {} })
    expect(bomToMarkdown(empty)).toContain('Nothing placed yet')
  })

  it('writes CSV with a header and one row per line', () => {
    const csv = bomToCsv(bom).trim().split('\n')
    expect(csv[0]).toBe('quantity,name,kind,file,unit_grams,total_grams')
    expect(csv).toHaveLength(1 + bom.parts.length + bom.fasteners.length)
  })

  it('quotes a field containing a comma or a quote', () => {
    const awkward: BomPart = {
      id: 'odd',
      name: 'Wrench 86-05-[150,180,250] "wide"',
      file: 'Centerpieces/Tool_hooks/odd.stl',
      volumeMm3: 100,
      fasteners: [],
    }
    const csv = bomToCsv(
      buildBom({ placements: place('odd', 1), parts: [awkward], fasteners: {} }),
    )
    expect(csv).toContain('"Wrench 86-05-[150,180,250] ""wide"""')
    // One header line plus one row — the comma did not split the row.
    expect(csv.trim().split('\n')).toHaveLength(2)
  })
})
