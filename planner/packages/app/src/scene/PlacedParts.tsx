import { partById, useStore } from '../store'
import { PartModel } from './PartModel'

export function PlacedParts() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedIds = useStore((s) => s.selectedIds)
  const select = useStore((s) => s.select)

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
            selected={selectedIds.includes(placement.id)}
            onSelect={(additive) =>
              select(placement.id, additive ? 'toggle' : 'replace')
            }
          />
        )
      })}
    </group>
  )
}
