import { slotColumnCount, slotRowCount } from '@ddd-planner/core'
import { Popover } from '../components'
import { useStore } from '../store'
import { WallSizeControls } from './WallSizeControls'

/**
 * The wall's size, behind a trigger that is the size.
 *
 * Two labelled number fields, a `×` and two `in` units took about two hundred
 * pixels of a bar that had run out of them, to hold a pair of numbers set
 * once at the start and then left alone. A popover is the obvious answer and
 * the obvious cost is that the numbers stop being readable — so the trigger
 * *is* the numbers. It reads `48 × 96 in`, which is the same thing the two
 * fields were saying, in a third of the room, and opens onto the fields
 * themselves with the scrub handles intact.
 *
 * The slot count comes along because it is a consequence of the size and
 * belongs next to the thing that decides it — and because `12 × 24 slots`
 * standing next to `48 × 96 in` was two `A × B` phrases in a row, which is
 * one more than any header should ask anyone to disentangle.
 */
export function WallSize() {
  const board = useStore((s) => s.board)
  const widthIn = useStore((s) => s.widthIn)
  const heightIn = useStore((s) => s.heightIn)
  const setWallSize = useStore((s) => s.setWallSize)
  const placed = useStore((s) => s.placements.length)

  return (
    <Popover.Root>
      {/*
        The numbers alone are not a label — "48 × 96 in" could be anything —
        so the word is there for a screen reader and in the tooltip, and only
        the sighted reading leans on position to supply it.
      */}
      <Popover.Trigger className="wall-size-trigger" title="Wall size">
        <span className="visually-hidden">Wall size: </span>
        {widthIn} × {heightIn} in
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="wall-size-popup">
            <Popover.Title>Wall size</Popover.Title>
            <WallSizeControls
              widthIn={widthIn}
              heightIn={heightIn}
              onChange={setWallSize}
            />
            <Popover.Description>
              {slotColumnCount(board)} × {slotRowCount(board)} slots · {placed} placed
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
