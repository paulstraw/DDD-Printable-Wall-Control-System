import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { Axis, Board } from '@ddd-planner/core'
import { useStore } from '../store'
import { FINE_DRAG_SCALE, depthFromDrag } from './section'

/**
 * How far outside the board the handle sits.
 *
 * `DropTarget` puts an invisible board-sized plane at `y = -0.2` to catch
 * every bare pointerdown, and r3f hit-tests nearest-first — so a handle
 * behind that plane, which a Y section at 0 is, would never see the press.
 * The catcher is exactly board-sized, so clearing the silhouette is enough:
 * no cross-component coordination, and the handle never steals a click from
 * a part.
 */
const MARGIN_MM = 28

/** A tile big enough to grab, thin along the axis it cuts. */
const FACE_MM = 26
const THICK_MM = 4

/**
 * Keeps the handle off its own plane.
 *
 * The section is global: it clips the handle exactly as readily as the wall.
 * Sitting centred on the cut, half the grab target would vanish and its face
 * would lie coplanar with the plane, which shimmers. Offsetting onto the kept
 * side leaves it whole, just behind the cut it marks.
 */
const CLEARANCE_MM = 1

/** Where the handle sits, and how big it is, for a section on `axis`. */
function handleGeometry(
  axis: Axis,
  board: Board,
  depth: number,
  flipped: boolean,
): { position: [number, number, number]; size: [number, number, number] } {
  const along = depth + (flipped ? -1 : 1) * (THICK_MM / 2 + CLEARANCE_MM)

  switch (axis) {
    case 'y':
      // A depth marker standing beside the wall at mid height. It slides
      // towards the viewer, which is the axis the 3D view reads worst and
      // the reason any of this exists.
      return {
        position: [-MARGIN_MM, along, board.heightMm / 2],
        size: [FACE_MM, THICK_MM, FACE_MM],
      }
    case 'x':
      // A tick running along the bottom edge.
      return { position: [along, 0, -MARGIN_MM], size: [THICK_MM, FACE_MM, FACE_MM] }
    case 'z':
      // A tick running up the left edge.
      return { position: [-MARGIN_MM, 0, along], size: [FACE_MM, FACE_MM, THICK_MM] }
  }
}

/** Just enough of OrbitControls to stand it down mid-gesture. */
interface ControlsLike {
  enabled: boolean
}

/**
 * The thing you grab to move the cut.
 *
 * Dragging is tracked on `window` rather than on the mesh: the pointer
 * leaves a 26 mm tile almost immediately, and r3f stops sending moves the
 * moment it does. Release is on `window` for the same reason `DropTarget`
 * does it — a drag can end over the catalog, or off-window entirely, and a
 * handle still stuck to the pointer is worse than one that never moved.
 */
export function SectionHandle({ board }: { board: Board }) {
  const camera = useThree((s) => s.camera)
  /**
   * Stood down by hand on pointerdown, not by prop.
   *
   * OrbitControls claims the press before React hears about it, so by the
   * time `section.dragging` has disabled it through `Scene`, it has already
   * started orbiting — measured at 250 mm of camera travel through a single
   * handle drag. Its move handler re-checks `enabled` on every event though,
   * so clearing the flag inside the press kills the gesture it just began.
   * The prop then holds it down for the rest of the drag and restores it on
   * release, which is why nothing here ever sets it back to true.
   */
  const controls = useThree((s) => s.controls) as ControlsLike | null
  const on = useStore((s) => s.section.on)
  const axis = useStore((s) => s.section.axis)
  const depth = useStore((s) => s.section.depth)
  const flipped = useStore((s) => s.section.flipped)
  const dragging = useStore((s) => s.section.dragging)
  const setSectionDragging = useStore((s) => s.setSectionDragging)

  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      const previous = last.current
      last.current = { x: event.clientX, y: event.clientY }
      if (!previous) return

      // Shift thins the pointer rather than the rate: the drag stays one
      // rule, and `section.ts` keeps the number.
      const scale = event.shiftKey ? FINE_DRAG_SCALE : 1
      const delta = {
        x: (event.clientX - previous.x) * scale,
        y: (event.clientY - previous.y) * scale,
      }

      // Read through the store rather than the closure: a pointer move
      // arrives faster than a re-render, and a stale depth would make the
      // handle stutter backwards.
      const state = useStore.getState()
      state.setSectionDepth(depthFromDrag(state.section.axis, state.section.depth, delta, camera))
    }

    const onUp = () => {
      last.current = null
      setSectionDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, camera, setSectionDragging])

  if (!on) return null

  const { position, size } = handleGeometry(axis, board, depth, flipped)

  return (
    <mesh
      position={position}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (controls) controls.enabled = false
        last.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        setSectionDragging(true)
      }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={dragging ? '#e8873a' : '#f0a35e'}
        roughness={0.5}
        metalness={0}
      />
    </mesh>
  )
}
