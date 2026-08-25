import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type AxisMap, SLOT_ROW_PITCH_MM, parsePartName, slotSpanHeightMm } from '@ddd-planner/core'
import { type Vec3, readStlFile } from '../src/stl'
import { REPO_ROOT, assessJoint, buildPhase1Joint, resolvedFamilies } from '../src/assembly'

const PLANNER_ROOT = join(import.meta.dirname, '..', '..', '..')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DATA: any = JSON.parse(readFileSync(join(PLANNER_ROOT, 'data', 'families.json'), 'utf8'))
/**
 * The placeable parts of a family. Normally that means every file carrying
 * grid dimensions; for a dimensionless family it means every file that is not
 * one of its named fasteners.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function partsIn(family: any) {
  const fastenerFiles: string[] = family.fastenerFiles ?? []
  return readdirSync(join(REPO_ROOT, family.dir))
    .filter((n) => /\.stl$/i.test(n))
    .map((n) => ({ name: n, parsed: parsePartName(n) }))
    .filter((p) =>
      family.dimensionless ? !fastenerFiles.includes(p.parsed.filename) : p.parsed.h !== null,
    )
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
  const parts = partsIn(family)

  it('has the declared part count', () => {
    expect(parts).toHaveLength(family.parts)
  })

  it('follows its archetype height rule', () => {
    if (family.perPart) return // no single rule; see the note in families.json
    for (const { name, parsed } of parts) {
      const h = parsed.h as number
      if (family.dimensionless) {
        // No h to key off; the height is simply constant.
        const expected = predict(family.size.heightMm, 0) as number
        expect(Math.abs(expected - sizeOf(family.dir, name).y), name)
          .toBeLessThanOrEqual(HEIGHT_TOLERANCE_MM)
        continue
      }
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
    if (family.perPart || family.dimensionless) return
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
    if (family.dimensionless) {
      // Named rather than inferred, so check the names point at real files.
      const present = readdirSync(join(REPO_ROOT, family.dir)).map((f) => f.replace(/\.stl$/i, ''))
      for (const f of (family.fastenerFiles ?? []) as string[]) {
        expect(present, `${family.id} names ${f}`).toContain(f)
      }
      return
    }
    const loose = readdirSync(join(REPO_ROOT, family.dir)).filter(
      (f) => /\.stl$/i.test(f) && parsePartName(f).h === null,
    )
    // Everything the family can call for, whether every part needs it or only
    // some of them — Retainers ships a lock pin that only its locking
    // variants use.
    const declared = [
      ...((family.fasteners ?? []) as { id: string }[]),
      ...((family.fastenerRules ?? []) as { fasteners: { id: string }[] }[]).flatMap(
        (r) => r.fasteners,
      ),
    ]
      .map((f) => f.id)
      .filter((id, i, all) => all.indexOf(id) === i)
      .sort()

    // A fastener duplicated into a family folder is the repo's own signal.
    expect(loose.map((f) => f.replace(/\.stl$/i, '')).sort(), family.id).toEqual(declared)
  })
})

describe('unsupported parts', () => {
  const rules = (DATA.unsupported ?? []) as { match: string; reason: string }[]

  it('declares at least one rule, with a reason', () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.match.length).toBeGreaterThan(0)
      expect(rule.reason.length).toBeGreaterThan(20)
    }
  })

  it('catches every horizontal-panel part in the library, not just one folder', () => {
    // Fourteen live in the horizontal folder; five more are Locking Retainers
    // filed under Sidepieces/Retainers. Matching on the folder would miss those.
    const matched: string[] = []
    for (const family of FAMILIES) {
      for (const { parsed } of partsIn(family)) {
        const name = parsed.filename.toLowerCase()
        if (rules.some((r) => name.includes(r.match.toLowerCase()))) matched.push(parsed.filename)
      }
    }
    expect(matched).toHaveLength(19)
    expect(matched.filter((n) => /retainer/i.test(n))).toHaveLength(5)
  })

  it('matches case-insensitively, because the library is inconsistent', () => {
    // "for horizontal Wall Control" in one folder, "for Horizontal Wall
    // Control" in the other.
    const rule = rules.find((r) => r.match === 'horizontal wall control')
    expect(rule).toBeDefined()
    expect('3x1 Locking Spacer for horizontal Wall Control'.toLowerCase()).toContain(rule!.match)
    expect('2x1 Locking Retainer for Horizontal Wall Control'.toLowerCase()).toContain(rule!.match)
  })
})

describe('per-part fastener rules', () => {
  it('gives a pin only to the locking retainers', () => {
    // Sidepieces/README.md: a standard retainer needs nothing.
    const family = FAMILIES.find((f) => f.id === 'sidepieces/retainers')
    expect(family.fasteners).toEqual([])
    const rule = (family.fastenerRules as { match: string }[])[0]
    expect(rule?.match).toBe('locking retainer')

    const parts = partsIn(family).map((p) => p.parsed.filename)
    const locking = parts.filter((n) => n.toLowerCase().includes('locking retainer'))
    expect(locking).toHaveLength(10)
    expect(parts.length - locking.length).toBe(5)
  })
})

describe('sidepieces share one mounting interface', () => {
  // The claim the archetype rests on. Scoped to families that inherit the
  // interface rather than declaring their own: a Quickhook is a hook, not a
  // side, and legitimately overrides tang and anchor. Selecting by "declares
  // no anchor of its own" keeps that honest without naming names.
  const raw = (DATA.families as Record<string, unknown>[]).filter(
    (f) => f.archetype === 'sidepiece' && f.anchor === undefined,
  )
  const inheriting = FAMILIES.filter((f) => raw.some((r) => r.id === f.id))

  it('covers most of the sidepiece families', () => {
    expect(inheriting.length).toBeGreaterThanOrEqual(7)
  })

  it('gives them all the same tang', () => {
    const tangs = new Set(inheriting.map((f) => JSON.stringify(f.anchor.tang)))
    expect(tangs.size).toBe(1)
  })

  it('gives them all the same anchor offsets', () => {
    const anchors = new Set(inheriting.map((f) => JSON.stringify(f.anchor.bottomBelowSlotCenterMm)))
    expect(anchors.size).toBe(1)
  })

  it('measures 13.7 mm thick for a side and 27.6 for a centre', () => {
    for (const family of inheriting) {
      for (const { name, parsed } of partsIn(family)) {
        if (parsed.variant !== 'left' && parsed.variant !== 'right') continue
        expect(sizeOf(family.dir, name).z, `${family.id} ${name}`).toBeCloseTo(13.7, 1)
      }
    }
  })
})

/**
 * Ray-cast occupancy along one print axis, at a fixed point on the other two.
 *
 * Enough to section a mesh without a geometry library: count how many
 * triangles a ray crosses beyond a point, and an odd count means inside. Used
 * here to re-derive the arm socket rather than take families.json's word for
 * it.
 */
