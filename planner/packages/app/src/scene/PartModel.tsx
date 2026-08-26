import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer'
import type { GLTFLoader } from 'three-stdlib'
import { type Orientation, type OrientedPlacement, placementOrigin } from '@ddd-planner/core'
import { PARTS_BASE } from '../catalog/useCatalog'
import { type CatalogPart, orientedFor } from '../store'
import { modifierHeld } from '../useModifier'

/**
 * Assets are meshopt-compressed. The decoder is bundled rather than fetched,
 * because a Pages deploy should not depend on a CDN to draw a part.
 */
function extendLoader(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

function Model({ part, selected }: { part: CatalogPart; selected: boolean }) {
  const { scene } = useGLTF(`${PARTS_BASE}${part.model}`, undefined, undefined, extendLoader)

  // Each placement needs its own object, and cloning is what lets the same
  // part appear on the wall more than once.
  const object = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      const mesh = node as { isMesh?: boolean; material?: unknown }
      if (!mesh.isMesh) return
      const material = (mesh.material as { clone: () => unknown }).clone() as {
        color?: { set: (c: string) => void }
        emissive?: { set: (c: string) => void }
        flatShading?: boolean
        needsUpdate?: boolean
      }
      // The assets carry no normals — see indexer/src/gltf.ts. Flat shading
      // derives them per face in the shader, which is the look these parts
      // want anyway, and is why dropping the attribute costs nothing.
      material.flatShading = true
      material.needsUpdate = true
      if (selected) {
        material.color?.set('#f0a35e')
        material.emissive?.set('#2a1400')
      } else {
        material.color?.set('#b9bfc7')
      }
      ;(mesh as { material: unknown }).material = material
    })
    return copy
  }, [scene, selected])

  return <primitive object={object} />
}

/**
 * How to hang the asset off the origin `placementOrigin` gives.
 *
 * Assets ship with their minimum corner at the origin, so turning one moves
 * it off that corner and it has to be put back.
 *
 * Every turn here is a signed axis permutation, which makes the correction a
 * one-liner rather than a case analysis: a wall axis the rotation sends
 * negative runs from -extent to 0, and that extent is `sizeMm` for that axis
 * by definition. So the offset along an axis is either its own size or
 * nothing, and no displacement has to be named.
 *
 * It used to be a single lift along Z. That was right for -90 and silently
 * wrong for everything else: at +90 it put every shelf a part-height in front
 * of the wall, and at 180 it would have swapped a depth for a height. Neither
 * number appears here now, so neither can be the wrong one.
 *
 * Three.js applies rotation before position, so the two compose in this order
 * without further arithmetic. Exported because the invariant worth checking
 * is that this lands the asset on exactly the box the drag ghost drew, and a
 * test cannot check that against a number buried in a component.
 */
export function assetTransform(oriented: OrientedPlacement): {
  rotationX: number
  offset: [number, number, number]
} {
  const rotationX = (oriented.rotateXDeg * Math.PI) / 180

  // Quarter turns only, so rounding is exact and spares every placement the
  // 6e-17 that Math.cos(PI/2) would otherwise leak into it.
  const c = Math.round(Math.cos(rotationX))
  const s = Math.round(Math.sin(rotationX))

  // Rows of Rx: which asset axis each wall axis reads, and with what sign.
  const rows: [number, number, number][] = [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ]

  const size = [oriented.sizeMm.x, oriented.sizeMm.y, oriented.sizeMm.z]
  const offset = rows.map((row, i) => (row.some((v) => v < 0) ? (size[i] as number) : 0)) as [
    number,
    number,
    number,
  ]

  return { rotationX, offset }
}

export function PartModel({
  part,
  col,
  row,
  orientation,
  selected,
  pickable = true,
  onSelect,
}: {
  part: CatalogPart
  col: number
  row: number
  orientation: Orientation
  selected: boolean
  /**
   * False once the section has cut this part away entirely.
   *
   * Dropping the handler rather than hiding the part is what makes this
   * work: r3f only raycasts objects that carry one, so an unpickable part
   * leaves the interaction set altogether and the press falls through to
   * the wall behind it — which is what a click on nothing should do.
   */
  pickable?: boolean
  onSelect: (additive: boolean) => void
}) {
  const oriented = orientedFor(part, orientation)
  const origin = placementOrigin(oriented.rule, part.h, { col, row })
  const { rotationX, offset } = assetTransform(oriented)

  return (
    <group
      position={[origin.x, origin.y, origin.z]}
      onPointerDown={
        pickable
          ? (e) => {
              e.stopPropagation()
        // Shift and Cmd/Ctrl both add to the selection — the two conventions
        // people arrive with, and neither is worth being pedantic about.
        // Read from the same place the box-select and the camera read it,
        // rather than off this event, so the three cannot disagree.
              onSelect(modifierHeld())
            }
          : undefined
      }
    >
      <Suspense fallback={null}>
        <group rotation={[rotationX, 0, 0]} position={offset}>
          <Model part={part} selected={selected} />
        </group>
      </Suspense>
    </group>
  )
}
