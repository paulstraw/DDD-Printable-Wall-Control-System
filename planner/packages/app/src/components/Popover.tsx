import type { ComponentProps } from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { withClass } from './withClass'

/**
 * A panel hung off a button.
 *
 * The color controls are the first thing in this app that needs one: three
 * swatch rows is more than fits in the header, and a modal dialog is the wrong
 * shape for a control you want to keep open while watching the wall change
 * behind it.
 *
 * `Portal` matters here rather than being ceremony. The header is a flex row
 * with `flex-wrap`, and the viewport below it is a stacking context holding a
 * WebGL canvas; a panel rendered in place would either stretch the header or
 * disappear behind the canvas. Portalling to the body and positioning against
 * the trigger sidesteps both.
 *
 * No `Backdrop`. A backdrop is for a popup that must be dealt with before
 * anything else, and this one is the opposite — the whole point is to change a
 * color and see the wall respond, which means the wall stays live underneath.
 */
function Root(props: ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root {...props} />
}

function Trigger({ className, ...props }: ComponentProps<typeof BasePopover.Trigger>) {
  return <BasePopover.Trigger className={withClass('ghost-button', className)} {...props} />
}

function Portal(props: ComponentProps<typeof BasePopover.Portal>) {
  return <BasePopover.Portal {...props} />
}

function Positioner({ className, ...props }: ComponentProps<typeof BasePopover.Positioner>) {
  return <BasePopover.Positioner className={withClass('popover-positioner', className)} {...props} />
}

function Popup({ className, ...props }: ComponentProps<typeof BasePopover.Popup>) {
  return <BasePopover.Popup className={withClass('popover-popup', className)} {...props} />
}

function Title({ className, ...props }: ComponentProps<typeof BasePopover.Title>) {
  return <BasePopover.Title className={withClass('popover-title', className)} {...props} />
}

function Description({ className, ...props }: ComponentProps<typeof BasePopover.Description>) {
  return <BasePopover.Description className={withClass('popover-description', className)} {...props} />
}

function Close({ className, ...props }: ComponentProps<typeof BasePopover.Close>) {
  return <BasePopover.Close className={withClass('ghost-button', className)} {...props} />
}

export const Popover = { Root, Trigger, Portal, Positioner, Popup, Title, Description, Close }
