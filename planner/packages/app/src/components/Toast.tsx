import type { ComponentProps } from 'react'
import { Toast as BaseToast } from '@base-ui/react/toast'
import { withClass } from './withClass'

/**
 * Transient messages, stacked.
 *
 * This replaces a workaround the header explains in `WallActions.tsx`: *"The
 * header has one slot for a message and three components with something to put
 * in it, so the message lives in the store."* One slot meant the second message
 * silently replaced the first — share a link and import a file in quick
 * succession and the confirmation you were reading vanished. A stack has room
 * for all of them, so the store stops carrying a UI field.
 *
 * The messages this app has to deliver are confirmations and small failures —
 * *link copied*, *imported 42 parts*, *that download did not work* — none of
 * which should stop anyone from carrying on. A toast is that: it says its piece
 * beside the work rather than in front of it, and leaves on its own.
 *
 * `Toast.Provider` goes around the app and `Toast.Portal` puts the viewport at
 * the end of the body, for the same reason the popover portals — the viewport
 * has to sit above a WebGL canvas that makes its own stacking context.
 */
function Provider(props: ComponentProps<typeof BaseToast.Provider>) {
  return <BaseToast.Provider {...props} />
}

function Portal(props: ComponentProps<typeof BaseToast.Portal>) {
  return <BaseToast.Portal {...props} />
}

function Viewport({ className, ...props }: ComponentProps<typeof BaseToast.Viewport>) {
  return <BaseToast.Viewport className={withClass('toast-viewport', className)} {...props} />
}

function Root({ className, ...props }: ComponentProps<typeof BaseToast.Root>) {
  return <BaseToast.Root className={withClass('toast', className)} {...props} />
}

function Content({ className, ...props }: ComponentProps<typeof BaseToast.Content>) {
  return <BaseToast.Content className={withClass('toast-content', className)} {...props} />
}

function Title({ className, ...props }: ComponentProps<typeof BaseToast.Title>) {
  return <BaseToast.Title className={withClass('toast-title', className)} {...props} />
}

function Description({ className, ...props }: ComponentProps<typeof BaseToast.Description>) {
  return <BaseToast.Description className={withClass('toast-description', className)} {...props} />
}

function Close({ className, ...props }: ComponentProps<typeof BaseToast.Close>) {
  return <BaseToast.Close className={withClass('toast-close', className)} {...props} />
}

export const Toast = { Provider, Portal, Viewport, Root, Content, Title, Description, Close }

/**
 * Queue a toast. The one piece of Base UI's API the app calls rather than
 * renders, so it is re-exported by name rather than wrapped — there is nothing
 * to style about a function.
 */
export const useToastManager = BaseToast.useToastManager
