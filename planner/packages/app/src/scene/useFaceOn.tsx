import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Board } from '@ddd-planner/core'
import { useStore } from '../store'

/**
 * Distance that fits the whole board in view, with a little air around it.
 *
 * The aspect ratio is clamped hard. A canvas reports 0 x 0 on its first frame,
 * and an unclamped aspect turns that into a camera parked millions of
 * millimetres away — behind the far plane, rendering an empty scene that looks
 * exactly like a broken build.
 */
export function fitDistance(board: Board, fovDegrees: number, aspect: number): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.01 ? aspect : 1
  const fov = (fovDegrees * Math.PI) / 180
  const byHeight = board.heightMm / 2 / Math.tan(fov / 2)
  const byWidth = board.widthMm / 2 / Math.tan(fov / 2) / safeAspect
  return Math.max(byHeight, byWidth) * 1.25
}

interface OrbitLike {
  target: Vector3
  update: () => void
  addEventListener: (type: 'start', listener: () => void) => void
  removeEventListener: (type: 'start', listener: () => void) => void
}

/**
 * `F` snaps the camera square to the wall.
 *
 * Orbiting is free, which is what you want for judging depth, but reading a
 * layout means looking at it straight on. The move is eased rather than
 * instant so it stays clear which way round the board went.
 */
export function useFaceOn(board: Board) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const size = useThree((s) => s.size)

  const goal = useRef<{ position: Vector3; target: Vector3 } | null>(null)
  const aspect = size.height > 0 ? size.width / size.height : 1

  /** Set once the reader has aimed the camera themselves. */
  const aimed = useRef(false)

  /**
   * Resizing the wall should not lose it off the edge of the screen, but it
   * should not throw away the angle the user chose either. Keep the direction
   * they are looking from; re-fit only the centre and the distance.
   *
   * The exception is the wall restored on arrival. That restore waits for the
   * catalog, so it lands a second or two into the session — long after the
   * page can be dragged and zoomed — and it changes the board from the 32×32
   * default to whatever was saved. Re-framing for it took the view off
   * anybody who had already started looking around, and kept doing it,
   * because the fit below writes the camera every frame until it lands.
   * `sizeFromRestore` is the store saying nobody asked for this one.
   */
  useEffect(() => {
    if (useStore.getState().sizeFromRestore && aimed.current) return

    const centre = new Vector3(board.widthMm / 2, 0, board.heightMm / 2)
    const fov = 'fov' in camera ? (camera.fov as number) : 45
    const distance = fitDistance(board, fov, aspect)

    const from = controls
      ? camera.position.clone().sub(controls.target)
      : camera.position.clone().sub(centre)
    if (from.lengthSq() < 1e-6) from.set(0, -1, 0)

    goal.current = {
      position: centre.clone().add(from.normalize().multiplyScalar(distance)),
      target: centre,
    }
    // Only when the board itself changes — not on every camera nudge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.widthMm, board.heightMm])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'f' && event.key !== 'F') return
      const el = event.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      event.preventDefault()

      const centre = new Vector3(board.widthMm / 2, 0, board.heightMm / 2)
      const fov = 'fov' in camera ? (camera.fov as number) : 45
      const distance = fitDistance(board, fov, aspect)
      goal.current = {
        // The viewer stands in front of the wall, at negative Y.
        position: new Vector3(centre.x, -distance, centre.z),
        target: centre,
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [board, camera, aspect])

  /**
   * The eased move gives up as soon as the reader takes the camera.
   *
   * The move writes `camera.position` every frame until it lands, and it
   * only lets go of the goal once the camera *arrives* — so dragging or
   * scrolling while it ran was overwritten frame by frame, and pulling away
   * from the goal meant the camera never arrived and the tug never stopped.
   * On a fresh load that is the whole first second, spent competing with
   * whoever is trying to look at the wall.
   *
   * OrbitControls announces the start of every gesture it handles, and
   * brackets a wheel tick in the same pair, so one listener covers dragging
   * and zooming both. `change` would not do: the eased move calls
   * `controls.update()` itself, so it would cancel itself on its first
   * frame.
   */
  useEffect(() => {
    if (!controls) return
    const abandon = () => {
      aimed.current = true
      goal.current = null
    }
    controls.addEventListener('start', abandon)
    return () => controls.removeEventListener('start', abandon)
  }, [controls])

  useFrame((_, delta) => {
    const to = goal.current
    if (!to) return
    const ease = 1 - Math.exp(-delta * 9)
    camera.position.lerp(to.position, ease)
    if (controls) {
      controls.target.lerp(to.target, ease)
      controls.update()
    }
    if (camera.position.distanceTo(to.position) < 0.5) {
      camera.position.copy(to.position)
      if (controls) {
        controls.target.copy(to.target)
        controls.update()
      }
      goal.current = null
    }
  })
}
