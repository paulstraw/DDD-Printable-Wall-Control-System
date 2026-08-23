/**
 * Mesh to compressed glTF.
 *
 * STL has no shared vertices — every triangle carries its own three — so the
 * first real win is welding.
 *
 * These assets carry **no normals**, and that is the single most important
 * decision in this file. Baking per-face normals keeps hard edges crisp
 * without any help from the renderer, but it splits every vertex three ways:
 * a 188k-triangle spacer needs 549,712 vertices with them and 94,076 without.
 * Worse, the split reads as a seam at every edge, so the simplifier cannot
 * collapse anything at all — measured, it removed exactly zero triangles.
 *
 * Dropping normals costs nothing visually, because the app flat-shades these
 * materials and derives the same hard edges in the shader. It buys a 3.5x
 * smaller file for identical geometry, and it makes simplification work.
 *
 * So: weld, simplify anything heavy, quantize, EXT_meshopt_compression.
 */

import { Document, Logger, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { quantize, simplify, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

/**
 * Below this, a mesh is already small enough that simplifying it saves
 * nothing worth the risk of moving a face. Roughly 90% of the library is
 * under it — the cost is concentrated in a few dozen over-tessellated parts.
 */
export const SIMPLIFY_ABOVE_TRIANGLES = 20_000

/**
 * Error budget, as a fraction of the mesh's own size. These are mechanical
 * parts, so the bar is that a hole stays a hole and an edge stays where it
 * was; 0.1% of extent is well inside print tolerance and invisible at the
 * scale a planner draws them. The STL a user downloads is untouched either
 * way — this only affects the preview.
 */
export const SIMPLIFY_ERROR = 0.001

/**
 * Keep a quarter of the triangles. Deliberately conservative: the saving is
 * already an order of magnitude at this ratio, and a preview that quietly
 * turns a hole into a hexagon would be worse than a larger file. The STL a
 * user downloads is the original either way.
 */
export const SIMPLIFY_RATIO = 0.25

let io: NodeIO | null = null

async function writer(): Promise<NodeIO> {
  if (io) return io
  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready
  io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  return io
}

export interface GlbResult {
  readonly bytes: Uint8Array
  readonly vertexCount: number
  /** Triangles in the source STL. */
  readonly triangleCount: number
  /** Triangles in the glTF that ships, which may be fewer. */
  readonly renderedTriangleCount: number
}

/**
 * `transform` is applied to the vertices before writing, so the asset is
 * already in wall orientation and centred on its own origin. The app then
 * only has to translate it into place.
 */
export async function meshToGlb(
  positions: Float32Array,
  name: string,
  transform?: (v: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
): Promise<GlbResult> {
  const placed = transform ? new Float32Array(positions.length) : positions
  if (transform) {
    for (let i = 0; i < positions.length; i += 3) {
      const p = transform({ x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! })
      placed[i] = p.x
      placed[i + 1] = p.y
      placed[i + 2] = p.z
    }
  }

  const document = new Document()
  document.setLogger(new Logger(Logger.Verbosity.ERROR))
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })

  const buffer = document.createBuffer()
  // Copy into an ArrayBuffer-backed array: glTF accessors will not take the
  // ArrayBufferLike-backed views a SharedArrayBuffer could produce.
  const position = document
    .createAccessor('POSITION')
    .setType('VEC3')
    .setArray(new Float32Array(placed))
    .setBuffer(buffer)

  const material = document.createMaterial(name).setBaseColorFactor([0.72, 0.74, 0.78, 1]).setMetallicFactor(0).setRoughnessFactor(0.85)
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setMaterial(material)
  const mesh = document.createMesh(name).addPrimitive(primitive)
  const node = document.createNode(name).setMesh(mesh)
  document.createScene().addChild(node)

  const triangleCount = positions.length / 9
  await document.transform(
    weld(),
    ...(triangleCount > SIMPLIFY_ABOVE_TRIANGLES
      ? [simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: SIMPLIFY_ERROR })]
      : []),
    quantize({ quantizePosition: 14, quantizeNormal: 10 }),
  )

  const bytes = await (await writer()).writeBinary(document)
  const finished = document.getRoot().listMeshes()[0]?.listPrimitives()[0]
  const indices = finished?.getIndices()?.getCount()
  return {
    bytes,
    vertexCount: finished?.getAttribute('POSITION')?.getCount() ?? 0,
    triangleCount,
    // What actually ships, after any simplification.
    renderedTriangleCount: indices !== undefined ? indices / 3 : triangleCount,
  }
}
