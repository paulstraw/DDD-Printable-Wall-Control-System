import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { REPO_ROOT } from '../src/assembly'
import { runIndexer } from '../src/catalog'
import { SIMPLIFY_ABOVE_TRIANGLES, meshToGlb } from '../src/gltf'
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

describe('meshToGlb', () => {
  it('welds the unshared STL vertices down to the corners', async () => {
    const glb = await meshToGlb(CUBE, 'cube')
    expect(glb.triangleCount).toBe(12)
    // With no normals to keep them apart, 36 unshared vertices collapse all
    // the way to the cube's 8 corners. With per-face normals it was 24.
    expect(glb.vertexCount).toBe(8)
    expect(glb.bytes.byteLength).toBeGreaterThan(0)
  })

  it('leaves a small mesh untouched by the simplifier', async () => {
    const glb = await meshToGlb(CUBE, 'cube')
    expect(glb.renderedTriangleCount).toBe(glb.triangleCount)
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
    // Deliberately no normals: they would split every vertex three ways and
    // block simplification. The app flat-shades instead.
    expect(prim.getAttribute('NORMAL')).toBeNull()

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

    // Every placeable part in the library.
    expect(index.parts).toHaveLength(541)
    expect(index.families).toHaveLength(19)

    // Fasteners duplicated into family folders are fasteners, not parts.
    expect(Object.keys(index.fasteners).sort()).toEqual([
      '4x10x8mm Pin',
      '8mm Lock Pin',
      'Quickhook Lock Peg',
      'Quickhook Lockable Retainer',
      'Quickhook Retainer',
    ])
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

  it('simplifies the heavy meshes and leaves the rest alone', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const simplified = index.parts.filter(
      (p: { renderedTriangles: number; triangles: number }) => p.renderedTriangles < p.triangles,
    )

    // A few dozen over-tessellated parts carry most of the bytes; the rest of
    // the library is already small.
    expect(simplified.length).toBeGreaterThan(20)
    expect(simplified.length).toBeLessThan(index.parts.length / 2)

    for (const part of index.parts) {
      // Simplifying can only remove triangles.
      expect(part.renderedTriangles, part.name).toBeLessThanOrEqual(part.triangles)
      expect(part.renderedTriangles, part.name).toBeGreaterThan(0)
      // And only meshes above the threshold are touched at all.
      if (part.triangles <= SIMPLIFY_ABOVE_TRIANGLES) {
        expect(part.renderedTriangles, part.name).toBe(part.triangles)
      }
    }
  })

  it('keeps every model comfortably under what Pages will serve', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    for (const part of index.parts) {
      const bytes = statSync(join(out, part.model)).size
      expect(bytes, `${part.name} is ${(bytes / 1024).toFixed(0)} kB`).toBeLessThan(1024 * 1024)
    }
  })

  it('takes each part role from the archetype, not from its folder', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const roleOf = (name: string) =>
      index.parts.find((p: { name: string }) => p.name === name)?.role

    expect(roleOf('3x0 Flat Left')).toBe('sidepiece')
    expect(roleOf('3x3 Spacer blank')).toBe('centerpiece')

    // The two the folder name would get wrong. A retainer lives under
    // Sidepieces but clips onto an assembly like a centerpiece, and a
    // Quickhook lives on its own but hangs from the slots like a sidepiece.
    expect(roleOf('2x0 Retainer')).toBe('centerpiece')
    expect(roleOf('Quickhook 3in Heavy')).toBe('sidepiece')

    for (const part of index.parts) {
      expect(['sidepiece', 'centerpiece'], part.name).toContain(part.role)
    }
  })

  it('records the source STL size so a download can be estimated first', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    for (const part of index.parts) {
      const onDisk = statSync(join(REPO_ROOT, part.file)).size
      expect(part.sourceBytes, part.name).toBe(onDisk)
    }
    for (const fastener of Object.values(index.fasteners) as { file: string; sourceBytes: number }[]) {
      expect(fastener.sourceBytes).toBe(statSync(join(REPO_ROOT, fastener.file)).size)
    }
  })

  it('bakes a placement rule the app can use without families.json', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const by = (name: string) => index.parts.find((p: { name: string }) => p.name === name)

    // A Left hangs its body to -x from the slot; a Right to +x. These are the
    // numbers the spike check confirmed the joint closes on.
    expect(by('3x0 Flat Left').orientations.flat.rule.offsetFromSlotXMm).toBeCloseTo(-12.6, 2)
    expect(by('3x0 Flat Right').orientations.flat.rule.offsetFromSlotXMm).toBeCloseTo(-1.1, 2)
    expect(by('3x0 Flat Center').orientations.flat.rule.offsetFromSlotXMm).toBeCloseTo(-26.5, 2)

    // A tabbed centerpiece overhangs its span by 2.7 a side; a tabless one
    // clears it by 1.2.
    expect(by('3x3 Spacer blank').orientations.flat.rule.offsetFromSlotXMm).toBeCloseTo(-2.7, 2)
    expect(by('3x3 Spacer clip-on').orientations.flat.rule.offsetFromSlotXMm).toBeCloseTo(1.2, 2)

    // Centerpieces that hang in the plane of the wall share the
    // mounting-interface front face; sidepieces sit at their own depth, which
    // is how a 67 mm bracket and an 18.7 mm flat both hang correctly off the
    // same slot.
    const centerpieceFaces = new Set(
      index.parts
        .filter(
          (p: { family: string }) =>
            p.family.startsWith('centerpieces/') && p.family !== 'centerpieces/gridfinity',
        )
        .map(
          (p: { orientations: { flat: { rule: { frontFaceYMm: number } } } }) =>
            p.orientations.flat.rule.frontFaceYMm,
        ),
    )
    expect(centerpieceFaces).toEqual(new Set([-10.2]))
    expect(by('3x0 Flat Left').orientations.flat.rule.frontFaceYMm).toBeCloseTo(-10.2, 1)

    // A Gridfinity frame is the exception: rotated a quarter turn out of the
    // wall, it is a shelf, so it projects by what the filename calls its
    // height instead of sharing the interface constant. It also cannot start
    // at the panel — the first arm pocket is 24.05 out from the tang and the
    // frame's first rib is 7.75 in from its back edge, so the back edge
    // stands 7.8 mm proud and the front face is that much further out again.
    // Measured, not derived, so the 0.1 mm of model noise the families test
    // already tolerates shows up here too.
    expect(by('5x7 Gridfinity Frame 3x4').orientations.shelf.rule.frontFaceYMm).toBeCloseTo(-126.8 - 7.8, 1)
    expect(
      Math.abs(by('2x10 Gridfinity Frame 1x6').orientations.shelf.rule.frontFaceYMm + 50.6 + 7.8),
    ).toBeLessThanOrEqual(0.15)
  })

  it('lays a Gridfinity frame out of the wall, cells up, and nothing else', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const by = (name: string) =>
      index.parts.find((p: { name: string }) => p.name === name) as {
        sizeMm: { x: number; y: number; z: number }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orientations: any
      }

    // Rotated: the 3x4 grid's four columns run along the wall, its three rows
    // run out of it, and the 10.8 mm plate thickness is all the height it has.
    const frame = by('5x7 Gridfinity Frame 3x4')
    expect(frame.sizeMm.x).toBeCloseTo(183.2, 1)
    expect(frame.sizeMm.y).toBeCloseTo(126.8, 1)
    expect(frame.sizeMm.z).toBeCloseTo(10.8, 1)

    // Located by its rib, not by its top and not by its bottom. The rib sits
    // in the arm pocket, whose floor is 12.9 below the top of the sidepiece,
    // and a sidepiece's top is always 20.35 above the slot it tops out on —
    // so the frame's own face lands 7.45 *above* that slot centre, and `h`
    // never enters into it. Every frame gets the same number, which is the
    // whole point: for a shelf `h` is depth, and a 4-deep frame does not
    // belong a slot row higher than a 2-deep one.
    for (const name of [
      '2x10 Gridfinity Frame 1x6',
      '4x4 Gridfinity Frame 2x2',
      '5x7 Gridfinity Frame 3x4',
      '7x14 Gridfinity Frame 4x8',
    ]) {
      const part = index.parts.find((p: { name: string }) => p.name === name)
      const { odd, even } = part.orientations.shelf.rule.bottomBelowSlotCenterMm
      expect(odd, name).toBeCloseTo(-7.45, 2)
      // Parity is already spent — a shelf has no height for it to key off.
      expect(even, name).toBe(odd)
    }

    expect(frame.orientations.shelf.rule.matesByHeight).toBe(false)

    // A Spacer blank of the same height still hangs flat, tall side up.
    const blank = by('4x7 Spacer blank')
    expect(blank.sizeMm.z).toBeCloseTo(101.4, 1)
    expect(blank.orientations.flat.rule.matesByHeight).toBe(true)

    // Nothing else in the library is rotated out of the wall plane.
    const rotated = index.parts
      .filter((p: { orientations: Record<string, { rule: { matesByHeight: boolean } }> }) =>
        Object.values(p.orientations).every((o) => !o.rule.matesByHeight),
      )
      .map((p: { family: string }) => p.family)
    expect(new Set(rotated)).toEqual(new Set(['centerpieces/gridfinity']))
  })

  it('gives a centerpiece the columns it spans and a sidepiece one', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const kindOf = new Map(
      (index.families as { id: string; kind: string }[]).map((f) => [f.id, f.kind]),
    )
    for (const part of index.parts) {
      // A sidepiece hangs on one slot; a centerpiece spans the columns it is
      // named for, but never fewer than one — `2x0 Retainer` is named zero
      // wide and still occupies a column.
      const expected =
        kindOf.get(part.family) === 'sidepiece' ? 1 : Math.max(1, Math.round(part.w))
      // Gridfinity offers only a shelf, so read whichever orientation the
      // part actually ships with — the column span is the same either way,
      // because the turn is about the wall X axis.
      const oriented = part.orientations.flat ?? part.orientations.shelf
      expect(oriented.rule.occupiesColumns, part.name).toBe(expected)
    }
  })

  it('flags every horizontal-panel part as unsupported, wherever it lives', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const unsupported = index.parts.filter((p: { supported: boolean }) => !p.supported)

    expect(unsupported).toHaveLength(19)
    for (const part of unsupported) {
      expect(part.unsupportedReason, part.name).toMatch(/horizontal/i)
      // Still indexed, still downloadable — flagged, not dropped.
      expect(part.model, part.name).toBeTruthy()
    }

    // Two families, not one folder.
    const families = new Set(unsupported.map((p: { family: string }) => p.family))
    expect(families.size).toBe(2)
  })

  it('leaves every other part supported', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const supported = index.parts.filter((p: { supported: boolean }) => p.supported)
    expect(supported).toHaveLength(541 - 19)
    for (const part of supported.slice(0, 50)) expect(part.unsupportedReason).toBeUndefined()
  })

  it('gives a lock pin to the locking retainers and not the plain ones', async () => {
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    const retainers = index.parts.filter(
      (p: { family: string }) => p.family === 'sidepieces/retainers',
    )
    const withPin = retainers.filter((p: { fasteners: unknown[] }) => p.fasteners.length > 0)
    expect(retainers).toHaveLength(15)
    expect(withPin).toHaveLength(10)
    for (const part of withPin) {
      expect(part.name.toLowerCase(), part.name).toContain('locking retainer')
      expect(part.fasteners).toEqual([{ id: '8mm Lock Pin', quantity: 1 }])
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
