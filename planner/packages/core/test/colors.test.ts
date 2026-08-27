import { describe, expect, it } from 'vitest'
import { DEFAULT_COLORS, isDefaultColors, isHexColor, resolveColor } from '../src/colors'

describe('resolving what a part is painted', () => {
  it('gives back the color a painted part asked for', () => {
    expect(resolveColor({ color: '#ff0000' }, '#b9bfc7')).toBe('#ff0000')
  })

  it('falls back to the wall default when the part never asked', () => {
    expect(resolveColor({}, '#b9bfc7')).toBe('#b9bfc7')
    expect(resolveColor({ color: undefined }, '#b9bfc7')).toBe('#b9bfc7')
  })

  it('repaints the unpainted when the default changes, and only those', () => {
    // The point of inheriting rather than stamping: set the wall to black and
    // the parts nobody picked out follow, while the three someone painted red
    // stay red.
    const parts = [{ color: '#ff0000' }, {}, {}]
    expect(parts.map((p) => resolveColor(p, '#b9bfc7'))).toEqual([
      '#ff0000',
      '#b9bfc7',
      '#b9bfc7',
    ])
    expect(parts.map((p) => resolveColor(p, '#000000'))).toEqual([
      '#ff0000',
      '#000000',
      '#000000',
    ])
  })
})

describe('recognising a color', () => {
  it('accepts six hex digits behind a hash, in either case', () => {
    expect(isHexColor('#ff0000')).toBe(true)
    expect(isHexColor('#FF00aa')).toBe(true)
  })

  it('refuses everything else, rather than guessing', () => {
    for (const value of ['#f00', 'red', 'ff0000', '#ff00000', '#gggggg', '', 16711680, null, undefined]) {
      expect(isHexColor(value)).toBe(false)
    }
  })
})

describe('the default colors', () => {
  it('are what the planner has always drawn', () => {
    expect(isDefaultColors(DEFAULT_COLORS)).toBe(true)
  })

  it('are not defaults once any one of the three moves', () => {
    expect(isDefaultColors({ ...DEFAULT_COLORS, panel: '#000000' })).toBe(false)
    expect(isDefaultColors({ ...DEFAULT_COLORS, background: '#000000' })).toBe(false)
    expect(isDefaultColors({ ...DEFAULT_COLORS, parts: '#000000' })).toBe(false)
  })
})
