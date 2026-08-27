import { BACKGROUNDS, FILAMENTS, PANEL_FINISHES } from '@ddd-planner/core'
import { Popover } from '../components'
import { useStore } from '../store'
import { ColorPicker } from './ColorPicker'

/**
 * The wall's three colors, behind one button in the header.
 *
 * A popover rather than three rows sitting in the header permanently: these
 * are set once and then left alone for the rest of a session, and a control
 * you touch twice an hour does not deserve permanent space in a bar that is
 * already full. It is also the wrong shape for a dialog — the whole point is
 * to change a color and watch the wall change behind it, so the wall stays
 * live and nothing is dimmed.
 *
 * No reset here. These three *are* the bottom of the chain — a part can fall
 * back to the wall's default, but the wall's default has nothing beneath it
 * to fall back to.
 */
const ROWS = [
  { key: 'background', label: 'Background', swatches: BACKGROUNDS },
  { key: 'panel', label: 'Panel', swatches: PANEL_FINISHES },
  { key: 'parts', label: 'Parts', swatches: FILAMENTS },
] as const

export function WallColors() {
  const colors = useStore((s) => s.colors)
  const setWallColor = useStore((s) => s.setWallColor)

  return (
    <Popover.Root>
      <Popover.Trigger>Colors</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="wall-colors">
            <Popover.Title>Wall colors</Popover.Title>
            {ROWS.map((row) => (
              <div key={row.key} className="wall-colors-row">
                <span className="wall-colors-label">{row.label}</span>
                <ColorPicker
                  label={row.label}
                  swatches={row.swatches}
                  value={colors[row.key]}
                  onChange={(hex) => setWallColor(row.key, hex)}
                />
              </div>
            ))}
            <Popover.Description>
              Parts follow the parts color unless you paint them individually.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
