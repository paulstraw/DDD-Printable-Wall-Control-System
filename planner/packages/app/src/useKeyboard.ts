import { useEffect } from 'react'
import { useStore } from './store'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/**
 * Arrow keys nudge the selection by one slot; Delete removes it; Cmd/Ctrl+A
 * takes everything; Escape deselects or abandons a drag.
 *
 * A nudge is a whole slot, not a pixel — there is nowhere else a part can go,
 * so free movement would only ever be undone by the snap. Every one of these
 * acts on the whole selection, because a selection of one is not a special
 * case.
 */
export function useKeyboard() {
  const nudge = useStore((s) => s.nudge)
  const removeSelected = useStore((s) => s.removeSelected)
  const select = useStore((s) => s.select)
  const cancelDrag = useStore((s) => s.cancelDrag)
  const selectAll = useStore((s) => s.selectAll)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return

      // Cmd/Ctrl+A, before the plain-key switch so the browser's own
      // select-all never fires over the canvas.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        selectAll()
        event.preventDefault()
        return
      }

      switch (event.key) {
        case 'ArrowLeft':
          nudge(-1, 0)
          break
        case 'ArrowRight':
          nudge(1, 0)
          break
        case 'ArrowUp':
          nudge(0, 1)
          break
        case 'ArrowDown':
          nudge(0, -1)
          break
        case 'Delete':
        case 'Backspace':
          removeSelected()
          break
        case 'Escape':
          cancelDrag()
          select(null)
          break
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nudge, removeSelected, select, cancelDrag, selectAll])
}
