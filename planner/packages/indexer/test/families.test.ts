import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slotSpanHeightMm } from '@ddd-planner/core'
import { parsePartName } from '@ddd-planner/core'
import { readStlFile } from '../src/stl'
import { assessJoint, buildPhase1Joint } from '../src/assembly'

const PLANNER_ROOT = join(import.meta.dirname, '..', '..', '..')
const REPO_ROOT = join(PLANNER_ROOT, '..')

interface AxisMap {
  x: string
  y: string
  z: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATA: any = JSON.parse(readFileSync(join(PLANNER_ROOT, 'data', 'families.json'), 'utf8'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const family = (id: string): any => {
  const found = DATA.families.find((f: { id: string }) => f.id === id)
  if (!found) throw new Error(`no family ${id}`)
  return found
}

/** Every part in a family directory that carries grid dimensions. */
function partsIn(dir: string) {
  return readdirSync(join(REPO_ROOT, dir))
    .filter((n) => /\.stl$/i.test(n))
    .map((n) => ({ name: n, parsed: parsePartName(n) }))
    .filter((p) => p.parsed.h !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Turn `{x: "+z", y: "+x", z: "+y"}` into rows of a 3x3 matrix. */
function toMatrix(map: AxisMap): number[][] {
  const axis = { x: 0, y: 1, z: 2 }
  return (['x', 'y', 'z'] as const).map((wall) => {
    const spec = map[wall]
    const row = [0, 0, 0]
    row[axis[spec[1] as 'x' | 'y' | 'z']] = spec[0] === '-' ? -1 : 1
    return row
  })
}

function determinant(m: number[][]): number {
  const [a, b, c] = m as [number[], number[], number[]]
  return (
    a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
    a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
    a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)
  )
}

/** Y extent of material inside a print-X slab, relative to bbox.min.y. */
function socketBand(file: string, xLo: number, xHi: number) {
  const mesh = readStlFile(join(REPO_ROOT, file))
  const p = mesh.positions
  const b = mesh.bbox
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < p.length; i += 9) {
    const xs = [p[i]!, p[i + 3]!, p[i + 6]!].map((v) => v - b.min.x)
    if (Math.min(...xs) > xHi || Math.max(...xs) < xLo) continue
    for (const j of [1, 4, 7]) {
      const y = p[i + j]! - b.min.y
      if (y < lo) lo = y
      if (y > hi) hi = y
    }
  }
  return { lo, hi, height: b.size.y }
}

describe('conventions', () => {
  it('declares a proper rotation for every family and variant', () => {
    const maps: AxisMap[] = []
    for (const f of DATA.families) {
      const p = f.printToWall
      if (typeof p.x === 'string') maps.push(p as AxisMap)
      else for (const variant of Object.values(p)) maps.push(variant as AxisMap)
    }
    expect(maps.length).toBeGreaterThan(0)
    for (const map of maps) {
      // A reflection here would silently mirror parts on the wall.
      expect(determinant(toMatrix(map))).toBe(1)
    }
  })

  it('uses each print axis exactly once per mapping', () => {
    for (const f of DATA.families) {
      const p = f.printToWall
      const maps: AxisMap[] = typeof p.x === 'string' ? [p] : (Object.values(p) as AxisMap[])
      for (const map of maps) {
        const used = [map.x[1], map.y[1], map.z[1]].sort()
        expect(used).toEqual(['x', 'y', 'z'])
      }
    }
  })
})

describe('Sidepieces/Flats', () => {
  const rule = family('sidepieces/flats')
  const parts = partsIn(rule.dir)

  it('has the declared part count', () => {
    expect(parts).toHaveLength(rule.parts)
  })

  it('derives every height from the slot span plus a parity lip', () => {
    for (const { name, parsed } of parts) {
      const h = parsed.h as number
      const lip = h % 2 === 1 ? rule.size.heightMm.lipOddMm : rule.size.heightMm.lipEvenMm
      const expected = slotSpanHeightMm(Math.ceil(h / 2)) + lip
      const measured = readStlFile(join(REPO_ROOT, rule.dir, name)).bbox.size.y
      expect(measured, name).toBeCloseTo(expected, 1)
    }
  })

  it('has a constant depth and a thickness that keys off the variant', () => {
    for (const { name, parsed } of parts) {
      const bbox = readStlFile(join(REPO_ROOT, rule.dir, name)).bbox
      expect(bbox.size.x, name).toBeCloseTo(rule.size.depthMm.constant, 1)
      const variant = parsed.variant as 'left' | 'right' | 'center'
      expect(bbox.size.z, name).toBeCloseTo(rule.size.thicknessMm[variant], 1)
    }
  })

  it('reaches behind the wall by the declared tang depth', () => {
    // Walk out along print X and find where the section stops being as thin
    // as the slot. Testing triangles individually will not do it: the part's
    // flat z = 0 face is thin everywhere and runs the whole depth.
    const mesh = readStlFile(join(REPO_ROOT, rule.dir, '3x0 Flat Left.stl'))
    const p = mesh.positions
    const b = mesh.bbox
    const BIN = 0.5
    const bins = Math.ceil(b.size.x / BIN)
    const thickest = new Array<number>(bins).fill(0)

    for (let i = 0; i < p.length; i += 9) {
      const xs = [p[i]!, p[i + 3]!, p[i + 6]!].map((v) => v - b.min.x)
      const zs = [p[i + 2]!, p[i + 5]!, p[i + 8]!].map((v) => v - b.min.z)
      const hi = Math.max(...zs)
      const from = Math.max(0, Math.floor(Math.min(...xs) / BIN))
      const to = Math.min(bins - 1, Math.floor(Math.max(...xs) / BIN))
      for (let k = from; k <= to; k++) thickest[k] = Math.max(thickest[k]!, hi)
    }

    let depth = 0
    for (let k = 0; k < bins; k++) {
      if (thickest[k]! > rule.anchor.tang.widthMm + 0.1) break
      depth = (k + 1) * BIN
    }
    expect(depth).toBeCloseTo(rule.anchor.tang.depthMm, 0)
  })

  it('carries its tang on the print face the rule claims', () => {
    // Left keeps the 2.2 mm tang at min.x; Right mirrors it to max.x.
    const left = readStlFile(join(REPO_ROOT, rule.dir, '3x0 Flat Left.stl'))
    const right = readStlFile(join(REPO_ROOT, rule.dir, '3x0 Flat Right.stl'))
    const tang = rule.anchor.tang.widthMm

    const thin = (mesh: typeof left, xLo: number, xHi: number) => {
      const p = mesh.positions
      const b = mesh.bbox
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < p.length; i += 9) {
        const xs = [p[i]!, p[i + 3]!, p[i + 6]!].map((v) => v - b.min.x)
        if (Math.min(...xs) > xHi || Math.max(...xs) < xLo) continue
        for (const j of [2, 5, 8]) {
          const z = p[i + j]! - b.min.z
          if (z < lo) lo = z
          if (z > hi) hi = z
        }
      }
      return hi - lo
    }

    expect(thin(left, 0, 3)).toBeCloseTo(tang, 1)
    expect(thin(right, 15.7, 18.7)).toBeCloseTo(tang, 1)
  })
})

describe('centerpiece sizes', () => {
  for (const id of ['centerpieces/spacer_blank', 'centerpieces/spacer_clip-on']) {
    const rule = family(id)
    const parts = partsIn(rule.dir)

    it(`${rule.label}: has the declared part count`, () => {
      expect(parts).toHaveLength(rule.parts)
    })

    it(`${rule.label}: derives width, height and thickness from the unit formulas`, () => {
      for (const { name, parsed } of parts) {
        const bbox = readStlFile(join(REPO_ROOT, rule.dir, name)).bbox
        const w = parsed.w as number
        const h = parsed.h as number
        expect(bbox.size.x, `${name} width`).toBeCloseTo(
          rule.size.widthMm.perUnitMm * w + rule.size.widthMm.constantMm,
          1,
        )
        expect(bbox.size.y, `${name} height`).toBeCloseTo(
          rule.size.heightMm.perUnitMm * h + rule.size.heightMm.constantMm,
          1,
        )
        expect(bbox.size.z, `${name} thickness`).toBeCloseTo(rule.size.thicknessMm.constant, 1)
      }
    })
  }
})

describe('the socket, measured against the parts that go in it', () => {
  const flats = family('sidepieces/flats')
  const blank = family('centerpieces/spacer_blank')

  it('spans exactly the height of the matching centerpiece, at every size', () => {
    for (let h = 1; h <= 8; h++) {
      const band = socketBand(join(flats.dir, `${h}x0 Flat Left.stl`), 10.5, 18.5)
      const centerpieceHeight = blank.size.heightMm.perUnitMm * h + blank.size.heightMm.constantMm
      expect(band.hi - band.lo, `${h}x0`).toBeCloseTo(centerpieceHeight, 1)
    }
  })

  it('sits the declared distance below the top of the sidepiece', () => {
    const gap = flats.sockets.centerpieceTopBelowSidepieceTopMm
    for (let h = 1; h <= 8; h++) {
      const band = socketBand(join(flats.dir, `${h}x0 Flat Left.stl`), 10.5, 18.5)
      expect(band.height - band.hi, `${h}x0`).toBeCloseTo(gap, 1)
    }
  })

  it('agrees with the centerpiece anchor offsets', () => {
    // Sidepiece bottom and centerpiece bottom are both stated relative to the
    // slot centre; their difference must equal what the meshes show.
    for (let h = 1; h <= 4; h++) {
      const parity = h % 2 === 1 ? 'odd' : 'even'
      const declared =
        flats.anchor.bottomBelowSlotCenterMm[parity] - blank.anchor.bottomBelowSlotCenterMm[parity]
      const band = socketBand(join(flats.dir, `${h}x0 Flat Left.stl`), 10.5, 18.5)
      expect(declared, `${h}x0`).toBeCloseTo(band.lo, 1)
    }
  })
})

describe('fasteners', () => {
  it('gives pins to the tabless family and none to the tabbed one', () => {
    const blank = family('centerpieces/spacer_blank')
    const clip = family('centerpieces/spacer_clip-on')

    expect(blank.tabs.present).toBe(true)
    expect(blank.fasteners).toEqual([])

    expect(clip.tabs.present).toBe(false)
    expect(clip.fasteners).toEqual([{ id: '4x10x8mm Pin', quantity: 4 }])
  })

  it('matches what the family folders actually ship', () => {
    // A fastener duplicated into a family folder is the repo's own signal.
    const clipFiles = readdirSync(join(REPO_ROOT, 'Centerpieces/Spacer_clip-on'))
    expect(clipFiles).toContain('4x10x8mm Pin.stl')

    const blankFiles = readdirSync(join(REPO_ROOT, 'Centerpieces/Spacer_blank'))
    expect(blankFiles.some((f) => /pin/i.test(f))).toBe(false)
  })

  it('points every declared fastener at a file that exists', () => {
    for (const [id, spec] of Object.entries(DATA.fasteners as Record<string, { path: string }>)) {
      expect(readdirSync(join(REPO_ROOT, 'Accessories')), id).toContain(
        spec.path.split('/').pop(),
      )
    }
  })

  it('resolves every fastener a family asks for', () => {
    for (const f of DATA.families) {
      for (const need of f.fasteners as { id: string }[]) {
        expect(DATA.fasteners[need.id], `${f.id} -> ${need.id}`).toBeDefined()
      }
    }
  })
})

describe('the width formulas explain the tab geometry', () => {
  it('makes the tabbed family overlap and the tabless one clear', () => {
    const blank = family('centerpieces/spacer_blank')
    const clip = family('centerpieces/spacer_clip-on')
    const SLOT_PITCH = 25.4

    // Both bodies are stated as spanning w slot columns; the constant is the
    // difference, and it should be twice the declared overhang or clearance.
    expect(blank.size.widthMm.perUnitMm).toBe(SLOT_PITCH)
    expect(blank.size.widthMm.constantMm).toBeCloseTo(2 * blank.tabs.overhangPerSideMm, 6)

    expect(clip.size.widthMm.perUnitMm).toBe(SLOT_PITCH)
    expect(clip.size.widthMm.constantMm).toBeCloseTo(-2 * clip.tabs.clearancePerSideMm, 6)
  })
})

describe('the Phase-1 joint, built from the shipped rules', () => {
  // This is the regression guard for the spike check. The original bug left
  // every other assertion in this file passing: the axis maps were still
  // proper rotations, the sizes still derived, the sockets simply faced the
  // wrong way. Only assembling two sidepieces around a centerpiece catches it.
  it('faces both sockets at the centerpiece', () => {
    const verdict = assessJoint(buildPhase1Joint(3))
    expect(verdict.leftFacesIn, 'left socket faces the span').toBe(true)
    expect(verdict.rightFacesIn, 'right socket faces the span').toBe(true)
  })

  it('seats a tab in each socket', () => {
    const { intoLeftSocket, intoRightSocket } = assessJoint(buildPhase1Joint(3))
    for (const [label, into] of [['left', intoLeftSocket], ['right', intoRightSocket]] as const) {
      // Into the 4.2 mm groove across, through 2.4 mm of tab in depth, and
      // the full height of the centerpiece.
      expect(into.x, `${label} across`).toBeGreaterThan(3.5)
      expect(into.y, `${label} depth`).toBeGreaterThan(2.0)
      expect(into.z, `${label} height`).toBeCloseTo(76.0, 1)
    }
  })

  it('is symmetric — a Left and a Right seat identically', () => {
    const { intoLeftSocket, intoRightSocket } = assessJoint(buildPhase1Joint(3))
    // Loose to 0.001 mm: these come off float32 vertices, and the two meshes
    // are separately exported mirrors rather than one reused twice.
    expect(intoRightSocket.x).toBeCloseTo(intoLeftSocket.x, 3)
    expect(intoRightSocket.y).toBeCloseTo(intoLeftSocket.y, 3)
  })

  it('holds at every width the family ships', () => {
    for (const w of [2, 3, 4, 5, 6, 7]) {
      const verdict = assessJoint(buildPhase1Joint(w))
      expect(verdict.socketsFaceEachOther, `${w} wide`).toBe(true)
      expect(verdict.intoLeftSocket.x, `${w} wide`).toBeGreaterThan(3.5)
    }
  })
})
