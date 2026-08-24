import { useEffect } from 'react'
import {
  type Assembly,
  type Board,
  absoluteParts,
  clampGroupDelta,
  nearestSlot,
  placementOrigin,
  rectFromCorners,
  slotColumnCount,
  slotRowCount,
} from '@ddd-planner/core'
import { type CatalogFile, partById, useStore } from '../store'
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
  const dragging = useStore((s) => s.dragging)
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
        if (dragging) {
          // A touch screen has no hover, so the press itself is what picks
          // the slot: tap a part, tap the wall, done.
          const slot = nearestSlot(board, e.point.x, e.point.z)
          if (slot) {
            setHoverSlot({ col: slot.col, row: slot.row })
            dropDrag()
          }
          return
        }
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

/**
 * Translucent boxes showing where the drag would land.
 *
 * An assembly gets one box per part rather than a single bounding box: what
 * a user needs to see before releasing is which slots fill up, and an
 * outline around the whole group hides the gaps inside it.
 */
export function DragGhost() {
  const catalog = useStore((s) => s.catalog)
  const dragging = useStore((s) => s.dragging)
  const hoverSlot = useStore((s) => s.hoverSlot)
  const assemblies = useStore((s) => s.assemblies)
  const board = useStore((s) => s.board)

  if (!dragging || !hoverSlot) return null

  const landing =
    dragging.kind === 'part'
      ? [{ partId: dragging.partId, ...hoverSlot }]
      : ghostLanding(assemblies, catalog, board, dragging.assemblyId, hoverSlot)

  return (
    <group>
      {landing.map((slot, i) => {
        const part = partById(catalog, slot.partId)
        if (!part) return null
        const origin = placementOrigin(part.placement, part.h, slot)
        const { x, y, z } = part.sizeMm
        return (
          <mesh key={i} position={[origin.x + x / 2, origin.y + y / 2, origin.z + z / 2]}>
            <boxGeometry args={[x, y, z]} />
            <meshStandardMaterial color="#f0a35e" transparent opacity={0.45} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * The ghost has to apply the same edge correction the drop will, or the
 * preview would promise a position the drop then quietly moves.
 */
function ghostLanding(
  assemblies: readonly Assembly[],
  catalog: CatalogFile | null,
  board: Board,
  assemblyId: string,
  anchor: { col: number; row: number },
) {
  const assembly = assemblies.find((a) => a.id === assemblyId)
  if (!assembly) return []

  const landed = absoluteParts(assembly, anchor)
  const move = clampGroupDelta(
    landed.map((p) => ({
      col: p.col,
      row: p.row,
      spanCols: partById(catalog, p.partId)?.placement.occupiesColumns ?? 1,
    })),
    { dCol: 0, dRow: 0 },
    { cols: slotColumnCount(board), rows: slotRowCount(board) },
  )
  return landed.map((p) => ({ ...p, col: p.col + move.dCol, row: p.row + move.dRow }))
}
