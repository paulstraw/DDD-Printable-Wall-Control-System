import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane } from 'three'
import { useStore } from '../store'
import { sectionPlane } from './section'

/**
 * Shared and never mutated: what `gl.clippingPlanes` holds with no section.
 *
 * three keeps clipping alive for one further frame after the last plane goes,
 * precisely so it can reset itself, so handing back an empty array is all
 * turning the overlay off takes.
 */
const NOTHING_CLIPPED: Plane[] = []

/**
 * Puts the section on the renderer.
 *
 * One *global* plane rather than per-material ones: it clips the parts, the
 * board, the drag ghost and the marquee alike, without touching a single
 * material and without `localClippingEnabled`. Anything drawn later is cut
 * too, for free — which is the point of an instrument you are going to trust.
 *
 * Renders nothing. It is a rig, like `CameraRig`.
 */
export function SectionClip() {
  const gl = useThree((s) => s.gl)
  const on = useStore((s) => s.section.on)
  const axis = useStore((s) => s.section.axis)
  const depth = useStore((s) => s.section.depth)
  const flipped = useStore((s) => s.section.flipped)

  // One plane, mutated in place, in one array whose identity never changes.
  // A drag re-runs this on every pointer move, and the renderer re-reads the
  // plane each frame anyway, so allocating a fresh one per millimetre would
  // buy nothing but garbage.
  const planes = useRef<[Plane]>([new Plane()])

  useEffect(() => {
    if (!on) {
      gl.clippingPlanes = NOTHING_CLIPPED
      return
    }

    const cut = sectionPlane(axis, depth, flipped)
    planes.current[0].normal.set(cut.normal[0], cut.normal[1], cut.normal[2])
    planes.current[0].constant = cut.constant
    gl.clippingPlanes = planes.current

    // Leaving a plane behind on teardown would cut a renderer that no longer
    // has an overlay to explain why half the wall is missing.
    return () => {
      gl.clippingPlanes = NOTHING_CLIPPED
    }
  }, [gl, on, axis, depth, flipped])

  return null
}
