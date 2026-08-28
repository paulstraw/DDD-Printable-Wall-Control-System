import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import { type Board, nearestSlot } from '@ddd-planner/core'
import { useStore } from '../store'
import { wallPointFrom } from './wallPlane'

/**
 * Where the pointer is on the wall, for whichever gesture is under way.
 *
 * Tracked on `window` against the wall plane, rather than on `DropTarget`'s
 * mesh — the same move `SectionHandle` makes, for the same reason. A mesh
 * stops sending moves the instant the pointer leaves it, and a drag leaves
 * it constantly: past the board edge, over the catalog panel, off the
 * window. That is what used to make overshooting the right edge freeze a
 * group where it stood and take the drop ghost off screen, with
 * `nearestSlot`'s clamp — written for exactly this — never getting a point
 * out of range to clamp.
 *
 * The mesh keeps the *press*, and deliberately. It is board-sized, and
 * `SectionHandle` sits just outside that silhouette precisely so a press can
 * reach it; a catcher grown wide enough to track a drag would swallow the
 * section handle whole.
 *
 * Listening the whole time rather than only while a gesture runs, and that
 * is load-bearing. Attaching on `moving` would attach it one *render* after
 * the press, and the first move of a quick drag arrives before that render —
 * so the drag would be received as a press and a release with nothing in
 * between, which is a click. The handler's first act is to ask whether
 * anything is in flight and leave if not.
 *
 * Leaving the canvas stops the tracking rather than clamping it. A part
 * dragged off the edge holds where it visibly is and commits there, and a
 * catalog part carried onto the panel loses its landing slot, which is what
 * lets releasing away from the wall abandon a drop.
 */
export function useWallPointer(board: Board) {
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()

    function onMove(event: PointerEvent) {
      // Read fresh rather than off the closure: a gesture can end between
      // two moves, and acting on one that has just finished is how a
      // released drag places a second part.
      const state = useStore.getState()
      if (state.moving === null && state.dragging === null && state.marquee === null) return

      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom

      if (!inside) {
        if (state.dragging !== null) state.setHoverSlot(null)
        return
      }

      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const point = wallPointFrom(raycaster.ray)
      if (point === null) return

      if (state.moving !== null) {
        state.updateMove(point)
      } else if (state.dragging !== null) {
        const slot = nearestSlot(board, point.x, point.z)
        state.setHoverSlot(slot === null ? null : { col: slot.col, row: slot.row })
      } else if (state.marquee !== null) {
        state.updateMarquee(point)
      }
    }

    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [board, camera, gl])
}