function solidAt(tris: Float32Array, x: number, y: number, z: number): boolean {
  let crossings = 0
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i]!, ay = tris[i + 1]!, az = tris[i + 2]!
    const bx = tris[i + 3]!, by = tris[i + 4]!, bz = tris[i + 5]!
    const cx = tris[i + 6]!, cy = tris[i + 7]!, cz = tris[i + 8]!
    const d = (by - ay) * (cx - ax) - (bx - ax) * (cy - ay)
    if (Math.abs(d) < 1e-12) continue
    const u = ((y - ay) * (cx - ax) - (x - ax) * (cy - ay)) / d
    const v = ((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / d
    if (u < 0 || v < 0 || u + v > 1) continue
    if (az + u * (bz - az) + v * (cz - az) > z) crossings++
  }
  return crossings % 2 === 1
}

/** Recentred triangles, so every measurement is relative to the bbox min. */
function recentred(dir: string, file: string): { tris: Float32Array; size: Vec3 } {
  const mesh = readStlFile(join(REPO_ROOT, dir, file))
  const { min, size } = mesh.bbox
  const tris = new Float32Array(mesh.positions.length)
  for (let i = 0; i < mesh.positions.length; i += 3) {
    tris[i] = mesh.positions[i]! - min.x
    tris[i + 1] = mesh.positions[i + 1]! - min.y
    tris[i + 2] = mesh.positions[i + 2]! - min.z
  }
  return { tris, size }
}

/** Solid/empty runs along one axis, sampled at 0.05 mm. */
function runs(at: (t: number) => boolean, to: number): [number, number, boolean][] {
  const out: [number, number, boolean][] = []
  let cur = at(0)
  let start = 0
  for (let t = 0.05; t <= to; t += 0.05) {
    const s = at(t)
    if (s !== cur) {
      if (t - start > 0.4) out.push([start, t, cur])
      cur = s
      start = t
    }
  }
  if (to - start > 0.4) out.push([start, to, cur])
  return out
}

