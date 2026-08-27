import type { ComponentProps } from 'react'
import { Input as BaseInput } from '@base-ui/react/input'

/**
 * A text input.
 *
 * No class of its own, deliberately. Every input in this app is styled by the
 * thing that contains it — `.wall-size input`, `.save-assembly input`,
 * `.catalog-head input` — because each one is sized for its own slot and none
 * of them share a look worth naming. Stamping a common class here would add a
 * rule that every caller then has to override.
 *
 * What it is here for is the seam and Field: an Input inside a `Field.Root`
 * picks up the label, the description and the error wiring without the caller
 * matching up `id` and `aria-describedby` by hand.
 */
/**
 * Password managers should leave this app alone.
 *
 * There is nothing to sign into here — no account, no password, not so much
 * as an email box — so every fill offer this app could ever receive is a
 * wrong one, covering a control with a dropdown nobody wanted.
 *
 * It became a real problem rather than a theoretical one when the wall size
 * moved onto a number field. Base UI parses numbers itself, so its visible
 * input is `type="text"`, and that took the page from *no* text inputs to
 * two — which is precisely the shape field detection wakes up for. On the
 * machine this was found on, 1Password then spent the page's lifetime
 * failing to reach its own service worker and logging about it.
 *
 * `data-1p-ignore` is 1Password's documented opt-out and `data-lpignore` is
 * LastPass's. `autocomplete="off"` is set too, though the managers are
 * entitled to ignore it and mostly do. Spread before the caller's props, so
 * a control that ever does want a fill can say so.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': true,
} as const

export function Input(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...NO_AUTOFILL} {...props} />
}
