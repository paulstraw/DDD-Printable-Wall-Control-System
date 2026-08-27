/**
 * The colors we offer by name.
 *
 * Presets are a convenience, not a constraint: the picker also has a free
 * color input, and a document holds nothing but hex either way. **A name is a
 * lookup, never a stored value.** That matters because names are ours to
 * revise — rename "Galvanized" next year and every wall already saved renames
 * itself, where a document that had stored the word would be stuck with it.
 *
 * It also decides what happens to a color nobody named: the BOM prints the
 * hex. A print list saying `#7a4b2b` is honest about being a color the
 * planner has no word for, which is better than inventing "Brown" and being
 * wrong in front of someone about to spend a spool on it.
 */

/** A color with a name to call it by. */
export interface Swatch {
  readonly name: string
  readonly hex: string
}

/**
 * Panel finishes.
 *
 * These are not decoration and not a mood board: Wall Control sells the board
 * in real finishes, and these are the ones you can actually order. Anyone
 * planning a wall in black is planning to buy black.
 */
export const PANEL_FINISHES: readonly Swatch[] = [
  { name: 'Galvanized', hex: '#a8aeb7' },
  { name: 'White', hex: '#f2f3f5' },
  { name: 'Black', hex: '#1c1f24' },
  { name: 'Red', hex: '#a8322f' },
  { name: 'Blue', hex: '#2f5f8f' },
]

/**
 * Filament colors, for the parts.
 *
 * Chosen to be the spools people actually have rather than a full spectrum —
 * a longer row is not a better row when every extra swatch is one more thing
 * to read past. "Natural" is unpigmented PLA, which is a real and common
 * choice and does not look like white.
 */
export const FILAMENTS: readonly Swatch[] = [
  { name: 'Grey', hex: '#b9bfc7' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'White', hex: '#ececec' },
  { name: 'Natural', hex: '#ded3bd' },
  { name: 'Red', hex: '#c0392b' },
  { name: 'Orange', hex: '#e07b39' },
  { name: 'Yellow', hex: '#e8c33c' },
  { name: 'Green', hex: '#3f8f5a' },
  { name: 'Blue', hex: '#2f6fb5' },
]

/**
 * Backgrounds.
 *
 * Neutrals only, and deliberately. The background is the one color here that
 * is not describing anything real — it is what you judge the other two
 * against, and a colored one makes that judgement worse. The dark end is
 * genuinely useful: a white panel is invisible against a light background and
 * obvious against a charcoal one.
 */
export const BACKGROUNDS: readonly Swatch[] = [
  { name: 'Paper', hex: '#f4f6f8' },
  { name: 'Bone', hex: '#eceff2' },
  { name: 'Slate', hex: '#3a4048' },
  { name: 'Charcoal', hex: '#22262c' },
  { name: 'Ink', hex: '#12141a' },
]

const ALL: readonly Swatch[] = [...PANEL_FINISHES, ...FILAMENTS, ...BACKGROUNDS]

/**
 * What we call this color, or `null` if we do not call it anything.
 *
 * Case-insensitive, because a hand-edited document may spell a hex either
 * way and `#FF0000` is not a different color from `#ff0000`.
 *
 * One name per hex across every palette, first match winning. The palettes
 * overlap on purpose — grey is a panel finish and a filament both — and a
 * color that appeared under two names would make the BOM's print list
 * ambiguous about which spool it meant.
 */
export function nameForColor(hex: string): string | null {
  const wanted = hex.toLowerCase()
  return ALL.find((swatch) => swatch.hex.toLowerCase() === wanted)?.name ?? null
}

/**
 * What to *print* for this color: its name if it has one, else the hex.
 *
 * The BOM's copy button is where this earns its keep — a pasted list has no
 * swatches next to it, so the words are all that survive the paste.
 */
export function labelForColor(hex: string): string {
  return nameForColor(hex) ?? hex
}
