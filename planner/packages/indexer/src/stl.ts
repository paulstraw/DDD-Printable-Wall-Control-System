/**
 * STL reader — binary and ASCII.
 *
 * 335 of the repo's 557 files are binary (SketchUp export, header
 * `SketchUp STL ...`) and 222 are ASCII, in both LF and CRLF flavours and
 * with scientific-notation coordinates. Both have to work.
 *
 * Format detection is by size, not by the leading bytes: a binary STL is
 * legally allowed to begin with the text "solid", and sniffing that prefix is
 * the classic way to mis-read one. `84 + 50 * triangleCount === byteLength`
 * is the only reliable test.
 */

import { readFileSync } from 'node:fs'

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface BoundingBox {
  readonly min: Vec3
  readonly max: Vec3
  readonly size: Vec3
  readonly center: Vec3
}

export type StlFormat = 'binary' | 'ascii'

export interface StlMesh {
  readonly format: StlFormat
  readonly triangleCount: number
  /** Nine floats per triangle: three vertices, x/y/z, in file order. */
  readonly positions: Float32Array
  readonly bbox: BoundingBox
  /** Enclosed volume in mm³. Assumes the mesh is closed, which these are. */
  readonly volumeMm3: number
}

const BINARY_HEADER_BYTES = 84
const BINARY_TRIANGLE_BYTES = 50

const EMPTY_VEC: Vec3 = { x: 0, y: 0, z: 0 }
const EMPTY_BBOX: BoundingBox = {
  min: EMPTY_VEC,
  max: EMPTY_VEC,
  size: EMPTY_VEC,
  center: EMPTY_VEC,
}

/**
 * Latin-1 maps every byte to exactly one code unit, so a binary file decoded
 * this way cannot throw and its byte offsets stay meaningful.
 */
const LATIN1 = new TextDecoder('latin1')

function isSpace(code: number): boolean {
  return code === 32 || code === 10 || code === 13 || code === 9
}

function startsWithSolid(bytes: Uint8Array): boolean {
  let at = 0
  while (at < bytes.byteLength && isSpace(bytes[at] as number)) at++
  return LATIN1.decode(bytes.subarray(at, at + 5)).toLowerCase() === 'solid'
}

export function detectStlFormat(bytes: Uint8Array): StlFormat {
  if (bytes.byteLength < BINARY_HEADER_BYTES) return 'ascii'

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const declared = view.getUint32(80, true)
  if (bytes.byteLength === BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * declared) return 'binary'

  // The size did not add up, so this is either a padded binary, a truncated
  // binary, or text. Only text can start with `solid`; anything else is
  // binary and will fail loudly in the parser rather than read as empty.
  return startsWithSolid(bytes) ? 'ascii' : 'binary'
}

function parseBinary(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)

  const needed = BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * count
  if (bytes.byteLength < needed) {
    throw new Error(
      `truncated binary STL: header declares ${count} triangles (${needed} bytes) but the file is ${bytes.byteLength}`,
    )
  }

  const positions = new Float32Array(count * 9)
  let out = 0
  for (let i = 0; i < count; i++) {
    // Skip the 12-byte facet normal; we recompute lighting from geometry.
    let at = BINARY_HEADER_BYTES + BINARY_TRIANGLE_BYTES * i + 12
    for (let v = 0; v < 9; v++, at += 4) positions[out++] = view.getFloat32(at, true)
  }
  return positions
}

/**
 * Counts, then fills. Two passes over the text beat growing an array: the
 * ASCII half of the library is 567 MB and 5.8 M triangles.
 */
function parseAscii(text: string): Float32Array {
  const vertexCount = countVertexTokens(text)
  const positions = new Float32Array(vertexCount * 3)

  let out = 0
  let at = 0
  while (out < positions.length) {
    at = nextVertexToken(text, at)
    if (at === -1) break
    at += 6
    for (let axis = 0; axis < 3; axis++) {
      while (at < text.length && isSpace(text.charCodeAt(at))) at++
      const start = at
      while (at < text.length && !isSpace(text.charCodeAt(at))) at++
      positions[out++] = Number(text.slice(start, at))
    }
  }

  if (out !== positions.length) {
    throw new Error(`malformed ASCII STL: expected ${positions.length} coordinates, read ${out}`)
  }
  if (vertexCount % 3 !== 0) {
    throw new Error(`malformed ASCII STL: ${vertexCount} vertices is not a whole number of facets`)
  }
  return positions
}

/**
 * A `vertex` token has to be delimited on both sides — the solid's name is
 * free text and could otherwise contribute a false match.
 */
function nextVertexToken(text: string, from: number): number {
  let at = from
  for (;;) {
    at = text.indexOf('vertex', at)
    if (at === -1) return -1
    const before = at === 0 ? 32 : text.charCodeAt(at - 1)
    const after = at + 6 >= text.length ? 32 : text.charCodeAt(at + 6)
    if (isSpace(before) && isSpace(after)) return at
    at += 6
  }
}

function countVertexTokens(text: string): number {
  let count = 0
  let at = 0
  for (;;) {
    at = nextVertexToken(text, at)
    if (at === -1) return count
    count++
    at += 6
  }
}

export function computeBoundingBox(positions: Float32Array): BoundingBox {
  if (positions.length === 0) return EMPTY_BBOX

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] as number
    const y = positions[i + 1] as number
    const z = positions[i + 2] as number
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  }
}

/**
 * Signed tetrahedron sum against the origin. The sign depends on winding, so
 * the magnitude is what we keep — filament estimates do not care which way
 * round the triangles were written.
 */
export function computeVolumeMm3(positions: Float32Array): number {
  let total = 0
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i] as number
    const ay = positions[i + 1] as number
    const az = positions[i + 2] as number
    const bx = positions[i + 3] as number
    const by = positions[i + 4] as number
    const bz = positions[i + 5] as number
    const cx = positions[i + 6] as number
    const cy = positions[i + 7] as number
    const cz = positions[i + 8] as number

    total +=
      ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(total) / 6
}

export function readStl(bytes: Uint8Array): StlMesh {
  const format = detectStlFormat(bytes)
  const positions = format === 'binary' ? parseBinary(bytes) : parseAscii(LATIN1.decode(bytes))

  if (positions.length === 0) {
    throw new Error(`STL contains no triangles (read as ${format}, ${bytes.byteLength} bytes)`)
  }

  return {
    format,
    triangleCount: positions.length / 9,
    positions,
    bbox: computeBoundingBox(positions),
    volumeMm3: computeVolumeMm3(positions),
  }
}

/** Convenience wrapper for the build step. The parser itself never touches fs. */
export function readStlFile(path: string): StlMesh {
  return readStl(readFileSync(path))
}
