import type { ComponentProps } from 'react'
import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar'
import { withClass } from './withClass'

/**
 * A cluster of controls that behaves as one stop in the tab order.
 *
 * The header's button clusters — history, clipboard, wall actions — are each a
 * handful of buttons and were each a handful of tab stops. A toolbar makes a
 * cluster one stop and moves between its buttons with the arrow keys, which is
 * what a keyboard user reaching a row of buttons expects and what these did
 * not do.
 *
 * `Toolbar.Button` rather than the app's own {@link Button} inside one: the
 * toolbar has to know its items to move focus between them, and it learns that
 * by them registering with it. A button that skipped the registration would be
 * a hole in the arrow-key path.
 *
 * `Root`, `Button` and `Group` add **no class of their own**. The three
 * clusters this serves do not look alike — the header's two wear
 * `ghost-button` and the copy/cut pair in the hint row is smaller and styles
 * its children by descendant selector — so there is nothing shared to default
 * to, and a default would be one more rule every caller had to beat. A toolbar
 * here is behaviour, not a look.
 *
 * `Separator` is the exception, because a separator with no styling is an
 * invisible div and there is nothing else it could be for.
 *
 * One thing to know when styling: `Toolbar.Button` defaults to
 * `focusableWhenDisabled`, so a disabled button stays in the arrow-key path
 * rather than dropping out from under the cursor — press Undo until the
 * history runs out and focus stays put. It pays for that by carrying
 * `aria-disabled` instead of `disabled`, so `:disabled` no longer matches it
 * and stylesheets have to look for `[data-disabled]` as well.
 */
function Root(props: ComponentProps<typeof BaseToolbar.Root>) {
  return <BaseToolbar.Root {...props} />
}

function Button(props: ComponentProps<typeof BaseToolbar.Button>) {
  return <BaseToolbar.Button {...props} />
}

function Group(props: ComponentProps<typeof BaseToolbar.Group>) {
  return <BaseToolbar.Group {...props} />
}

function Input(props: ComponentProps<typeof BaseToolbar.Input>) {
  return <BaseToolbar.Input {...props} />
}

function Separator({ className, ...props }: ComponentProps<typeof BaseToolbar.Separator>) {
  return <BaseToolbar.Separator className={withClass('toolbar-separator', className)} {...props} />
}

export const Toolbar = { Root, Button, Group, Input, Separator }
