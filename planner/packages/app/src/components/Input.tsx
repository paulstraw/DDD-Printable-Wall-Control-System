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
export function Input(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...props} />
}
