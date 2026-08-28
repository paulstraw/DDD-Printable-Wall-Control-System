import { slotColumnCount, slotRowCount } from '@ddd-planner/core'
import { useStore } from '../store'

/**
 * The one thing a new arrival cannot guess.
 *
 * A bare pegboard gives no clue that parts *mate* — that sidepieces hang
 * from the slots and a centerpiece spans between two of them. That is the
 * whole grammar of the system, and one assembled example teaches it faster
 * than any paragraph, so the offer to build one is the main affordance here.
 *
 * The overlay is `pointer-events: none` apart from its button. An empty
 * wall is exactly when someone is most likely to drag their first part onto
 * it, and a panel that swallowed that drop would be worse than no panel.
 *
 * It used to end with three keyboard shortcuts. They are in the shortcuts
 * dialog now, with the rest — three of a dozen, chosen because they fitted on
 * one line, was never a list anyone could rely on, and a first visit is
 * already asking someone to take in what a sidepiece is.
 */

/** The canonical joint, by name — the one the whole project is built around. */
const EXAMPLE = ['3x0 Flat Left', '3x3 Spacer blank', '3x0 Flat Right'] as const

export function EmptyState() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const board = useStore((s) => s.board)
  const addPlacements = useStore((s) => s.addPlacements)

  if (!catalog || placements.length > 0) return null

  const parts = EXAMPLE.map((name) => catalog.parts.find((p) => p.name === name))
  const canBuild = parts.every((p) => p !== undefined)

  function build() {
    const cols = slotColumnCount(board)
    const rows = slotRowCount(board)
    // Roughly centred, and never off a board too small to hold it.
    const col = Math.max(0, Math.min(Math.floor(cols / 2) - 2, cols - 4))
    const row = Math.max(0, Math.floor(rows / 2))
    const [left, centre, right] = parts
    if (!left || !centre || !right) return
    // The plate is anchored on the same column as the Flat Left: the
    // bracket's body fills the bay to the left of that column and the plate
    // starts on it. The Flat Right goes on the column the plate's far edge
    // lands on, three along. See `occupiedBays`.
    addPlacements([
      { partId: left.id, col, row },
      { partId: centre.id, col, row },
      { partId: right.id, col: col + 3, row },
    ])
  }

  return (
    <div className="empty-state">
      <div className="empty-card">
        <h2>Plan a Wall Control wall</h2>
        <p>
          Drag a part from the catalog onto the board. <strong>Sidepieces</strong> hang from the
          slots; a <strong>centerpiece</strong> spans between two of them.
        </p>
        <p className="empty-aside">
          Everything you place becomes a print list, with fasteners added for you.
        </p>
        {canBuild ? (
          <button className="ghost-button" onClick={build}>
            Build an example
          </button>
        ) : null}
      </div>
    </div>
  )
}
