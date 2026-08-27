/**
 * The colors a wall is drawn in.
 *
 * Three belong to the scene and one belongs to each part, and the difference
 * between them is the whole model: the scene colors are always set, and a
 * part's color is usually absent. Absent does not mean "the default color" —
 * it means *whatever the default is*, so changing the wall's default repaints
 * every part that never asked for anything else, and leaves alone the three
 * shelves someone picked out in red.
 *
 * Stamping the default onto every placement at paint time would have been
 * simpler to write and wrong to live with: it would freeze fifty parts at
 * today's grey, and changing your mind about the wall would mean repainting
 * fifty things one at a time.
 */

/** A wall's own colors, as opposed to any particular part's. */
export interface WallColors {
  /** Behind everything — the viewport, not the app around it. */
  readonly background: string
  /** The pegboard panel. Wall Control sells real finishes, so this is not decoration. */
  readonly panel: string
  /** What a part is printed in unless it says otherwise. */
  readonly parts: string
}

/**
 * What the planner looked like before anyone could choose, and what a wall
 * saved back then still means. A document written before colors existed says
 * nothing about them, and this is what "nothing" decodes to — so an old share
 * link opens looking exactly as it did.
 */
export const DEFAULT_COLORS: WallColors = {
  background: '#f4f6f8',
  panel: '#a8aeb7',
  parts: '#b9bfc7',
}

/**
 * Six hex digits behind a `#`, and nothing else.
 *
 * Deliberately narrow. `<input type="color">` emits exactly this, so it is
 * the only thing the app can produce, and anything else arriving in a
 * document came from somewhere that was not this planner. Widening it to
 * accept `#f00` or a CSS color name would mean guessing at what a damaged
 * file meant, and a wrong guess here paints someone's wall a color they never
 * chose — which is worse than telling them the file is broken.
 */
const HEX = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/** Whether these are the colors a document can simply leave unsaid. */
export function isDefaultColors(colors: WallColors): boolean {
  return (
    colors.background === DEFAULT_COLORS.background &&
    colors.panel === DEFAULT_COLORS.panel &&
    colors.parts === DEFAULT_COLORS.parts
  )
}
