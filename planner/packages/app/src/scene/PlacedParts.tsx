import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { placementOrigin, resolveColor } from '@ddd-planner/core'
import { orientedFor, partById, useStore } from '../store'
import { PartModel } from './PartModel'
import { hiddenBySection, sectionPlane } from './section'

export function PlacedParts() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const pressPart = useStore((s) => s.pressPart)
  const dragging = useStore((s) => s.dragging)
  const moving = useStore((s) => s.moving)
  // The wall's default, which every unpainted part inherits. Read once here
  // rather than in each part, so changing it repaints the wall in one pass.
  const defaultColor = useStore((s) => s.colors.parts)
  const section = useStore((s) => s.section)

  /**
   * three.js raycasting ignores clipping planes, so a cut-away part stays
   * clickable unless it is taken out of hit-testing by hand — you would
   * select something you cannot see. Only parts lying *wholly* on the
   * discarded side drop out; a straddling part still has material on screen.
   */
  const plane = section.on
    ? sectionPlane(section.axis, section.depth, section.flipped)
    : null

  const setHovering = useCursor(moving !== null, placements.length)

  /**
   * Stood down by hand on the press, not by prop — the same thing
   * `SectionHandle` has to do, for the same reason and with the same
   * comment on it. OrbitControls claims the pointerdown before React hears
   * about it, so a part dragged to another slot arrived there with the
   * camera having swung the whole way as well, and the delta was measured
   * against a view that was moving under it. Its move handler re-checks
   * `enabled` on every event, so clearing the flag inside the press kills
   * the orbit it just began; `handsOnWall` then holds it down through
   * `Scene` for the rest of the gesture and puts it back on release, which
   * is why nothing here ever sets it true.
   */
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null

  return (
    <group>
      {placements.map((placement) => {
        const part = partById(catalog, placement.partId)
        if (!part) return null
        return (
          <PartModel
            key={placement.id}
            part={part}
            col={placement.col}
            row={placement.row}
            orientation={placement.orientation}
            // Resolved here and nowhere else: `resolveColor` is the single
            // place that decides what an unpainted part is, and the BOM asks
            // it the same question.
            color={resolveColor(placement, defaultColor)}
            selected={selectedIds.includes(placement.id)}
            pickable={
              dragging === null &&
              (plane === null || !hiddenBySection(drawnBox(part, placement), plane))
            }
            onPress={(additive, point) => {
              if (controls !== null) controls.enabled = false
              pressPart(placement.id, additive, point)
            }}
            onHover={setHovering}
          />
        )
      })}
    </group>
  )
}

/** The box a placement actually occupies, the one the drag ghost draws. */
function drawnBox(
  part: NonNullable<ReturnType<typeof partById>>,
  placement: { col: number; row: number; orientation: Parameters<typeof orientedFor>[1] },
) {
  const oriented = orientedFor(part, placement.orientation)
  const origin = placementOrigin(oriented.rule, part.h, placement)
  const { x, y, z } = oriented.sizeMm
  return {
    min: origin,
    max: { x: origin.x + x, y: origin.y + y, z: origin.z + z },
  }
}

/**
 * `grab` over a part you can pick up, `grabbing` while you are.
 *
 * The same two words `.part` and `.assembly` already use in `index.css` for
 * the catalog cards and the saved assemblies — placed parts were the one
 * draggable thing on screen saying nothing at all, and dragging one is a
 * gesture nobody is going to be told about anywhere else.
 *
 * Set on the canvas rather than through a class, because the thing the
 * pointer is over is a mesh and React never hears about it. `count` is in
 * the dependencies for the one case r3f cannot report: a part deleted from
 * under the cursor unmounts without ever sending `pointerout`, and the grab
 * hand would sit there over bare board until you found another part.
 */
function useCursor(moving: boolean, count: number): (hovering: boolean) => void {
  const canvas = useThree((s) => s.gl.domElement)
  const [hovering, setHovering] = useState(false)

  useEffect(() => setHovering(false), [count])

  useEffect(() => {
    canvas.style.cursor = moving ? 'grabbing' : hovering ? 'grab' : ''
    return () => {
      canvas.style.cursor = ''
    }
  }, [canvas, moving, hovering])

  return setHovering
}
