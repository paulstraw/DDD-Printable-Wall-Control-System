import { Button, Toolbar, useToastManager } from '../components'
import { MOD } from '../platform'
import { useStore } from '../store'
import { pasteNotice } from '../useClipboard'

/**
 * Copy, cut and paste as buttons, for the people who have no keys.
 *
 * A phone has no `Cmd+V`, and this planner takes touch seriously enough to
 * have built tap-to-place around it. So paste needs a button — and a Paste
 * button is useless without a Copy button, which is why both exist rather
 * than just the one that was strictly missing.
 *
 * A button is not a clipboard event, so these cannot read or write
 * `clipboardData` and have to go through `navigator.clipboard` instead. That
 * is the one path where the system clipboard may be unreadable, and the one
 * place the session's own clipping is allowed to stand in for it.
 */

/**
 * Copy and cut, in the selection bar beside the selection they act on.
 *
 * A fragment rather than a toolbar of its own: the selection bar is the
 * toolbar now, and a nested one would be a second tab stop inside a cluster
 * that exists to be one.
 */
export function CopyCut() {
  const selectedIds = useStore((s) => s.selectedIds)
  if (selectedIds.length === 0) return null

  async function put(text: string | null) {
    if (text === null) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Refused, or unavailable. `copySelection` has already kept a copy in
      // the store, so the Paste button below still works — just not in
      // another tab.
    }
  }

  return (
    <>
      <Toolbar.Button
        title={`Copy the selection (${MOD}C)`}
        onClick={() => void put(useStore.getState().copySelection())}
      >
        Copy
      </Toolbar.Button>
      <Toolbar.Button
        title={`Cut the selection (${MOD}X)`}
        onClick={() => void put(useStore.getState().cutSelection())}
      >
        Cut
      </Toolbar.Button>
    </>
  )
}

/**
 * Paste, in the header.
 *
 * Never disabled, because knowing whether there is anything to paste means
 * reading the clipboard, and reading the clipboard is the thing that needs a
 * user gesture. So it is always live and says so when it comes up empty — a
 * button that silently does nothing is indistinguishable from a broken one,
 * and on a phone this is the only way in.
 */
export function PasteButton() {
  const toast = useToastManager()

  async function paste() {
    const store = useStore.getState()

    let text: string | null = null
    let readable = false
    try {
      text = await navigator.clipboard.readText()
      readable = true
    } catch {
      // Firefox has no `readText` for pages at all; Chrome can refuse it.
    }

    // Fall back only when the system clipboard could not be read — *not* when
    // it was read and holds someone else's text. That case is a paste of
    // something that is not a wall, and the right answer to it is nothing.
    if (!readable) text = store.clipping

    // The button, unlike the gesture, has to answer for itself: someone
    // pressed it on purpose and a button that silently does nothing is
    // indistinguishable from a broken one.
    if (text === null || text === '') {
      toast.add({ title: 'Nothing on the clipboard to paste.' })
      return
    }

    const result = store.pasteText(text)
    if (!result.ok) {
      toast.add({ title: 'Nothing on the clipboard to paste.' })
      return
    }

    const notice = pasteNotice(result)
    if (notice !== null) toast.add({ title: notice })
  }

  // A plain button, not a toolbar item: it stands alone in the header, and a
  // toolbar of one is a tab stop that goes nowhere.
  return (
    <Button onClick={() => void paste()} title={`Paste parts (${MOD}V)`}>
      Paste
    </Button>
  )
}
