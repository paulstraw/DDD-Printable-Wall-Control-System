import { placementOrigin, resolveColor } from '@ddd-planner/core'
import { orientedFor, partById, useStore } from '../store'
import { PartModel } from './PartModel'
import { hiddenBySection, sectionPlane } from './section'

export function PlacedParts() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const select = useStore((s) => s.select)
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
            pickable={plane === null || !hiddenBySection(drawnBox(part, placement), plane)}
            onSelect={(additive) =>
              select(placement.id, additive ? 'toggle' : 'replace')
            }
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
