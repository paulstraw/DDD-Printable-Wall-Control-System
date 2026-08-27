import { describe, expect, it } from 'vitest'
import { DEFAULT_COLORS, isHexColor } from '../src/colors'
import {
  BACKGROUNDS,
  FILAMENTS,
  PANEL_FINISHES,
  labelForColor,
  nameForColor,
} from '../src/palettes'

const ALL = [...PANEL_FINISHES, ...FILAMENTS, ...BACKGROUNDS]

describe('the palettes themselves', () => {
  it('hold nothing that is not a color', () => {
    // A preset that fails the document's own validator would be a swatch you
    // could click and then not save.
    for (const swatch of ALL) expect(isHexColor(swatch.hex)).toBe(true)
  })

  it('offer the planner’s own defaults, so the starting point has a name', () => {
    expect(nameForColor(DEFAULT_COLORS.panel)).toBe('Galvanized')
    expect(nameForColor(DEFAULT_COLORS.parts)).toBe('Grey')
    expect(nameForColor(DEFAULT_COLORS.background)).toBe('Paper')
  })

  it('never give one color two names', () => {
    // Palettes overlap on purpose — grey is a finish and a filament both —
    // but a hex that resolved to two names would leave the print list
    // ambiguous about which spool it meant.
    const byHex = new Map<string, Set<string>>()
    for (const { hex, name } of ALL) {
      const names = byHex.get(hex.toLowerCase()) ?? new Set()
      names.add(name)
      byHex.set(hex.toLowerCase(), names)
    }
    for (const [hex, names] of byHex) expect([hex, names.size]).toEqual([hex, 1])
  })
})

describe('naming a color', () => {
  it('finds a preset whatever case it is written in', () => {
    expect(nameForColor('#A8AEB7')).toBe('Galvanized')
    expect(nameForColor('#a8aeb7')).toBe('Galvanized')
  })

  it('has no name for a color nobody chose from a palette', () => {
    expect(nameForColor('#7a4b2b')).toBeNull()
  })

  it('prints the hex when there is no name, rather than inventing one', () => {
    // Guessing "Brown" in front of someone about to buy a spool is worse
    // than admitting the planner has no word for it.
    expect(labelForColor('#7a4b2b')).toBe('#7a4b2b')
    expect(labelForColor('#1a1a1a')).toBe('Black')
  })
})
