import { FILAMENTS } from '@ddd-planner/core'
import { Popover, Toolbar } from '../components'
import { useStore } from '../store'
import { ColorPicker } from './ColorPicker'

/**
 * Paint whatever is selected, behind one chip.
 *
 * The row this replaces was nine swatches, a free picker and a "Default"
 * button, expanded permanently, on the same line as flat/shelf and copy/cut.
 * It was the densest thing in the app and it was dense in the state you spend
 * the most time in, which is with something selected. The move is the one
 * `WallColors` already made and the argument is the same: a control set a few
 * times an hour does not deserve twelve permanent slots.
 *
 * What is left in the bar is a chip and a word, and the chip does the work a
 * collapsed control usually cannot — it reports the current state rather than
 * just offering the panel. Three states, and the third is the interesting
 * one:
 *
 *   * one color across the selection — the chip is that color
 *   * no single color — the chip is split, which is the only honest drawing
 *   * every part inheriting — the chip shows the wall's parts color, because
 *     that is genuinely what they are, and marks itself as borrowed
 *
 * The panel behind it is `ColorPicker`, unchanged, including the "Default"
 * button. That button clears the override rather than stamping today's
 * default color on: the two look identical the moment you press them and
 * diverge the moment the wall's default changes. It is still the only place a
 * user can act on that distinction.
 */
export function PaintSelection() {
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const paintSelection = useStore((s) => s.paintSelection)
  const wallParts = useStore((s) => s.colors.parts)

  if (selectedIds.length === 0) return null

  const chosen = new Set(selectedIds)
  const painted = new Set(placements.filter((p) => chosen.has(p.id)).map((p) => p.color))

  // What the picker gets: `null` for anything without one agreed color, which
  // is a mixed selection and an inheriting one alike. Both are "no swatch
  // pressed", and the picker has always been right to treat them the same.
  const current = painted.size === 1 ? ([...painted][0] ?? null) : null

  // What the chip gets, which is a finer question — the picker cannot show a
  // swatch for "the wall's grey", but a chip can, and it is the truth.
  const inheriting = painted.size === 1 && current === null
  const mixed = painted.size > 1

  return (
    <Popover.Root>
      <Toolbar.Button
        render={<Popover.Trigger />}
        className="paint-trigger"
        title={
          inheriting
            ? 'Paint — following the wall’s default'
            : mixed
              ? 'Paint — the selection is more than one color'
              : 'Paint the selection'
        }
      >
        <span
          className={mixed ? 'paint-chip is-mixed' : 'paint-chip'}
          style={mixed ? undefined : { background: current ?? wallParts }}
          aria-hidden
        />
        Paint
      </Toolbar.Button>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup className="paint-popup">
            <Popover.Title>Paint the selection</Popover.Title>
            <ColorPicker
              label="Selected parts"
              swatches={FILAMENTS}
              value={current}
              onChange={(hex) => paintSelection(hex)}
              onReset={() => paintSelection(null)}
            />
            <Popover.Description>
              {inheriting
                ? 'Following the wall’s parts color. Painting overrides it.'
                : 'Default clears the override, so these follow the wall again.'}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
