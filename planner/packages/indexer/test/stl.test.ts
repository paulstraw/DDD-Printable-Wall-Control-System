import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  computeBoundingBox,
  computeVolumeMm3,
  detectStlFormat,
  readStl,
  readStlFile,
} from '../src/stl'

/** The repo checkout this package lives inside. */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

/**
 * A closed unit cube from (0,0,0) to (1,1,1) as 12 outward-wound triangles.
 * Volume is exactly 1, which makes it a usable oracle for the volume sum.
 */
const CUBE_TRIANGLES: number[][] = [
  // -Z
  [0, 0, 0, 0, 1, 0, 1, 1, 0], [0, 0, 0, 1, 1, 0, 1, 0, 0],
  // +Z
  [0, 0, 1, 1, 0, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1, 0, 1, 1],
  // -Y
  [0, 0, 0, 1, 0, 0, 1, 0, 1], [0, 0, 0, 1, 0, 1, 0, 0, 1],
  // +Y
  [0, 1, 0, 0, 1, 1, 1, 1, 1], [0, 1, 0, 1, 1, 1, 1, 1, 0],
  // -X
  [0, 0, 0, 0, 0, 1, 0, 1, 1], [0, 0, 0, 0, 1, 1, 0, 1, 0],
  // +X
  [1, 0, 0, 1, 1, 0, 1, 1, 1], [1, 0, 0, 1, 1, 1, 1, 0, 1],
]

function binaryCube(header = 'SketchUp STL test'): Uint8Array {
  const bytes = new Uint8Array(84 + 50 * CUBE_TRIANGLES.length)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i)
  view.setUint32(80, CUBE_TRIANGLES.length, true)

  CUBE_TRIANGLES.forEach((tri, i) => {
    let at = 84 + 50 * i + 12 // skip the normal
    for (const value of tri) {
      view.setFloat32(at, value, true)
      at += 4
    }
  })
  return bytes
}

function asciiCube(eol = '\n', name = 'cube'): Uint8Array {
  const lines = [`solid ${name}`]
  for (const tri of CUBE_TRIANGLES) {
    lines.push('facet normal 0 0 0', '  outer loop')
    for (let v = 0; v < 9; v += 3) {
      lines.push(`    vertex ${tri[v]} ${tri[v + 1]} ${tri[v + 2]}`)
    }
    lines.push('  endloop', 'endfacet')
  }
  lines.push(`endsolid ${name}`, '')
  return new TextEncoder().encode(lines.join(eol))
}

describe('format detection', () => {
  it('recognises a binary file by its size, not its prefix', () => {
    expect(detectStlFormat(binaryCube())).toBe('binary')
    // The classic trap: a binary STL is allowed to start with "solid".
    expect(detectStlFormat(binaryCube('solid cube'))).toBe('binary')
  })

  it('recognises ASCII', () => {
    expect(detectStlFormat(asciiCube())).toBe('ascii')
    expect(detectStlFormat(asciiCube('\r\n'))).toBe('ascii')
  })

  it('treats anything too short to be a binary header as ASCII', () => {
    expect(detectStlFormat(new Uint8Array(10))).toBe('ascii')
  })
})

describe('reading a cube', () => {
  it('reads binary', () => {
    const mesh = readStl(binaryCube())
    expect(mesh.format).toBe('binary')
    expect(mesh.triangleCount).toBe(12)
    expect(mesh.positions).toHaveLength(12 * 9)
    expect(mesh.volumeMm3).toBeCloseTo(1, 6)
  })

  it('reads ASCII with LF and with CRLF, identically', () => {
    const lf = readStl(asciiCube('\n'))
    const crlf = readStl(asciiCube('\r\n'))
    expect(lf.format).toBe('ascii')
    expect(lf.triangleCount).toBe(12)
    expect(crlf.triangleCount).toBe(12)
    expect([...crlf.positions]).toEqual([...lf.positions])
  })

  it('agrees between the two formats', () => {
    const binary = readStl(binaryCube())
    const ascii = readStl(asciiCube())
    expect([...ascii.positions]).toEqual([...binary.positions])
    expect(ascii.volumeMm3).toBeCloseTo(binary.volumeMm3, 6)
  })

  it('reads scientific notation and negative exponents', () => {
    const text = [
      'solid sci',
      'facet normal -3.604066237073919e-14 0 0',
      '  outer loop',
      '    vertex 1e2 -2.5e-1 3',
      '    vertex 0 0 0',
      '    vertex -6.499132443838535e-09 1 1',
      '  endloop',
      'endfacet',
      'endsolid sci',
    ].join('\n')
    const mesh = readStl(new TextEncoder().encode(text))
    expect(mesh.triangleCount).toBe(1)
    expect(mesh.positions[0]).toBeCloseTo(100, 6)
    expect(mesh.positions[1]).toBeCloseTo(-0.25, 6)
    expect(mesh.positions[6]).toBeCloseTo(-6.499e-9, 12)
  })

  it('is not fooled by the word vertex inside a solid name', () => {
    const text = [
      'solid my vertexes model',
      'facet normal 0 0 0',
      '  outer loop',
      '    vertex 0 0 0',
      '    vertex 1 0 0',
      '    vertex 0 1 0',
      '  endloop',
      'endfacet',
      'endsolid my vertexes model',
    ].join('\n')
    expect(readStl(new TextEncoder().encode(text)).triangleCount).toBe(1)
  })
})

