/*
 * The Base UI seam.
 *
 * The rule: **nothing outside this directory imports `@base-ui/react`.** Every
 * DOM control in the app comes from here, and this file is the front door —
 * one import path to grep for, one directory to read, so the rule can be
 * checked by looking rather than by tooling. There is no linter in this
 * project and there is not going to be one; the rule is a convention, and
 * this comment is where it is written down.
 *
 * The reason is dependency risk. Base UI is a young library on a fast release
 * cadence — it reached 1.0 in December 2025 and is already at 1.7 — and every
 * control in the app is about to depend on it. Confining the import to one
 * directory means an API that shifts underneath us is a day's work in a known
 * place, not a search-and-replace across the whole UI.
 *
 * What lives here is *styled pass-through*: Base UI's compound parts with the
 * app's existing classes attached, and nothing else. The wrappers do not
 * invent app-shaped APIs, do not fold several parts into one prop bag, and do
 * not hold state. A caller composes them exactly as it would compose Base UI:
 *
 *   <ToggleGroup value={current} onValueChange={setOrientation}>
 *     <Toggle value="flat">Flat</Toggle>
 *     <Toggle value="shelf">Shelf</Toggle>
 *   </ToggleGroup>
 *
 * That is deliberate. A narrowed wrapper has to grow a prop every time a
 * caller needs something the wrapper did not anticipate, and each one is a
 * small guess about what the library means. Pass-through keeps the seam thin
 * enough that reading it tells you the whole of what it does.
 */

export { Button } from './Button'
export { Field } from './Field'
export { Input } from './Input'
export { NumberField } from './NumberField'
export { Popover } from './Popover'
export { Toast, useToastManager } from './Toast'
export { Toggle, ToggleGroup } from './ToggleGroup'
export { Toolbar } from './Toolbar'
