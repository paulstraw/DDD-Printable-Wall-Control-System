import { Toast, useToastManager } from '../components'

/**
 * Everything the app has to say, stacked in the corner.
 *
 * This replaces a workaround the header used to carry, and the reason it
 * existed is the reason this exists: there was one slot for a message and
 * three components with something to put in it, so the message lived in the
 * store and the second one silently replaced the first. Share a link and then
 * import a file and the confirmation you were reading was simply gone. A stack
 * has room for all of them.
 *
 * Nothing here is load-bearing. These are confirmations and small failures —
 * *link copied*, *imported 42 parts*, *that download did not work* — and none
 * of them should stop anyone working. They say their piece beside the wall
 * rather than in front of it, and most leave on their own.
 *
 * Most, not all: anything that reports a failure is added with `timeout: 0`
 * and stays until it is dismissed. The note it replaces behaved that way too,
 * and for the same reason — a message explaining why a wall did not load is
 * worth more than five seconds of a reader's attention.
 */
export function Toasts() {
  const { toasts } = useToastManager()

  return (
    <Toast.Portal>
      <Toast.Viewport>
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast}>
            <Toast.Content>
              <div className="toast-text">
                <Toast.Title />
                {toast.description ? <Toast.Description /> : null}
              </div>
              {/*
                A close button on every toast, not just the ones that stay. On
                touch there is no other way to get rid of one early, and a
                swipe is not discoverable enough to be the only way out.
              */}
              <Toast.Close aria-label="Dismiss">×</Toast.Close>
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
