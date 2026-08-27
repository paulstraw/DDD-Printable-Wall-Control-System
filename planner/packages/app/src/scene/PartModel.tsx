import { Suspense, useMemo } from 'react'
import { Outlines, useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer'
import { Quaternion, Vector3 } from 'three'
import type { BufferGeometry, Mesh, Object3D } from 'three'
import type { GLTFLoader } from 'three-stdlib'
import { type Orientation, type OrientedPlacement, placementOrigin } from '@ddd-planner/core'
import { PARTS_BASE } from '../catalog/useCatalog'
import { type CatalogPart, orientedFor } from '../store'
import { modifierHeld } from '../useModifier'

/**
 * The selection outline: a thick dark ring with a thinner accent one drawn
 * over its inner edge.
 *
 * Two tones because one is never enough. A single dark ring vanishes against
 * a dark background; a single orange one vanishes against an orange part.
 * With both, whichever the wall is wearing, one of the two still reads — and
 * orange stays the app's single word for "active", the same word the drag
 * ghost, the marquee and the section handle already use.
 *
 * `thickness` is in pixels here: with `screenspace` left off, drei's shader
 * offsets the silhouette in clip space divided by the viewport, so the ring
 * is the same width however far away the part is. A selection marker that
 * grew as you zoomed in would be a decoration; this is a readout.
 *
 * The dark one is drawn first so that where they overlap the accent wins —
 * both shells sit at the same depth, and at equal depth the later draw takes
 * it. That leaves the dark showing only in the outer band the accent does not
 * reach, which is the whole trick.
 */
const OUTLINE = {
  dark: { color: '#151920', thickness: 5, renderOrder: 1 },
  accent: { color: '#f0a35e', thickness: 2, renderOrder: 2 },
} as const

interface Asset {
  readonly geometry: BufferGeometry
  readonly position: [number, number, number]
  readonly quaternion: [number, number, number, number]
  readonly scale: [number, number, number]
}

/**
 * The one mesh in a part asset, and the transform that puts it where it
 * belongs.
 *
 * The indexer writes exactly one node holding one mesh with one primitive
 * (`indexer/src/gltf.ts`), so there is nothing to choose between — but this
 * asks rather than assuming, because a silently wrong part is a blank space
 * on the wall.
 *
 * **The transform is not optional.** The assets are quantized, and
 * quantization is not a change to the numbers alone: it rescales the
 * positions into integers and leaves a node transform behind to undo it. Take
 * the geometry without that transform and every part on the wall collapses
 * into a speck at the origin — which is exactly what happened when this first
 * stopped cloning the asset's node and started reading its geometry.
 */
function readAsset(scene: Object3D): Asset | null {
  let mesh: Mesh | null = null
  scene.traverse((node) => {
    if (mesh === null && (node as Mesh).isMesh) mesh = node as Mesh
  })
  if (mesh === null) return null
  const found: Mesh = mesh

  // Composed from the root rather than read off the node, so a loader that
  // wraps the scene in another transform cannot silently move every part.
  scene.updateWorldMatrix(false, true)
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  found.matrixWorld.decompose(position, quaternion, scale)

  return {
    geometry: withNormals(found.geometry),
    position: position.toArray(),
    quaternion: quaternion.toArray() as [number, number, number, number],
    scale: scale.toArray(),
  }
}

/**
 * Give a part's geometry normals, once.
 *
 * The assets deliberately ship without them — see `indexer/src/gltf.ts`, where
 * dropping the attribute makes the files 3.5× smaller and costs nothing
 * visually, because the material flat-shades and derives its own. The outline
 * shader is the one thing that cannot: it pushes each vertex along its normal
 * to make the silhouette, and with no normals it pushes nothing at all.
 *
 * Computing them on the welded, indexed geometry averages across shared
 * vertices, which is a smooth shell and exactly what an outline wants — the
 * same thing drei's own default `angle` produces, minus the de-indexing.
 * Doing it in place is what makes it cheap: `useGLTF` caches by URL, so this
 * geometry is shared by every placement of that part and the work happens
 * once per part *type*, not once per part and certainly not once per click.
 * On a 188k-triangle spacer that is the difference between a selection that
 * lands and one that hitches.
 */
function withNormals(geometry: BufferGeometry): BufferGeometry {
  if (geometry.attributes.normal === undefined) geometry.computeVertexNormals()
  return geometry
}

/**
 * Assets are meshopt-compressed. The decoder is bundled rather than fetched,
 * because a Pages deploy should not depend on a CDN to draw a part.
 */
function extendLoader(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

/**
 * Selection no longer repaints the part, and that is the point.
 *
 * It used to paint the whole model orange, which broke twice over once parts
 * carry colors of their own: you could not see the color you had just applied
 * while the parts were still selected, and a part actually printed in orange
 * looked permanently selected. An outline says the same thing without
 * spending the part's own surface to say it.
 */
function Model({ part, color, selected }: { part: CatalogPart; color: string; selected: boolean }) {
  const { scene } = useGLTF(`${PARTS_BASE}${part.model}`, undefined, undefined, extendLoader)

  // The geometry is shared across every placement of this part rather than
  // cloned per placement, which is both cheaper and what lets the normals
  // above be computed once. Only the material is per-placement, because only
  // the color differs.
  const asset = useMemo(() => readAsset(scene), [scene])
  if (asset === null) return null

  return (
    <mesh
      geometry={asset.geometry}
      position={asset.position}
      quaternion={asset.quaternion}
      scale={asset.scale}
    >
      {/*
        Flat shading derives face normals in the shader and ignores the vertex
        normals added above, so the part looks exactly as it always has.
        `roughness` and `metalness` match what the indexer writes into the
        asset's own material, which this replaces.
      */}
      <meshStandardMaterial color={color} flatShading roughness={0.85} metalness={0} />
      {selected ? (
        <>
          <Outlines angle={0} {...OUTLINE.dark} />
          <Outlines angle={0} {...OUTLINE.accent} />
        </>
      ) : null}
    </mesh>
  )
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
  color,
  selected,
  pickable = true,
  onSelect,
}: {
  part: CatalogPart
  col: number
  row: number
  orientation: Orientation
  /** Already resolved against the wall default — see `resolveColor` in core. */
  color: string
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
          <Model part={part} color={color} selected={selected} />
        </group>
      </Suspense>
    </group>
  )
}
