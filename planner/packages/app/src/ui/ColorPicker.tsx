import type { Swatch } from '@ddd-planner/core'
import { Button, Input, Toggle, ToggleGroup } from '../components'

/**
 * One picker, used by both places colors are chosen: the wall's three in the
 * header popover, and whatever is selected in the hint row.
 *
 * A row of swatches where exactly one is current *is* a toggle group, so it
 * is one — which buys arrow-key navigation between swatches and the pressed
 * state for free, and means the empty value already says the thing that is
 * hardest to say. A selection of parts painted three different colors has no
 * current swatch, and neither does a color typed into the free picker; both
 * are the empty array, and neither needs a special case.
 *
 * The presets are a short row on purpose. A longer one is not a better one
 * when every extra swatch is one more thing to read past, and the free picker
 * behind them means the row never has to be exhaustive.
 */
export function ColorPicker({
  label,
  swatches,
  value,
  onChange,
  onReset,
}: {
  /** Names the group for a screen reader — "Panel", "Selected parts". */
  label: string
  swatches: readonly Swatch[]
  /** The current color, or `null` when there is no single one to show. */
  value: string | null
  onChange: (hex: string) => void
  /**
   * Offered only where there is something to go back *to*: painting a
   * selection can be undone to "whatever the wall says", but the wall's own
   * colors are the bottom of that chain and have nothing beneath them.
   */
  onReset?: () => void
}) {
  return (
    <div className="color-picker">
      <ToggleGroup
        className="color-swatches"
        aria-label={label}
        value={value === null ? [] : [value]}
        onValueChange={([chosen]) => {
          // Pressing the pressed swatch asks to unpress it, which would mean
          // "no color" — not a thing a part or a wall can be. Ignored, the
          // same way the orientation toggle ignores it.
          if (chosen !== undefined) onChange(chosen)
        }}
      >
        {swatches.map((swatch) => (
          <Toggle
            key={swatch.hex}
            value={swatch.hex}
            className="swatch"
            // Inline, because the color *is* the content — and because it has
            // to beat `.toggle[data-pressed]`, which paints the pressed one
            // ink. A swatch says "current" with a ring instead.
            style={{ background: swatch.hex }}
            aria-label={swatch.name}
            title={swatch.name}
          />
        ))}
      </ToggleGroup>

      {/*
        Anything the row does not offer. `type="color"` is the one control
        here that is deliberately the browser's own: every platform already
        has a color picker people know, and a hand-rolled one would be worse
        on all of them at once.
      */}
      <label className="color-custom" title="Any other color">
        <span className="visually-hidden">{label}: any other color</span>
        <Input type="color" value={value ?? '#000000'} onValueChange={onChange} />
      </label>

      {onReset ? (
        <Button className="color-reset" onClick={onReset} title="Follow the wall’s default again">
          Default
        </Button>
      ) : null}
    </div>
  )
}
