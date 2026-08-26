import type { Axis } from '@ddd-planner/core'
import { useStore } from '../store'

const AXES: Axis[] = ['x', 'y', 'z']

const LABEL: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' }

const TITLE: Record<Axis, string> = {
  x: 'Cut across the wall, sweeping left to right',
  y: 'Cut through the wall’s depth — the axis the 3D view reads worst',
  z: 'Cut up the wall, sweeping bottom to top',
}

/**
 * The section's own controls, in the corner of the picture they act on.
 *
 * In the viewport rather than the header because they are a property of what
 * is being drawn, not of the wall: they appear with the cut and go away with
 * it. Nothing here is persisted, and nothing here changes a single part.
 *
 * The readout is the reason the overlay exists. Depth is the one axis the 3D
 * view reads badly, so being able to put the plane somewhere and *read the
 * number* is what turns an argument about depth into a measurement. It is
 * shown to 2 dp and never snapped to a landmark — a reading that quietly
 * rounded itself onto the nearest interesting surface would be worthless for
 * telling you a surface is 1.5 mm from where you expected.
 */
export function SectionHud() {
  const on = useStore((s) => s.section.on)
  const axis = useStore((s) => s.section.axis)
  const depth = useStore((s) => s.section.depth)
  const flipped = useStore((s) => s.section.flipped)
  const setSectionAxis = useStore((s) => s.setSectionAxis)
  const flipSection = useStore((s) => s.flipSection)

  if (!on) return null

  return (
    <div className="section-hud">
      <span className="section-axes" role="group" aria-label="Section axis">
        {AXES.map((a) => (
          <button
            key={a}
            type="button"
            className={a === axis ? 'is-current' : undefined}
            aria-pressed={a === axis}
            title={TITLE[a]}
            onClick={() => setSectionAxis(a)}
          >
            {LABEL[a]}
          </button>
        ))}
      </span>

      <button
        type="button"
        className="ghost-button"
        aria-pressed={flipped}
        title="Keep the other half. Deliberately manual — the half kept never follows the camera, or the picture would change as you orbit."
        onClick={flipSection}
      >
        Flip
      </button>

      {/*
        `aria-live="off"`: an `output` announces itself by default, and a drag
        would read out a new number every pointer move.
      */}
      <output className="section-readout" aria-live="off">
        {depth.toFixed(2)} mm
      </output>
    </div>
  )
}
