import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import type { Board } from '@ddd-planner/core'

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

  /**
   * Resizing the wall should not lose it off the edge of the screen, but it
   * should not throw away the angle the user chose either. Keep the direction
   * they are looking from; re-fit only the centre and the distance.
   */
  useEffect(() => {
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
