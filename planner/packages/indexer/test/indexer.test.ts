import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { runIndexer } from '../src/catalog'
import { faceNormals, meshToGlb } from '../src/gltf'
import { renderRgba } from '../src/thumbnail'

/** A closed unit cube, 12 triangles, unshared vertices as STL gives them. */
const CUBE = new Float32Array(
  [
    [0, 0, 0, 0, 1, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0, 1, 0, 0],
    [0, 0, 1, 1, 0, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1, 0, 1, 1],
    [0, 0, 0, 1, 0, 0, 1, 0, 1], [0, 0, 0, 1, 0, 1, 0, 0, 1],
    [0, 1, 0, 0, 1, 1, 1, 1, 1], [0, 1, 0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 1, 0, 1, 1], [0, 0, 0, 0, 1, 1, 0, 1, 0],
    [1, 0, 0, 1, 1, 0, 1, 1, 1], [1, 0, 0, 1, 1, 1, 1, 0, 1],
  ].flat(),
)

describe('faceNormals', () => {
  it('gives every vertex of a triangle the same unit normal', () => {
    const n = faceNormals(CUBE)
    expect(n).toHaveLength(CUBE.length)
    for (let i = 0; i < n.length; i += 9) {
      const [x, y, z] = [n[i]!, n[i + 1]!, n[i + 2]!]
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
      // All three vertices of the face share it — flat shading, hard edges.
      expect(n[i + 3]).toBeCloseTo(x, 6)
      expect(n[i + 6]).toBeCloseTo(x, 6)
    }
  })

  it('produces axis-aligned normals for an axis-aligned box', () => {
    const n = faceNormals(CUBE)
    for (let i = 0; i < n.length; i += 3) {
      const axes = [Math.abs(n[i]!), Math.abs(n[i + 1]!), Math.abs(n[i + 2]!)].sort()
      expect(axes[2]).toBeCloseTo(1, 5)
      expect(axes[1]).toBeCloseTo(0, 5)
    }
  })

  it('leaves a degenerate triangle at zero rather than dividing by zero', () => {
    const degenerate = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2])
    const n = faceNormals(degenerate)
    expect([...n].every(Number.isFinite)).toBe(true)
  })
})

describe('meshToGlb', () => {
  it('welds the unshared STL vertices', async () => {
    const glb = await meshToGlb(CUBE, 'cube')
    expect(glb.triangleCount).toBe(12)
    // 36 unshared vertices collapse to 24: one per corner per face normal.
    expect(glb.vertexCount).toBe(24)
    expect(glb.bytes.byteLength).toBeGreaterThan(0)
  })

  it('writes a glTF that reads back with the same geometry', async () => {
    const glb = await meshToGlb(CUBE, 'cube')
    await MeshoptDecoder.ready
    const io = new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    const document = await io.readBinary(glb.bytes)

    const node = document.getRoot().listNodes()[0]!
    const prim = node.getMesh()!.listPrimitives()[0]!
    expect(prim.getIndices()!.getCount()).toBe(36)
    expect(prim.getAttribute('NORMAL')).not.toBeNull()

    // Quantization scales into [-1,1] and puts the size on the node, so the
    // world extent is what has to survive, not the raw accessor values.
    const pos = prim.getAttribute('POSITION')!
    const scale = node.getScale()
    const min = pos.getMinNormalized([]) as number[]
    const max = pos.getMaxNormalized([]) as number[]
    for (let axis = 0; axis < 3; axis++) {
      expect((max[axis]! - min[axis]!) * scale[axis]!).toBeCloseTo(1, 2)
    }
    expect(document.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain(
      'EXT_meshopt_compression',
    )
  })

  it('applies the transform it is given', async () => {
    const plain = await meshToGlb(CUBE, 'cube')
    const scaled = await meshToGlb(CUBE, 'cube', (v) => ({ x: v.x * 10, y: v.y, z: v.z }))
    expect(scaled.vertexCount).toBe(plain.vertexCount)
    expect(scaled.bytes.byteLength).toBeGreaterThan(0)
  })
})

describe('thumbnail rasteriser', () => {
  it('draws the part rather than an empty frame', () => {
    const { rgba, size } = renderRgba(CUBE, { size: 64 })
    expect(size).toBe(64)
    expect(rgba).toHaveLength(64 * 64 * 4)

    let drawn = 0
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] !== 250 || rgba[i + 1] !== 249 || rgba[i + 2] !== 247) drawn++
    }
    // A cube seen three-quarter on should fill a good part of the frame.
    expect(drawn).toBeGreaterThan(64 * 64 * 0.3)
  })

  it('is deterministic — same mesh, same pixels', () => {
    const a = renderRgba(CUBE, { size: 48 })
    const b = renderRgba(CUBE, { size: 48 })
    expect([...a.rgba]).toEqual([...b.rgba])
  })

  it('shades faces differently, so the form reads', () => {
    const { rgba } = renderRgba(CUBE, { size: 64 })
    const shades = new Set<number>()
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 255 && rgba[i] !== 250) shades.add(rgba[i]!)
    }
    expect(shades.size).toBeGreaterThan(1)
  })

  it('leaves every pixel opaque', () => {
    const { rgba } = renderRgba(CUBE, { size: 32 })
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255)
  })
})