describe('bounding box', () => {
  it('measures min, max, size and centre', () => {
    const bbox = readStl(binaryCube()).bbox
    expect(bbox.min).toEqual({ x: 0, y: 0, z: 0 })
    expect(bbox.max).toEqual({ x: 1, y: 1, z: 1 })
    expect(bbox.size).toEqual({ x: 1, y: 1, z: 1 })
    expect(bbox.center).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
  })

  it('handles an offset mesh, which is the normal case here', () => {
    // STL origins in this library are wherever SketchUp left them.
    const positions = new Float32Array([10, 20, 30, 12, 20, 30, 10, 24, 30])
    const bbox = computeBoundingBox(positions)
    expect(bbox.min).toEqual({ x: 10, y: 20, z: 30 })
    expect(bbox.size).toEqual({ x: 2, y: 4, z: 0 })
    expect(bbox.center).toEqual({ x: 11, y: 22, z: 30 })
  })

  it('returns a zeroed box for an empty mesh', () => {
    expect(computeBoundingBox(new Float32Array(0)).size).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('volume', () => {
  it('is unaffected by translation', () => {
    const shifted = new Float32Array(CUBE_TRIANGLES.flat().map((v, i) => v + (i % 3 === 0 ? 500 : 0)))
    expect(computeVolumeMm3(shifted)).toBeCloseTo(1, 4)
  })

  it('is positive regardless of winding', () => {
    const reversed = new Float32Array(
      CUBE_TRIANGLES.flatMap((t) => [t[6], t[7], t[8], t[3], t[4], t[5], t[0], t[1], t[2]] as number[]),
    )
    expect(computeVolumeMm3(reversed)).toBeCloseTo(1, 6)
  })

  it('scales with the cube of a linear scale factor', () => {
    const scaled = new Float32Array(CUBE_TRIANGLES.flat().map((v) => v * 3))
    expect(computeVolumeMm3(scaled)).toBeCloseTo(27, 4)
  })

  it('is zero for an empty mesh', () => {
    expect(computeVolumeMm3(new Float32Array(0))).toBe(0)
  })
})

describe('malformed input', () => {
  it('rejects a truncated binary file', () => {
    const bytes = binaryCube().slice(0, 200)
    expect(() => readStl(bytes)).toThrow(/truncated binary STL/)
  })

  it('rejects a file that is not an STL at all', () => {
    expect(() => readStl(new TextEncoder().encode('hello world, not a mesh'))).toThrow(
      /no triangles/,
    )
  })

  it('rejects an ASCII facet missing a vertex', () => {
    const text = [
      'solid short',
      'facet normal 0 0 0',
      '  outer loop',
      '    vertex 0 0 0',
      '    vertex 1 0 0',
      '  endloop',
      'endfacet',
      'endsolid short',
    ].join('\n')
    expect(() => readStl(new TextEncoder().encode(text))).toThrow(/whole number of facets/)
  })
})

/**
 * The synthetic cases prove the parsers; these prove they survive what
 * SketchUp actually wrote. Skipped if the package is checked out on its own.
 */
describe.skipIf(!existsSync(join(REPO_ROOT, 'Sidepieces')))('the real library', () => {
  it('reads a binary sidepiece', () => {
    const mesh = readStlFile(join(REPO_ROOT, 'Sidepieces/Flats/3x0 Flat Left.stl'))
    expect(mesh.format).toBe('binary')
    expect(mesh.triangleCount).toBe(968)
    // 3x0 Flat is 85.70 mm tall in print orientation, where height runs along Y.
    expect(mesh.bbox.size.y).toBeCloseTo(85.7, 1)
    expect(mesh.volumeMm3).toBeGreaterThan(0)
  })

  it('reads a binary centerpiece', () => {
    const mesh = readStlFile(join(REPO_ROOT, 'Centerpieces/Spacer_clip-on/2x3 Spacer clip-on.stl'))
    expect(mesh.format).toBe('binary')
    expect(mesh.triangleCount).toBe(1532)
    expect(mesh.volumeMm3).toBeGreaterThan(0)
  })

  it('reads a CRLF ASCII file', () => {
    const mesh = readStlFile(join(REPO_ROOT, 'Accessories/3-4in Dowel Cap.stl'))
    expect(mesh.format).toBe('ascii')
    expect(mesh.triangleCount).toBeGreaterThan(0)
    expect(mesh.volumeMm3).toBeGreaterThan(0)
  })

  it('reads an LF ASCII file', () => {
    const mesh = readStlFile(
      join(
        REPO_ROOT,
        'Centerpieces/Locking_spacer_for_horizontal_Wall_Control/3x1 Locking Spacer for horizontal Wall Control.stl',
      ),
    )
    expect(mesh.format).toBe('ascii')
    expect(mesh.triangleCount).toBeGreaterThan(0)
  })

  it('confirms the recorded origin offsets — every part needs recentring', () => {
    const left = readStlFile(join(REPO_ROOT, 'Sidepieces/Flats/3x0 Flat Left.stl'))
    const spacer = readStlFile(join(REPO_ROOT, 'Centerpieces/Spacer_clip-on/2x3 Spacer clip-on.stl'))
    expect(left.bbox.min.x).toBeCloseTo(82.9, 0)
    expect(spacer.bbox.min.x).toBeCloseTo(651, -1)
  })
})
