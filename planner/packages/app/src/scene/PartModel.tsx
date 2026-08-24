import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer'
import type { GLTFLoader } from 'three-stdlib'
import { placementOrigin } from '@ddd-planner/core'
import { PARTS_BASE } from '../catalog/useCatalog'
import type { CatalogPart } from '../store'
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
  selected,
  onSelect,
}: {
  part: CatalogPart
  col: number
  row: number
  selected: boolean
  onSelect: (additive: boolean) => void
}) {
  const origin = placementOrigin(part.placement, part.h, { col, row })

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
        <Model part={part} selected={selected} />
      </Suspense>
    </group>
  )
}
