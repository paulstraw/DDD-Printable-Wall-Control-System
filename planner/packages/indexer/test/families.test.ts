import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type AxisMap, parsePartName, slotSpanHeightMm } from '@ddd-planner/core'
import { readStlFile } from '../src/stl'
import { REPO_ROOT, assessJoint, buildPhase1Joint, resolvedFamilies } from '../src/assembly'

const PLANNER_ROOT = join(import.meta.dirname, '..', '..', '..')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATA: any = JSON.parse(readFileSync(join(PLANNER_ROOT, 'data', 'families.json'), 'utf8'))
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

/** Model noise is real: one Gridfinity frame sits 0.1 mm proud of its rule. */
const HEIGHT_TOLERANCE_MM = 0.15

const FLATS_HEIGHT: Record<number, number> = {
  1: 34.9, 2: 57.2, 3: 85.7, 4: 108, 5: 136.5, 6: 158.8, 7: 187.3, 8: 209.6,
}

interface Declared {
  perUnitMm?: number
  constantMm?: number
  constant?: number
  toleranceMm?: number
}

/** What a declared size formula predicts for n units, or null if undeclared. */
function predict(rule: Declared | undefined, n: number): number | null {
  if (!rule) return null
  if (typeof rule.constant === 'number') return rule.constant
  if (typeof rule.perUnitMm === 'number') return rule.perUnitMm * n + (rule.constantMm ?? 0)
  return null
}

