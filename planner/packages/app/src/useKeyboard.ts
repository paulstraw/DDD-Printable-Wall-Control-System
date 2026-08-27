import { useEffect } from 'react'
import { useStore } from './store'

/** Whether the event landed in something the user is typing into. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/**
 * Arrow keys nudge the selection by one slot; Delete removes it; R turns it
 * between flat and shelf; C cuts a cross-section through the wall; Cmd/Ctrl+A
 * takes everything; Cmd/Ctrl+Z steps back and Cmd/Ctrl+Shift+Z steps forward;
 * Escape deselects or abandons a drag.
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
  const setOrientation = useStore((s) => s.setOrientation)
  const toggleSection = useStore((s) => s.toggleSection)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return

      // The modifier keys, before the plain-key switch, so the browser's own
      // select-all never fires over the canvas.
      if (event.metaKey || event.ctrlKey) {
        switch (event.key.toLowerCase()) {
          case 'a':
            selectAll()
            break
          case 'z':
            // Shift+Z is redo everywhere; Ctrl+Y is how Windows spells the
            // same thing, and costs one line to honour.
            if (event.shiftKey) redo()
            else undo()
            break
          case 'y':
            redo()
            break
          default:
            return
        }
        event.preventDefault()
        return
      }

      switch (event.key) {
        // `event.repeat` is the OS generating keydowns while the key is
        // held. The parts still move; history just does not count each one,
        // so sliding a part across the wall costs one undo rather than thirty.
        case 'ArrowLeft':
          nudge(-1, 0, event.repeat)
          break
        case 'ArrowRight':
          nudge(1, 0, event.repeat)
          break
        case 'ArrowUp':
          nudge(0, 1, event.repeat)
          break
        case 'ArrowDown':
          nudge(0, -1, event.repeat)
          break
        case 'Delete':
        case 'Backspace':
          removeSelected()
          break
        case 'r':
        case 'R': {
          // A toggle rather than two keys: with a mixed selection the first
          // press makes the group agree on shelf, which is the reading that
          // needs no explanation.
          const { placements, selectedIds } = useStore.getState()
          const chosen = placements.filter((p) => selectedIds.includes(p.id))
          const allShelves = chosen.length > 0 && chosen.every((p) => p.orientation === 'shelf')
          setOrientation(allShelves ? 'flat' : 'shelf')
          break
        }
        case 'c':
        case 'C':
          // Bare C only. Cmd/Ctrl+C is copy and never reaches here — the
          // modifier switch above returns first — which is the trade this
          // always meant to make.
          toggleSection()
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
  }, [nudge, removeSelected, select, cancelDrag, selectAll, setOrientation, toggleSection, undo, redo])
}
