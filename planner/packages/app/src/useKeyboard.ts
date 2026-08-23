import { useEffect } from 'react'
import { useStore } from './store'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/**
 * Arrow keys nudge the selection by one slot; Delete removes it; Escape
 * deselects or abandons a drag.
 *
 * A nudge is a whole slot, not a pixel — there is nowhere else a part can go,
 * so free movement would only ever be undone by the snap.
 */
export function useKeyboard() {
  const nudge = useStore((s) => s.nudge)
  const removeSelected = useStore((s) => s.removeSelected)
  const select = useStore((s) => s.select)
  const cancelDrag = useStore((s) => s.cancelDrag)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return

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
  }, [nudge, removeSelected, select, cancelDrag])
}
