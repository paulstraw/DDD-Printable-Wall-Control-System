import { partById, useStore } from '../store'
import { PartModel } from './PartModel'

export function PlacedParts() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const selectedId = useStore((s) => s.selectedId)
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
            selected={placement.id === selectedId}
            onSelect={() => select(placement.id)}
          />
        )
      })}
    </group>
  )
}
