import type { Orientation } from '@ddd-planner/core'
import { Toggle, ToggleGroup, Toolbar } from '../components'
import { orientationsOf, partById, useStore } from '../store'

const LABEL: Record<Orientation, string> = {
  flat: 'Flat',
  shelf: 'Shelf',
}

const TITLE: Record<Orientation, string> = {
  flat: 'Hangs in the plane of the wall, between two sidepieces (R)',
  shelf: 'Lies horizontal, dropped into the pockets along a sidepiece’s arm (R)',
}

/**
 * The parts of the selection that can actually be turned.
 *
 * Exported as a hook because the selection bar has to know the same thing to
 * decide whether a separator belongs beside this control, and two functions
 * that agreed about it today would eventually disagree.
 */
export function useTurnable() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)

  return placements.filter((p) => {
    if (!selectedIds.includes(p.id)) return false
    const part = partById(catalog, p.partId)
    return part !== null && orientationsOf(part).length > 1
  })
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
 *
 * The `R` chip that used to sit beside it is gone with every other `<kbd>` in
 * the bar; the key is in the two tooltips instead, and in the shortcuts
 * dialog. Belongs inside a `Toolbar.Root` — its buttons register with the
 * toolbar around it so the arrow keys run through the whole selection bar
 * rather than stopping at the edge of this pair.
 */
export function OrientationToggle() {
  const setOrientation = useStore((s) => s.setOrientation)
  const turnable = useTurnable()

  if (turnable.length === 0) return null

  // With a mixed selection neither button is "the" current state, so neither
  // is pressed and either one is a move that makes the whole group agree.
  const orientations = new Set(turnable.map((p) => p.orientation))
  // `?? null` only to fold away the `undefined` an indexed read carries;
  // the size check has already established there is one.
  const current = orientations.size === 1 ? ([...orientations][0] ?? null) : null

  return (
    <ToggleGroup<Orientation>
      className="orientation-toggle"
      aria-label="Mounting"
      // A mixed selection is the empty array — nothing pressed, which is the
      // whole reason the group's value is a list rather than one orientation.
      value={current === null ? [] : [current]}
      onValueChange={([chosen]) => {
        // Pressing the button that is already pressed asks a toggle group to
        // unpress it, and arrives here as an empty array. Ignore it: a
        // placement is always mounted one way or the other, so "neither" is
        // not a state anything can be put into. Nothing re-renders, because
        // the group is controlled and its value has not changed.
        if (chosen !== undefined) setOrientation(chosen)
      }}
    >
      {(['flat', 'shelf'] as const).map((orientation) => (
        <Toolbar.Button
          key={orientation}
          render={<Toggle<Orientation> value={orientation} />}
          title={TITLE[orientation]}
        >
          {LABEL[orientation]}
        </Toolbar.Button>
      ))}
    </ToggleGroup>
  )
}
