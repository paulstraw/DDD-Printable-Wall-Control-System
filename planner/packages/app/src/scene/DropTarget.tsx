import { useEffect } from 'react'
import { type Board, nearestSlot, placementOrigin } from '@ddd-planner/core'
import { partById, useStore } from '../store'

/**
 * The wall plane a drag lands on.
 *
 * Dragging raycasts to this plane and quantises to the nearest slot — no
 * gizmos, and no need to hit a slot exactly. The plane is invisible and sits
 * a hair in front of the board so it catches the pointer first.
 */
export function DropTarget({ board }: { board: Board }) {
  const dragging = useStore((s) => s.draggingPartId)
  const setHoverSlot = useStore((s) => s.setHoverSlot)
  const dropDrag = useStore((s) => s.dropDrag)
  const select = useStore((s) => s.select)

  // A drag can end anywhere — over the canvas, over the catalog, off-window.
  useEffect(() => {
    if (!dragging) return
    const onUp = () => dropDrag()
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [dragging, dropDrag])

  return (
    <mesh
      position={[board.widthMm / 2, -0.2, board.heightMm / 2]}
      rotation={[Math.PI / 2, 0, 0]}
      onPointerMove={(e) => {
        if (!dragging) return
        const slot = nearestSlot(board, e.point.x, e.point.z)
        setHoverSlot(slot ? { col: slot.col, row: slot.row } : null)
      }}
      onPointerOut={() => dragging && setHoverSlot(null)}
      onPointerDown={() => select(null)}
    >
      <planeGeometry args={[board.widthMm, board.heightMm]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

/** A translucent box showing where the dragged part would land. */
export function DragGhost() {
  const catalog = useStore((s) => s.catalog)
  const dragging = useStore((s) => s.draggingPartId)
  const hoverSlot = useStore((s) => s.hoverSlot)

  const part = partById(catalog, dragging)
  if (!part || !hoverSlot) return null

  const origin = placementOrigin(part.placement, part.h, hoverSlot)
  const { x, y, z } = part.sizeMm

  return (
    <mesh position={[origin.x + x / 2, origin.y + y / 2, origin.z + z / 2]}>
      <boxGeometry args={[x, y, z]} />
      <meshStandardMaterial color="#f0a35e" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  )
}
