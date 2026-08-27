import type { ComponentProps } from 'react'
import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar'
import { withClass } from './withClass'

/**
 * A cluster of controls that behaves as one stop in the tab order.
 *
 * The header's three button clusters — history, clipboard, wall actions — are
 * each a handful of buttons and each is currently a handful of tab stops.
 * A toolbar makes the cluster one stop and moves between its buttons with the
 * arrow keys, which is what a keyboard user reaching a row of buttons expects
 * and what these did not do.
 *
 * `Toolbar.Button` rather than the app's own {@link Button} inside one: the
 * toolbar has to know about its items to move focus between them, and it
 * learns that by them registering with it. A button that skipped the
 * registration would be a hole in the arrow-key path.
 */
function Root({ className, ...props }: ComponentProps<typeof BaseToolbar.Root>) {
  return <BaseToolbar.Root className={withClass('toolbar', className)} {...props} />
}

function Button({ className, ...props }: ComponentProps<typeof BaseToolbar.Button>) {
  return <BaseToolbar.Button className={withClass('ghost-button', className)} {...props} />
}

function Group({ className, ...props }: ComponentProps<typeof BaseToolbar.Group>) {
  return <BaseToolbar.Group className={withClass('toolbar-group', className)} {...props} />
}

function Input({ className, ...props }: ComponentProps<typeof BaseToolbar.Input>) {
  return <BaseToolbar.Input className={withClass('toolbar-input', className)} {...props} />
}

function Separator({ className, ...props }: ComponentProps<typeof BaseToolbar.Separator>) {
  return <BaseToolbar.Separator className={withClass('toolbar-separator', className)} {...props} />
}

export const Toolbar = { Root, Button, Group, Input, Separator }
