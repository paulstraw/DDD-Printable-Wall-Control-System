import { useId } from 'react'
import { NumberField } from '../components'

interface Props {
  widthIn: number
  heightIn: number
  onChange: (next: { widthIn: number; heightIn: number }) => void
}

/** Wall Control panels come in whole inches, so the input steps in inches. */
const LIMITS = { min: 4, max: 240 }

/**
 * Whole inches, and no thousands separator. A wall is at most 240 in, so the
 * separator would never appear on a legal value — but it would appear while
 * someone was typing past one, and a comma landing in the middle of a number
 * you are still typing is alarming.
 */
const FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 0, useGrouping: false }

function clamp(value: number | null): number {
  // `null` is the field standing empty, which happens in the middle of
  // retyping a size and is not a wall anyone asked for.
  if (value === null || !Number.isFinite(value)) return LIMITS.min
  return Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(value)))
}

/**
 * The one number in the app.
 *
 * `<input type="number">` served it badly in a way worth writing down, because
 * the fix is the reason for the change. The old control clamped on every
 * keystroke into a value it also controlled, so typing "12" into a field with
 * a minimum of 4 gave you 42: the 1 was clamped up to 4 before the 2 arrived.
 * A number field keeps the text you are typing separate from the number it
 * reports, so the digits stay in the order you typed them.
 *
 * The label is a scrub area — drag the word "Width" sideways and the number
 * follows. That suits "how wide is this wall, roughly" better than typing
 * does, and it is the one thing here that works without a keyboard.
 *
 * Still no history entry, as before: `setWallSize` does not record one, and a
 * scrub that crossed thirty inches would otherwise cost thirty undos.
 */
export function WallSizeControls({ widthIn, heightIn, onChange }: Props) {
  const width = useId()
  const height = useId()

  return (
    <div className="wall-size">
      <NumberField.Root
        id={width}
        value={widthIn}
        min={LIMITS.min}
        max={LIMITS.max}
        step={1}
        smallStep={1}
        largeStep={12}
        format={FORMAT}
        onValueChange={(value) => onChange({ widthIn: clamp(value), heightIn })}
      >
        <NumberField.ScrubArea>
          <label htmlFor={width}>Width</label>
          <NumberField.ScrubAreaCursor>
            <ScrubCursor />
          </NumberField.ScrubAreaCursor>
        </NumberField.ScrubArea>
        <NumberField.Input />
        <span className="unit">in</span>
      </NumberField.Root>

      <span className="times">×</span>

      <NumberField.Root
        id={height}
        value={heightIn}
        min={LIMITS.min}
        max={LIMITS.max}
        step={1}
        smallStep={1}
        largeStep={12}
        format={FORMAT}
        onValueChange={(value) => onChange({ widthIn, heightIn: clamp(value) })}
      >
        <NumberField.ScrubArea>
          <label htmlFor={height}>Height</label>
          <NumberField.ScrubAreaCursor>
            <ScrubCursor />
          </NumberField.ScrubAreaCursor>
        </NumberField.ScrubArea>
        <NumberField.Input />
        <span className="unit">in</span>
      </NumberField.Root>
    </div>
  )
}

/**
 * The cursor drawn while scrubbing. The pointer is locked for the duration, so
 * the real one is gone and this stands in for it — without it a drag looks
 * like the pointer vanished.
 */
function ScrubCursor() {
  return (
    <svg width="26" height="14" viewBox="0 0 24 14" fill="black" stroke="white" aria-hidden>
      <path d="M19.5 5.5L6.49737 5.51844V2L1 6.9999L6.5 12L6.49737 8.5L19.5 8.5V12L25 6.9999L19.5 2V5.5Z" />
    </svg>
  )
}
