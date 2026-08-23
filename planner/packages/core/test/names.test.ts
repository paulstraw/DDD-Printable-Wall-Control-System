import { describe, expect, it } from 'vitest'
import { PART_VARIANTS, parsePartName } from '../src/names'

/** Shorthand for the four fields the catalog actually facets on. */
function dims(filename: string) {
  const { h, w, base, variant } = parsePartName(filename)
  return { h, w, base, variant }
}

describe('the standard convention', () => {
  it('reads `HxW Name Variant.stl`', () => {
    expect(dims('3x0 Flat Left.stl')).toEqual({ h: 3, w: 0, base: 'Flat', variant: 'left' })
    expect(dims('1x0 Flat Right.stl')).toEqual({ h: 1, w: 0, base: 'Flat', variant: 'right' })
    expect(dims('5x0 Flat Center.stl')).toEqual({ h: 5, w: 0, base: 'Flat', variant: 'center' })
  })

  it('reads multi-word bases with no variant', () => {
    expect(dims('2x3 Spacer clip-on.stl')).toEqual({
      h: 2,
      w: 3,
      base: 'Spacer clip-on',
      variant: null,
    })
    expect(dims('1x7 Spacer blank.stl')).toEqual({
      h: 1,
      w: 7,
      base: 'Spacer blank',
      variant: null,
    })
  })

  it('keeps modifiers like Inverted and Midmount in the base', () => {
    // They qualify the shape; only the trailing L/R/C token is the variant.
    expect(dims('2x1 L Bracket Flat Midmount Left.stl')).toEqual({
      h: 2,
      w: 1,
      base: 'L Bracket Flat Midmount',
      variant: 'left',
    })
    expect(dims('1x6 11pc Wrench Hanger Inverted.stl')).toEqual({
      h: 1,
      w: 6,
      base: '11pc Wrench Hanger Inverted',
      variant: null,
    })
  })

  it('reads fractional second dimensions', () => {
    expect(dims('2x2.25 1.5in U Bracket Center.stl')).toEqual({
      h: 2,
      w: 2.25,
      base: '1.5in U Bracket',
      variant: 'center',
    })
    expect(dims('8x2.25 LiitoKala Charger.stl')).toEqual({
      h: 8,
      w: 2.25,
      base: 'LiitoKala Charger',
      variant: null,
    })
  })

  it('does not mistake a trailing size for a variant', () => {
    // The trailing 1x1 is the Gridfinity grid, not a part dimension.
    expect(dims('2x2 Gridfinity Frame 1x1.stl')).toEqual({
      h: 2,
      w: 2,
      base: 'Gridfinity Frame 1x1',
      variant: null,
    })
  })
})

describe('the community Tool_hooks convention', () => {
  it('accepts underscore separators and treats them as spaces', () => {
    expect(dims('2x5_milwaukee_M12_battery_x2.stl')).toEqual({
      h: 2,
      w: 5,
      base: 'milwaukee M12 battery x2',
      variant: null,
    })
    expect(dims('4x3_Air_Compressor.stl')).toEqual({
      h: 4,
      w: 3,
      base: 'Air Compressor',
      variant: null,
    })
  })

  it('accepts a hyphen separator', () => {
    expect(dims('3x2-18GuBradNailer.stl')).toEqual({
      h: 3,
      w: 2,
      base: '18GuBradNailer',
      variant: null,
    })
    expect(dims('3x2-16GuAngledNailer.stl')).toEqual({
      h: 3,
      w: 2,
      base: '16GuAngledNailer',
      variant: null,
    })
  })

  it('leaves hyphens that belong to the name alone', () => {
    expect(dims('1x2 NWS 138-69-200 Fantastico Plus Side Cutters.stl').base).toBe(
      'NWS 138-69-200 Fantastico Plus Side Cutters',
    )
    expect(dims('1x3 Knipex 3x Pliers Wrench 86-05-[150+180+250].stl').base).toBe(
      'Knipex 3x Pliers Wrench 86-05-[150+180+250]',
    )
  })
})

describe('names with no readable dimensions', () => {
  it('returns null dimensions rather than throwing', () => {
    expect(dims('Quickhook 1in Heavy.stl')).toEqual({
      h: null,
      w: null,
      base: 'Quickhook 1in Heavy',
      variant: null,
    })
    expect(dims('Wall Control Panel Model.stl')).toEqual({
      h: null,
      w: null,
      base: 'Wall Control Panel Model',
      variant: null,
    })
  })

  it('does not read a three-part millimetre size as a grid size', () => {
    // 4x10x8mm is the pin's physical size. Reading it as h=4 w=10 would put a
    // dowel pin in the catalog as a 4-unit-tall part.
    expect(dims('4x10x8mm Pin.stl')).toEqual({
      h: null,
      w: null,
      base: '4x10x8mm Pin',
      variant: null,
    })
  })

  it('is not fooled by other leading numbers', () => {
    expect(dims('8mm Lock Pin.stl').h).toBeNull()
    expect(dims('3-4in Dowel Cap with Countersunk #8 Screw.stl').h).toBeNull()
    expect(dims('3-4in Dowel Cap with Countersunk #8 Screw.stl').base).toBe(
      '3-4in Dowel Cap with Countersunk #8 Screw',
    )
  })

  it('survives an empty name', () => {
    expect(dims('')).toEqual({ h: null, w: null, base: '', variant: null })
  })
})

describe('normalisation', () => {
  it('accepts a path and keeps only the basename', () => {
    expect(parsePartName('Sidepieces/Flats/3x0 Flat Left.stl').filename).toBe('3x0 Flat Left')
    expect(parsePartName('Sidepieces\\Flats\\3x0 Flat Left.stl').h).toBe(3)
  })

  it('strips the extension case-insensitively', () => {
    expect(parsePartName('3x0 Flat Left.STL').filename).toBe('3x0 Flat Left')
    expect(parsePartName('3x0 Flat Left').filename).toBe('3x0 Flat Left')
  })

  it('trims the trailing space some filenames carry', () => {
    // `3x4.25 4in U Bracket Center .stl` is in the repo exactly like this.
    expect(dims('3x4.25 4in U Bracket Center .stl')).toEqual({
      h: 3,
      w: 4.25,
      base: '4in U Bracket',
      variant: 'center',
    })
  })

  it('builds a separator-normalised lowercase search key', () => {
    expect(parsePartName('2x5_milwaukee_M12_battery_x2.stl').searchKey).toBe(
      '2x5 milwaukee m12 battery x2',
    )
    expect(parsePartName('2x3 Spacer clip-on.stl').searchKey).toBe('2x3 spacer clip on')
  })

  it('accepts either spelling of centre', () => {
    expect(parsePartName('2x2 Widget Centre.stl').variant).toBe('center')
  })

  it('exports the variant vocabulary', () => {
    expect(PART_VARIANTS).toEqual(['left', 'right', 'center'])
  })
})

describe('dimension pairing', () => {
  it('sets h and w together or not at all', () => {
    for (const name of ['3x0 Flat Left.stl', 'Quickhook Retainer.stl', '4x10x8mm Pin.stl']) {
      const { h, w } = parsePartName(name)
      expect(h === null).toBe(w === null)
    }
  })
})
