import type { ComponentProps } from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { withClass } from './withClass'

/**
 * The app's button.
 *
 * `ghost-button` is what every button in the header already wears, so it is
 * the default rather than something each caller repeats. A caller wanting a
 * different look passes its own class and gets both.
 *
 * Base UI's Button rather than a bare `<button>` for `focusableWhenDisabled`,
 * which the disabled ones in the header want: Undo, Redo, Share and Export all
 * switch themselves off, and a native disabled button drops focus on the
 * floor. Press Undo until the history runs out and a keyboard user is thrown
 * back to the top of the document. It stays opt-in — turning it on everywhere
 * would trade `disabled` for `aria-disabled` on buttons that have no such
 * problem.
 */
export function Button({ className, ...props }: ComponentProps<typeof BaseButton>) {
  return <BaseButton className={withClass('ghost-button', className)} {...props} />
}
