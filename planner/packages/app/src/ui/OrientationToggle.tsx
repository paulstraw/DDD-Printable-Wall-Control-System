import type { Orientation } from '@ddd-planner/core'
import { orientationsOf, partById, useStore } from '../store'

const LABEL: Record<Orientation, string> = {
  flat: 'Flat',
  shelf: 'Shelf',
}

const TITLE: Record<Orientation, string> = {
  flat: 'Hangs in the plane of the wall, between two sidepieces',
  shelf: 'Lies horizontal, dropped into the pockets along a sidepiece’s arm',
}

/**
 * Flat or shelf, for whatever is selected.
 *
 * Visible rather than a keystroke, because nothing on a spacer blank hints
 * that it turns — the upstream README recommends it in prose and the model
 * looks the same either way. A hidden shortcut would make the feature real
 * only for people who already knew about it, and would leave touch out
 * entirely.
 *
 * Shown only when the selection contains something that can actually be
 * turned, so it never appears as a dead control next to a bracket.
 */
export function OrientationToggle() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const setOrientation = useStore((s) => s.setOrientation)

  const selected = placements.filter((p) => selectedIds.includes(p.id))
  const turnable = selected.filter((p) => {
    const part = partById(catalog, p.partId)
    return part !== null && orientationsOf(part).length > 1
  })
  if (turnable.length === 0) return null

  // With a mixed selection neither button is "the" current state, so neither
  // is pressed and either one is a move that makes the whole group agree.
  const orientations = new Set(turnable.map((p) => p.orientation))
  const current = orientations.size === 1 ? [...orientations][0] : null

  return (
    <span className="orientation-toggle" role="group" aria-label="Mounting">
      {(['flat', 'shelf'] as const).map((orientation) => (
        <button
          key={orientation}
          type="button"
          className={orientation === current ? 'is-current' : undefined}
          aria-pressed={orientation === current}
          title={TITLE[orientation]}
          onClick={() => setOrientation(orientation)}
        >
          {LABEL[orientation]}
        </button>
      ))}
      <kbd>R</kbd>
    </span>
  )
}
