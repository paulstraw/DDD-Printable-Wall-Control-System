import { Toolbar } from '../components'
import { canRedo, canUndo } from '../history'
import { useStore } from '../store'

/**
 * Undo and redo, next to the buttons they exist to rescue you from.
 *
 * Visible rather than keyboard-only, and for one reason above the others:
 * Import sits two buttons away, it discards everything on the wall with no
 * confirmation, and the audience here is someone who found a pegboard library
 * on GitHub — not someone who would think to try Ctrl+Z on a web page.
 *
 * Always shown, never hidden when empty. The disabled state is the only thing
 * that says undo has a floor, and that a fresh reload starts without a past.
 *
 * A toolbar rather than two loose buttons, so the pair is one tab stop with
 * the arrows moving between them. It matters more here than in the other
 * clusters: a disabled toolbar button stays focusable, so undoing your way
 * down to an empty history leaves focus on Undo instead of dropping it — the
 * exact moment you are most likely to want Redo, one arrow key away.
 */

/** ⌘ or Ctrl, so the tooltip names the key this machine actually has. */
const APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const MOD = APPLE ? '⌘' : 'Ctrl+'

export function UndoRedo() {
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const history = useStore((s) => s.history)

  return (
    <Toolbar.Root className="undo-redo" aria-label="History">
      <Toolbar.Button
        className="ghost-button"
        onClick={undo}
        disabled={!canUndo(history)}
        title={`Undo (${MOD}Z)`}
      >
        Undo
      </Toolbar.Button>
      <Toolbar.Button
        className="ghost-button"
        onClick={redo}
        disabled={!canRedo(history)}
        title={`Redo (${MOD}⇧Z)`}
      >
        Redo
      </Toolbar.Button>
    </Toolbar.Root>
  )
}
