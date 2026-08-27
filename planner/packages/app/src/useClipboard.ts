import { useEffect } from 'react'
import { useToastManager } from './components'
import type { PasteResult } from './store'
import { useStore } from './store'
import { isTyping } from './useKeyboard'

/**
 * What to say about a paste, or `null` when it went perfectly and needs no
 * comment.
 *
 * Shared by the two ways in — the paste gesture here, and the Paste button in
 * `ui/Clipboard.tsx` — because the same outcome should not be described two
 * different ways depending on which one the user reached for.
 *
 * A paste of text that was never a clipping says nothing *here*: the gesture
 * belonged to someone else and there is nothing to report. The button has to
 * answer for itself, and does so on its own.
 */
export function pasteNotice(result: PasteResult): string | null {
  if (!result.ok) return null
  if (result.count === 0) return 'Nothing in that copy is in this library.'
  if (result.skipped === 0) return null
  return `Pasted ${result.count} · ${result.skipped} part${
    result.skipped === 1 ? '' : 's'
  } not in this library`
}

/**
 * Copy, cut and paste, through the browser's own clipboard events.
 *
 * Not `navigator.clipboard.readText()`, which needs permission in Chrome and
 * does not exist for web pages in Firefox. A `paste` event hands over
 * `clipboardData` with no permission at all — the catch being that it only
 * fires from a real paste gesture, never from a button, which is why the
 * buttons in `ui/Clipboard.tsx` take a different road.
 *
 * The wall does not always own the gesture. There is a BOM full of part names
 * and quantities in the right-hand column that someone may reasonably want to
 * select and copy into a shopping list, and an assembly-name box they may want
 * to paste into — and parts are selected almost all the time here, since
 * anything you place arrives selected. So `Cmd+C` belongs to the wall only
 * when nothing else has a claim on it.
 */
function wallOwnsGesture(target: EventTarget | null): boolean {
  // The same answer `useKeyboard` uses, from the same function. Two functions
  // that agreed about this today would eventually disagree.
  if (isTyping(target)) return false

  // Highlighted text is the user's to copy, not ours to take.
  const selection = window.getSelection()
  return selection === null || selection.isCollapsed
}

export function useClipboard() {
  const toast = useToastManager()

  useEffect(() => {
    function onCopy(event: ClipboardEvent) {
      if (!wallOwnsGesture(event.target)) return
      const text = useStore.getState().copySelection()
      if (text === null) return
      event.clipboardData?.setData('text/plain', text)
      event.preventDefault()
    }

    function onCut(event: ClipboardEvent) {
      if (!wallOwnsGesture(event.target)) return
      const text = useStore.getState().cutSelection()
      if (text === null) return
      event.clipboardData?.setData('text/plain', text)
      event.preventDefault()
    }

    function onPaste(event: ClipboardEvent) {
      if (!wallOwnsGesture(event.target)) return
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return

      // Text that is not ours is not ours. The session's own clipping is
      // deliberately *not* consulted here: falling back to it would mean
      // copying a URL somewhere else and pasting here drops six brackets you
      // copied twenty minutes ago onto the wall.
      const result = useStore.getState().pasteText(text)
      if (!result.ok) return
      event.preventDefault()

      const notice = pasteNotice(result)
      if (notice !== null) toast.add({ title: notice })
    }

    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [toast])
}
