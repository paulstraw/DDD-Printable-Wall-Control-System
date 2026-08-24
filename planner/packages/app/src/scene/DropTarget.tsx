import { useEffect } from 'react'
import { type Board, nearestSlot, placementOrigin, rectFromCorners } from '@ddd-planner/core'
import { partById, useStore } from '../store'
import { useModifier } from '../useModifier'

/**
 * The wall plane a drag lands on.
 *
 * Dragging raycasts to this plane and quantises to the nearest slot — no
 * gizmos, and no need to hit a slot exactly. The plane is invisible and sits
 * a hair in front of the board so it catches the pointer first.
 *
 * It does double duty as the marquee surface. A modifier-held drag across
 * bare wall box-selects; a plain drag is left to the camera; a press that
 * never moves clears the selection.
 */
export function DropTarget({ board }: { board: Board }) {
  const dragging = useStore((s) => s.draggingPartId)
  const setHoverSlot = useStore((s) => s.setHoverSlot)
  const dropDrag = useStore((s) => s.dropDrag)
  const marquee = useStore((s) => s.marquee)
  const beginMarquee = useStore((s) => s.beginMarquee)
  const updateMarquee = useStore((s) => s.updateMarquee)
  const endMarquee = useStore((s) => s.endMarquee)

  // The same modifier state the camera stands down for — deliberately the
  // same source. Reading `shiftKey` off the pointer event here instead would
  // let the two disagree, and the way that fails is silent: the camera
  // freezes for a box-select that never happens.
  const selecting = useModifier()

  // A drag can end anywhere — over the canvas, over the catalog, off-window.
  useEffect(() => {
    if (!dragging) return
    const onUp = () => dropDrag()
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [dragging, dropDrag])

  // Same for a marquee: releasing outside the wall must still commit it,
  // otherwise the band is left hanging on screen.
  useEffect(() => {
    if (!marquee) return
    const onUp = () => endMarquee()
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [marquee, endMarquee])

  return (
    <mesh
      position={[board.widthMm / 2, -0.2, board.heightMm / 2]}
      rotation={[Math.PI / 2, 0, 0]}
      onPointerMove={(e) => {
        if (dragging) {
          const slot = nearestSlot(board, e.point.x, e.point.z)
          setHoverSlot(slot ? { col: slot.col, row: slot.row } : null)
        } else if (marquee) {
          updateMarquee({ x: e.point.x, z: e.point.z })
        }
      }}
      onPointerOut={() => dragging && setHoverSlot(null)}
      onPointerDown={(e) => {
        if (dragging) return
        beginMarquee({ x: e.point.x, z: e.point.z }, selecting)
      }}
    >
      <planeGeometry args={[board.widthMm, board.heightMm]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

/**
 * The rubber band itself, drawn flat on the wall.
 *
 * It sits a fraction in front of the drop plane and behind the parts, so it
 * reads as lying on the board rather than cutting through what it selects.
 * Only a selecting drag draws one — showing a band while the user orbits
 * would promise a selection that is not going to happen.
 */
export function Marquee() {
  const marquee = useStore((s) => s.marquee)
  if (!marquee?.selecting) return null

  const rect = rectFromCorners(marquee.from, marquee.to)
  const width = rect.maxX - rect.minX
  const height = rect.maxZ - rect.minZ
  if (width < 0.01 || height < 0.01) return null

  return (
    <mesh
      position={[rect.minX + width / 2, -0.6, rect.minZ + height / 2]}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#f0a35e" transparent opacity={0.25} depthWrite={false} />
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