const measured = new Map<string, { x: number; y: number; z: number }>()
function sizeOf(dir: string, file: string) {
  const key = `${dir}/${file}`
  let hit = measured.get(key)
  if (!hit) {
    const b = readStlFile(join(REPO_ROOT, dir, file)).bbox
    hit = { x: b.size.x, y: b.size.y, z: b.size.z }
    measured.set(key, hit)
  }
  return hit
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FAMILIES: any[] = resolvedFamilies() as any[]

describe('the file itself', () => {
  it('resolves every family onto a known archetype', () => {
    expect(FAMILIES.length).toBeGreaterThan(0)
    for (const family of FAMILIES) {
      expect(['sidepiece', 'centerpiece'], family.id).toContain(family.kind)
      expect(family.anchor, family.id).toBeDefined()
      expect(family.printToWall, family.id).toBeDefined()
    }
  })

  it('declares a proper rotation everywhere', () => {
    for (const family of FAMILIES) {
      const maps: AxisMap[] =
        typeof family.printToWall.x === 'string'
          ? [family.printToWall]
          : (Object.values(family.printToWall) as AxisMap[])
      for (const map of maps) {
        // A reflection would silently turn a Left bracket into a Right.
        expect(determinant(toMatrix(map)), family.id).toBe(1)
        expect([map.x[1], map.y[1], map.z[1]].sort(), family.id).toEqual(['x', 'y', 'z'])
      }
    }
  })

  it('resolves every fastener a family asks for', () => {
    for (const family of FAMILIES) {
      for (const need of (family.fasteners ?? []) as { id: string }[]) {
        expect(DATA.fasteners[need.id], `${family.id} -> ${need.id}`).toBeDefined()
      }
    }
  })

  it('points every declared fastener at a file that exists', () => {
    for (const [id, spec] of Object.entries(DATA.fasteners as Record<string, { path: string }>)) {
      expect(readdirSync(join(REPO_ROOT, 'Accessories')), id).toContain(spec.path.split('/').pop())
    }
  })
})

describe.each(FAMILIES.map((f) => [f.id, f] as const))('%s', (_id, family) => {
  const parts = partsIn(family.dir)

  it('has the declared part count', () => {
    expect(parts).toHaveLength(family.parts)
  })

  it('follows its archetype height rule', () => {
    if (family.perPart) return // no single rule; see the note in families.json
    for (const { name, parsed } of parts) {
      const h = parsed.h as number
      const measuredHeight = sizeOf(family.dir, name).y

      if (family.size.heightMm?.rule === 'slotSpan') {
        const lip = h % 2 === 1 ? family.size.heightMm.lipOddMm : family.size.heightMm.lipEvenMm
        expect(Math.abs(slotSpanHeightMm(Math.ceil(h / 2)) + lip - measuredHeight), name)
          .toBeLessThanOrEqual(HEIGHT_TOLERANCE_MM)
        // The same series the grid reproduces.
        expect(Math.abs((FLATS_HEIGHT[h] as number) - measuredHeight), name)
          .toBeLessThanOrEqual(HEIGHT_TOLERANCE_MM)
      } else {
        const expected = predict(family.size.heightMm, h) as number
        expect(Math.abs(expected - measuredHeight), name).toBeLessThanOrEqual(HEIGHT_TOLERANCE_MM)
      }
    }
  })

  it('matches every size formula it declares', () => {
    if (family.perPart) return
    const skip = new Set<string>(
      ((family.knownDeviations ?? []) as { part: string }[]).map((d) => d.part),
    )

    for (const { name, parsed } of parts) {
      if (skip.has(parsed.filename)) continue
      const size = sizeOf(family.dir, name)
      const tolerance = 0.15

      const width = predict(family.size.widthMm, parsed.w as number)
      if (width !== null) {
        const t = family.size.widthMm.toleranceMm ?? tolerance
        expect(Math.abs(size.x - width), `${name} width`).toBeLessThanOrEqual(t)
      }

      const depth = predict(family.size.depthMm, parsed.w as number)
      if (depth !== null) {
        const t = family.size.depthMm.toleranceMm ?? tolerance
        expect(Math.abs(size.x - depth), `${name} depth`).toBeLessThanOrEqual(t)
      }

      const thickness = predict(family.size.thicknessMm as Declared, 0)
      if (thickness !== null) {
        const t = family.size.thicknessMm.toleranceMm ?? tolerance
        expect(Math.abs(size.z - thickness), `${name} thickness`).toBeLessThanOrEqual(t)
      }
    }
  })

  it('states each known deviation truthfully', () => {
    for (const d of (family.knownDeviations ?? []) as {
      part: string
      measuredWidthMm: number
    }[]) {
      const match = parts.find((p) => p.parsed.filename === d.part)
      expect(match, `${d.part} is listed as a deviation but is not in ${family.dir}`).toBeDefined()
      expect(sizeOf(family.dir, match!.name).x, d.part).toBeCloseTo(d.measuredWidthMm, 1)
    }
  })

  it('ships the fasteners it declares, and no others', () => {
    const loose = readdirSync(join(REPO_ROOT, family.dir)).filter(
      (f) => /\.stl$/i.test(f) && parsePartName(f).h === null,
    )
    const declared = ((family.fasteners ?? []) as { id: string }[]).map((f) => f.id).sort()
    // A fastener duplicated into a family folder is the repo's own signal.
    expect(loose.map((f) => f.replace(/\.stl$/i, '')).sort(), family.id).toEqual(declared)
  })
})

describe('sidepieces share one mounting interface', () => {
  const sidepieces = FAMILIES.filter((f) => f.kind === 'sidepiece')

  it('covers more than one family', () => {
    expect(sidepieces.length).toBeGreaterThan(1)
  })

  it('gives them all the same tang', () => {
    // This is the claim the archetype rests on: the families differ in what
    // they hold, never in how they hang.
    const tangs = new Set(sidepieces.map((f) => JSON.stringify(f.anchor.tang)))
    expect(tangs.size).toBe(1)
  })

  it('gives them all the same anchor offsets', () => {
    const anchors = new Set(sidepieces.map((f) => JSON.stringify(f.anchor.bottomBelowSlotCenterMm)))
    expect(anchors.size).toBe(1)
  })

  it('measures 13.7 mm thick for a side and 27.6 for a centre', () => {
    for (const family of sidepieces) {
      const parts = partsIn(family.dir)
      for (const { name, parsed } of parts) {
        if (parsed.variant !== 'left' && parsed.variant !== 'right') continue
        expect(sizeOf(family.dir, name).z, `${family.id} ${name}`).toBeCloseTo(13.7, 1)
      }
    }
  })
})

describe('the Phase-1 joint, built from the shipped rules', () => {
  // The regression guard for the spike check. The original bug left every
  // other assertion in this file passing: the axis maps were still proper
  // rotations, the sizes still derived, the sockets simply faced the wrong
  // way. Only assembling two sidepieces around a centerpiece catches it.
  it('faces both sockets at the centerpiece', () => {
    const verdict = assessJoint(buildPhase1Joint(3))
    expect(verdict.leftFacesIn).toBe(true)
    expect(verdict.rightFacesIn).toBe(true)
  })

  it('seats a tab in each socket', () => {
    const { intoLeftSocket, intoRightSocket } = assessJoint(buildPhase1Joint(3))
    for (const [label, into] of [['left', intoLeftSocket], ['right', intoRightSocket]] as const) {
      expect(into.x, `${label} across`).toBeGreaterThan(3.5)
      expect(into.y, `${label} depth`).toBeGreaterThan(2.0)
      expect(into.z, `${label} height`).toBeCloseTo(76.0, 1)
    }
  })

  it('is symmetric — a Left and a Right seat identically', () => {
    const { intoLeftSocket, intoRightSocket } = assessJoint(buildPhase1Joint(3))
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