describe('the arm socket, re-derived from the meshes', () => {
  const SOCKET = DATA.armSocket
  // Everything below is sampled at 0.05 mm, so a reading is allowed to be a
  // step out either way. Tighter than that would be asserting the sampler,
  // not the models.
  const STEP = 0.05
  const near = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
      2 * STEP,
    )

  // Standard top-arm brackets across three families and both hands. Inverted
  // and Midmount variants are deliberately excluded: they carry the same
  // socket at a different height, which is the one thing the planner cannot
  // model, and families.json says so.
  const BRACKETS: [string, string][] = [
    ['Sidepieces/L_brackets', '2x4 L Bracket Flat Left.stl'],
    ['Sidepieces/L_brackets', '2x2 L Bracket Flat Left.stl'],
    ['Sidepieces/L_brackets', '2x4 L Bracket Flat Right.stl'],
    ['Sidepieces/Angle_brackets', '2x3 Angle Bracket Flat Left.stl'],
    ['Sidepieces/Angle_brackets', '3x2 Angle Bracket Flat Left.stl'],
    ['Sidepieces/Square_brackets', '2x2.25 Square Bracket Flat Left.stl'],
  ]

  it.each(BRACKETS)('%s / %s has its topmost pocket where the rule says', (dir, file) => {
    const { tris, size } = recentred(dir, file)
    // The socket recess sits just in from the tang face. A Right sidepiece
    // mirrors in print-x, so pockets are measured from whichever end clears
    // the lattice by more — that end carries the tang.
    const z = 3.0
    let band: [number, number] | null = null
    let pockets: [number, number, boolean][] = []
    for (let y = size.y - 1; y > 0 && !band; y -= 0.5) {
      const along = runs((t) => solidAt(tris, t, y, z), size.x)
      const found = along.filter(
        ([a, b, s], i) =>
          !s && b - a > 8 && b - a < 12 && along[i - 1]?.[2] === true && along[i + 1]?.[2] === true,
      )
      if (found.length === 0) continue
      pockets = found
      const centre = (found[0]![0] + found[0]![1]) / 2
      const up = runs((t) => solidAt(tris, centre, t, z), size.y)
      const slots = up.filter(
        ([a, b, s], i) =>
          !s && b - a > 2 && b - a < 8 && up[i - 1]?.[2] === true && up[i + 1]?.[2] === true,
      )
      if (slots.length > 0) band = [slots[slots.length - 1]![0], slots[slots.length - 1]![1]]
    }

    expect(band, 'no arm pocket found').not.toBeNull()
    const [floor, ceil] = band!
    near(ceil - floor, SOCKET.pocketHeightMm, 'pocket height')
    near(size.y - floor, SOCKET.pocketFloorBelowSidepieceTopMm, 'floor below top')

    for (const [a, b] of pockets) near(b - a, SOCKET.pocketLengthMm, 'pocket length')
    for (let i = 1; i < pockets.length; i++)
      near(pockets[i]![0] - pockets[i - 1]![0], SOCKET.pitchMm, 'pitch')

    // Depth runs whichever way leaves the bigger clearance before pocket 1.
    const first = pockets[0]![0]
    const last = size.x - pockets[pockets.length - 1]![1]
    near(Math.max(first, last), SOCKET.firstPocketOutFromTangMm, 'first pocket out from tang')
  })

  it("puts a sidepiece's top a fixed 20.35 above its topmost engaged slot", () => {
    // Two independent derivations, which is the point: the odd/even drops and
    // the slot-span height series have to agree, or a shelf cannot be placed
    // without knowing what holds it.
    const sidepiece = DATA.archetypes.sidepiece
    const drop = sidepiece.anchor.bottomBelowSlotCenterMm
    const lip = sidepiece.size.heightMm
    for (const h of [1, 2, 3, 4, 5, 6]) {
      const odd = h % 2 === 1
      const engaged = Math.ceil(h / 2)
      // The Flats series: 34.90, 57.20, 85.70, 108.00, 136.50 — a slot span
      // plus the lip that alternates with parity.
      const height = slotSpanHeightMm(engaged) + (odd ? lip.lipOddMm : lip.lipEvenMm)
      const topAboveAnchorSlot = height - (odd ? drop.odd : drop.even)
      const topAboveTopSlot = topAboveAnchorSlot - (engaged - 1) * SLOT_ROW_PITCH_MM
      expect(topAboveTopSlot, `h=${h}`).toBeCloseTo(SOCKET.sidepieceTopAboveTopSlotCenterMm, 2)
    }
  })

  it('finds the same rib lattice on every family declared to seat in it', () => {
    const seating = (DATA.families as Record<string, any>[]).filter(
      (f) => f.anchor?.seatsInArmSocket !== undefined,
    )
    expect(seating.length).toBeGreaterThanOrEqual(1)

    for (const family of seating) {
      const { bandFloorMm, bandFirstOffsetMm } = family.anchor.seatsInArmSocket
      const parts = partsIn(family)
      const { name } = parts[0]!
      const { tris, size } = recentred(family.dir, name)

      // Probe just in from the width edge, inside the band's own thickness.
      const bands = runs(
        (t) => solidAt(tris, 1.5, t, bandFloorMm + 1.5),
        size.y,
      ).filter(([, , s]) => s)

      expect(bands.length, `${family.id}: no rib lattice`).toBeGreaterThanOrEqual(2)
      near(bands[0]![0], bandFirstOffsetMm, `${family.id} first band`)
      for (let i = 1; i < bands.length; i++)
        near(bands[i]![0] - bands[i - 1]![0], SOCKET.pitchMm, `${family.id} pitch`)
      // A rib is 9.8 long against a 10.0 pocket: 0.1 mm of clearance a side.
      for (const [a, b] of bands)
        near(b - a, SOCKET.pocketLengthMm - 0.2, `${family.id} band length`)
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
