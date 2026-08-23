interface Props {
  widthIn: number
  heightIn: number
  onChange: (next: { widthIn: number; heightIn: number }) => void
}

/** Wall Control panels come in whole inches, so the input steps in inches. */
const LIMITS = { min: 4, max: 240 }

function clamp(value: number): number {
  if (!Number.isFinite(value)) return LIMITS.min
  return Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(value)))
}

export function WallSizeControls({ widthIn, heightIn, onChange }: Props) {
  return (
    <div className="wall-size">
      <label>
        <span>Width</span>
        <input
          type="number"
          value={widthIn}
          min={LIMITS.min}
          max={LIMITS.max}
          onChange={(e) => onChange({ widthIn: clamp(e.target.valueAsNumber), heightIn })}
        />
        <span className="unit">in</span>
      </label>
      <span className="times">×</span>
      <label>
        <span>Height</span>
        <input
          type="number"
          value={heightIn}
          min={LIMITS.min}
          max={LIMITS.max}
          onChange={(e) => onChange({ widthIn, heightIn: clamp(e.target.valueAsNumber) })}
        />
        <span className="unit">in</span>
      </label>
    </div>
  )
}
