import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer'
import type { GLTFLoader } from 'three-stdlib'
import { type Orientation, placementOrigin } from '@ddd-planner/core'
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

export function PartModel({
  part,
  col,
  row,
  orientation,
  selected,
  onSelect,
}: {
  part: CatalogPart
  col: number
  row: number
  orientation: Orientation
  selected: boolean
  onSelect: (additive: boolean) => void
}) {
  const oriented = orientedFor(part, orientation)
  const origin = placementOrigin(oriented.rule, part.h, { col, row })

  // Assets ship rotated for their default orientation with the minimum corner
  // at the origin, so turning one moves it off that corner and it has to be
  // put back. A -90° turn about X sends the part's depth below the floor,
  // hence the lift by exactly that depth. Three.js applies rotation before
  // position, so the two compose in this order without further arithmetic.
  const rad = (oriented.rotateXDeg * Math.PI) / 180
  const lift = oriented.rotateXDeg === 0 ? 0 : oriented.sizeMm.y

  return (
    <group
      position={[origin.x, origin.y, origin.z]}
      onPointerDown={(e) => {
        e.stopPropagation()
        // Shift and Cmd/Ctrl both add to the selection — the two conventions
        // people arrive with, and neither is worth being pedantic about.
        // Read from the same place the box-select and the camera read it,
        // rather than off this event, so the three cannot disagree.
        onSelect(modifierHeld())
      }}
    >
      <Suspense fallback={null}>
        <group rotation={[rad, 0, 0]} position={[0, 0, lift]}>
          <Model part={part} selected={selected} />
        </group>
      </Suspense>
    </group>
  )
}
