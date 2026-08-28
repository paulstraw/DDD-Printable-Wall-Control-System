import type { ComponentProps } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { withClass } from './withClass'

/**
 * A panel that takes over.
 *
 * The one difference from {@link Popover} is the backdrop, and it is the
 * whole reason both exist here. The color popover has no backdrop on purpose
 * — you change a color to watch the wall change behind it, so the wall stays
 * live. The shortcuts list is the opposite: there is nothing behind it worth
 * watching, and it is a list of the keys that everything behind it is
 * listening for.
 *
 * That second half matters more than it looks. This app binds bare letters:
 * `R` turns the selection and `C` cuts a cross-section, on a `window`
 * listener, with no modifier to tell them apart from typing. Reading a
 * shortcut off a list and idly pressing it should not quietly rearrange the
 * wall underneath. `useKeyboard` stands aside for anything inside a popup —
 * see the guard there — and this is the popup it was written for.
 *
 * `Portal` for the same reason the popover portals: the header is a wrapping
 * flex row and the viewport below it is a stacking context holding a WebGL
 * canvas, so a panel rendered in place would either stretch the one or
 * disappear behind the other.
 */
function Root(props: ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root {...props} />
}

function Trigger({ className, ...props }: ComponentProps<typeof BaseDialog.Trigger>) {
  return <BaseDialog.Trigger className={withClass('ghost-button', className)} {...props} />
}

function Portal(props: ComponentProps<typeof BaseDialog.Portal>) {
  return <BaseDialog.Portal {...props} />
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return <BaseDialog.Backdrop className={withClass('dialog-backdrop', className)} {...props} />
}

function Popup({ className, ...props }: ComponentProps<typeof BaseDialog.Popup>) {
  return <BaseDialog.Popup className={withClass('dialog-popup', className)} {...props} />
}

function Title({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title className={withClass('dialog-title', className)} {...props} />
}

function Description({ className, ...props }: ComponentProps<typeof BaseDialog.Description>) {
  return <BaseDialog.Description className={withClass('dialog-description', className)} {...props} />
}

function Close({ className, ...props }: ComponentProps<typeof BaseDialog.Close>) {
  return <BaseDialog.Close className={withClass('ghost-button', className)} {...props} />
}

export const Dialog = { Root, Trigger, Portal, Backdrop, Popup, Title, Description, Close }
