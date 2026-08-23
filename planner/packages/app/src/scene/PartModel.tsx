import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer'
import type { GLTFLoader } from 'three-stdlib'
import { placementOrigin } from '@ddd-planner/core'
import { PARTS_BASE } from '../catalog/useCatalog'
import type { CatalogPart } from '../store'

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
      }
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
  onSelect: () => void
}) {
  const origin = placementOrigin(part.placement, part.h, { col, row })

  return (
    <group
      position={[origin.x, origin.y, origin.z]}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <Suspense fallback={null}>
        <Model part={part} selected={selected} />
      </Suspense>
    </group>
  )
}
