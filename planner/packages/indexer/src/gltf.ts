/**
 * Mesh to compressed glTF.
 *
 * STL has no shared vertices — every triangle carries its own three — so the
 * first real win is welding. These are mechanical parts with hard edges, so
 * normals are per-face: coplanar neighbours merge, edges stay crisp, and the
 * renderer needs no smoothing pass.
 *
 * After welding: quantize, then EXT_meshopt_compression.
 */

import { Document, Logger, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { quantize, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

/** Per-face normals, one per vertex, matching the STL's flat topology. */
export function faceNormals(positions: Float32Array): Float32Array<ArrayBuffer> {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!
    const bx = positions[i + 3]!, by = positions[i + 4]!, bz = positions[i + 5]!
    const cx = positions[i + 6]!, cy = positions[i + 7]!, cz = positions[i + 8]!

    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az

    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0) {
      nx /= len
      ny /= len
      nz /= len
    }
    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = nx
      normals[i + v * 3 + 1] = ny
      normals[i + v * 3 + 2] = nz
    }
  }
  return normals
}

let io: NodeIO | null = null

async function writer(): Promise<NodeIO> {
  if (io) return io
  await MeshoptEncoder.ready
  io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  return io
}

export interface GlbResult {
  readonly bytes: Uint8Array
  readonly vertexCount: number
  readonly triangleCount: number
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
  // Copy into ArrayBuffer-backed arrays: glTF accessors will not take the
  // ArrayBufferLike-backed views a SharedArrayBuffer could produce.
  const position = document
    .createAccessor('POSITION')
    .setType('VEC3')
    .setArray(new Float32Array(placed))
    .setBuffer(buffer)
  const normal = document
    .createAccessor('NORMAL')
    .setType('VEC3')
    .setArray(faceNormals(placed))
    .setBuffer(buffer)

  const material = document.createMaterial(name).setBaseColorFactor([0.72, 0.74, 0.78, 1]).setMetallicFactor(0).setRoughnessFactor(0.85)
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normal).setMaterial(material)
  const mesh = document.createMesh(name).addPrimitive(primitive)
  const node = document.createNode(name).setMesh(mesh)
  document.createScene().addChild(node)

  await document.transform(weld(), quantize({ quantizePosition: 14, quantizeNormal: 10 }))

  const bytes = await (await writer()).writeBinary(document)
  const welded = document.getRoot().listMeshes()[0]?.listPrimitives()[0]
  return {
    bytes,
    vertexCount: welded?.getAttribute('POSITION')?.getCount() ?? 0,
    triangleCount: positions.length / 9,
  }
}
