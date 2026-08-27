import { FILAMENTS } from '@ddd-planner/core'
import { useStore } from '../store'
import { ColorPicker } from './ColorPicker'

/**
 * Paint whatever is selected, in the hint row beside the flat/shelf toggle
 * and copy/cut.
 *
 * Same place and same reasoning as those two: it acts on the selection, so it
 * appears with one and goes away with it rather than sitting there dead. The
 * precedent is `OrientationToggle`, which is where selection-scoped controls
 * in this app live.
 *
 * "Default" clears the override rather than painting on today's default
 * color. The two look identical the moment you press them and diverge the
 * moment the wall's default changes — a cleared part follows, a stamped one
 * sits at last week's grey. That distinction is the whole color model, and
 * this button is the only place a user can act on it.
 */
export function PaintSelection() {
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const paintSelection = useStore((s) => s.paintSelection)

  if (selectedIds.length === 0) return null

  // A mixed selection has no single color to show as current, and neither
  // does one that is inheriting — the swatch row shows nothing pressed for
  // both, which is honest about both.
  const chosen = new Set(selectedIds)
  const painted = new Set(placements.filter((p) => chosen.has(p.id)).map((p) => p.color))
  const current = painted.size === 1 ? ([...painted][0] ?? null) : null

  return (
    <span className="paint-selection">
      <ColorPicker
        label="Selected parts"
        swatches={FILAMENTS}
        value={current}
        onChange={(hex) => paintSelection(hex)}
        onReset={() => paintSelection(null)}
      />
    </span>
  )
}