describe('the indexer, end to end', () => {
  const out = mkdtempSync(join(tmpdir(), 'ddd-index-'))
  afterAll(() => rmSync(out, { recursive: true, force: true }))

  it('indexes every Phase-1 part and writes the assets it names', async () => {
    const { index, stats } = await runIndexer(out)

    // 24 Flats + 28 Spacer blank + 12 Spacer clip-on.
    expect(index.parts).toHaveLength(64)
    expect(index.families).toHaveLength(3)

    // The pin duplicated into the clip-on folder is a fastener, not a part.
    expect(Object.keys(index.fasteners)).toEqual(['4x10x8mm Pin'])
    expect(index.parts.some((p) => /pin/i.test(p.name))).toBe(false)

    for (const part of index.parts) {
      expect(statSync(join(out, part.model)).size, part.model).toBeGreaterThan(0)
      expect(statSync(join(out, part.thumb)).size, part.thumb).toBeGreaterThan(0)
    }
    expect(stats.modelBytes).toBeGreaterThan(0)
    expect(stats.thumbBytes).toBeGreaterThan(0)
  })

  it('records wall-space sizes, not print-space ones', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const flat = index.parts.find((p: { name: string }) => p.name === '3x0 Flat Left')
    expect(flat).toBeDefined()
    // Print space is 18.7 x 85.7 x 13.7; on the wall it is 13.7 x 18.7 x 85.7.
    expect(flat.sizeMm.x).toBeCloseTo(13.7, 1)
    expect(flat.sizeMm.y).toBeCloseTo(18.7, 1)
    expect(flat.sizeMm.z).toBeCloseTo(85.7, 1)
  })

  it('gives ids that are safe in a URL', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const ids = new Set<string>()
    for (const part of index.parts) {
      expect(part.id, part.name).toMatch(/^[a-z0-9-]+$/)
      expect(ids.has(part.id), `duplicate id ${part.id}`).toBe(false)
      ids.add(part.id)
    }
  })

  it('bakes a placement rule the app can use without families.json', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const by = (name: string) => index.parts.find((p: { name: string }) => p.name === name)

    // A Left hangs its body to -x from the slot; a Right to +x. These are the
    // numbers the spike check confirmed the joint closes on.
    expect(by('3x0 Flat Left').placement.offsetFromSlotXMm).toBeCloseTo(-12.6, 2)
    expect(by('3x0 Flat Right').placement.offsetFromSlotXMm).toBeCloseTo(-1.1, 2)
    expect(by('3x0 Flat Center').placement.offsetFromSlotXMm).toBeCloseTo(-26.5, 2)

    // A tabbed centerpiece overhangs its span by 2.7 a side; a tabless one
    // clears it by 1.2.
    expect(by('3x3 Spacer blank').placement.offsetFromSlotXMm).toBeCloseTo(-2.7, 2)
    expect(by('3x3 Spacer clip-on').placement.offsetFromSlotXMm).toBeCloseTo(1.2, 2)

    // Everything shares one front face, which is what seats the tabs.
    const faces = new Set(
      index.parts.map((p: { placement: { frontFaceYMm: number } }) => p.placement.frontFaceYMm),
    )
    expect(faces.size).toBe(1)
  })

  it('gives a centerpiece the columns it spans and a sidepiece one', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    for (const part of index.parts) {
      const expected = part.family.startsWith('sidepieces/') ? 1 : Math.round(part.w)
      expect(part.placement.occupiesColumns, part.name).toBe(expected)
    }
  })

  it('attaches fasteners only to the family that needs them', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const clip = index.parts.filter((p: { family: string }) => p.family === 'centerpieces/spacer_clip-on')
    const blank = index.parts.filter((p: { family: string }) => p.family === 'centerpieces/spacer_blank')

    expect(clip.length).toBeGreaterThan(0)
    for (const p of clip) expect(p.fasteners).toEqual([{ id: '4x10x8mm Pin', quantity: 4 }])
    for (const p of blank) expect(p.fasteners).toEqual([])
  })
}, 120_000)
