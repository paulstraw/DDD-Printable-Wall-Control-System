/**
 * What this machine calls its modifier key.
 *
 * Undo's tooltip asked the question first and answered it locally. The
 * shortcuts dialog asks it a dozen more times, so the answer moved here
 * rather than being written twice and drifting apart.
 *
 * A user-agent sniff, which is the wrong tool for nearly everything and the
 * right one here: nothing else reports which glyph is printed on the key, and
 * the worst a wrong guess can do is misname a key in a tooltip.
 */
const APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/**
 * `⌘` on an Apple keyboard, `Ctrl+` everywhere else.
 *
 * It carries its own separator, so it concatenates straight onto the key:
 * `${MOD}Z` is `⌘Z` or `Ctrl+Z`. A `+` after `⌘` is not how anyone writes it.
 */
export const MOD = APPLE ? '⌘' : 'Ctrl+'
