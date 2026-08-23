/**
 * Phase-1 spike check.
 *
 * Places `3x0 Flat Left` + a centerpiece + `3x0 Flat Right` with the real
 * rules and asks the only question that matters at this stage: do the sockets
 * face the centerpiece, and does each tab land in the groove cut for it?
 *
 * Writes an SVG of the front and top views so the answer can be looked at
 * rather than taken on trust.
 *
 *   npm run spike --workspace @ddd-planner/indexer
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type AxisMap,
  type Bounds,
  type Vec3,
  applyMatrix,
  placeBounds,
  slotColumnX,
  slotRowCenterZ,
} from '@ddd-planner/core'
import { type StlMesh, readStlFile } from './stl'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const OUT = process.env.SPIKE_OUT ?? join(REPO_ROOT, 'planner', 'spike.svg')

/** Feature boxes measured off the meshes, in each part's own print space. */
const GROOVE_LEFT: Bounds = { min: { x: 12.6, y: 3.1, z: 0 }, max: { x: 16.8, y: 79.1, z: 4.2 } }
const GROOVE_RIGHT: Bounds = { min: { x: 1.9, y: 3.1, z: 0 }, max: { x: 6.1, y: 79.1, z: 4.2 } }
/**
 * The groove boxes above are relative to the part's own bbox minimum, because
 * that is how they were measured. The placement matrix works in the STL's
 * absolute print coordinates, so they have to be rebased before use.
 */
function absolute(relative: Bounds, src: Bounds): Bounds {
  return {
    min: { x: relative.min.x + src.min.x, y: relative.min.y + src.min.y, z: relative.min.z + src.min.z },
    max: { x: relative.max.x + src.min.x, y: relative.max.y + src.min.y, z: relative.max.z + src.min.z },
  }
}

/** The tang is the full part narrowed to the slot-width layer. */
const tangOf = (b: Bounds): Bounds => ({ min: b.min, max: { ...b.max, z: b.min.z + 2.2 } })
/** The blank's tabs are its widest layer, at each end. */
const tabsOf = (b: Bounds): Bounds => ({ min: b.min, max: { ...b.max, z: b.min.z + 2.4 } })

interface Convention {
  readonly label: string
  readonly left: AxisMap
  readonly right: AxisMap
  readonly centerpiece: AxisMap
  /** Wall-Y minimum for each kind — the sign depends on which way Y runs. */
  readonly sidepieceMinY: number
  readonly centerpieceMinY: number
}

const AS_SHIPPED: Convention = {
  label: 'as shipped in families.json  (+Y chosen to point out of the wall)',
  left: { x: '+z', y: '+x', z: '+y' },
  right: { x: '-z', y: '-x', z: '+y' },
  centerpiece: { x: '+x', y: '-z', z: '+y' },
  // Tang behind the wall face, body in front of it.
  sidepieceMinY: -8.5,
  centerpieceMinY: 0,
}

const DOC_CONVENTION: Convention = {
  label: "the design doc's own convention  (Y is depth *into* the wall)",
  left: { x: '-z', y: '-x', z: '+y' },
  right: { x: '+z', y: '+x', z: '+y' },
  centerpiece: { x: '+x', y: '-z', z: '+y' },
  // Same geometry, opposite sign: the body is now at negative Y. Both kinds
  // sit flush at the front face, which is what lands the tab in the groove.
  sidepieceMinY: -10.2,
  centerpieceMinY: -10.2,
}

const boundsOf = (m: StlMesh): Bounds => ({ min: m.bbox.min, max: m.bbox.max })

/** Push a print-space box through a part's placement matrix. */
function through(matrix: readonly number[], box: Bounds): Bounds {
  let lo = { x: Infinity, y: Infinity, z: Infinity }
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = applyMatrix(matrix, { x, y, z })
        lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }
        hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) }
      }
  return { min: lo, max: hi }
}

const centreX = (b: Bounds) => (b.min.x + b.max.x) / 2
const overlap = (a: Bounds, b: Bounds, k: 'x' | 'y' | 'z') =>
  Math.max(0, Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]))

interface Placed {
  readonly name: string
  readonly mesh: StlMesh
  readonly matrix: readonly number[]
  readonly bounds: Bounds
  readonly groove?: Bounds
  readonly tabs?: Bounds
}

/**
 * Place a sidepiece so its tang sits centred in the given slot column, and at
 * the measured height. The tang's own wall-X position after rotation is what
 * decides the shift, so this works whatever the convention turns out to be.
 */
function placeSidepiece(
  name: string,
  mesh: StlMesh,
  map: AxisMap,
  groovePrint: Bounds,
  slotXmm: number,
  bottomZ: number,
  minY: number,
): Placed {
  const src = boundsOf(mesh)
  const trial = placeBounds(src, map, { x: 0, y: 0, z: 0 })
  const tang = through(trial.matrix, tangOf(src))
  const shiftX = slotXmm - centreX(tang)

  const final = placeBounds(src, map, { x: shiftX, y: minY, z: bottomZ })
  return {
    name,
    mesh,
    matrix: final.matrix,
    bounds: final.bounds,
    groove: through(final.matrix, absolute(groovePrint, src)),
  }
}

function placeCenterpiece(
  name: string,
  mesh: StlMesh,
  map: AxisMap,
  leftSlotX: number,
  widthUnits: number,
  bottomZ: number,
  minY: number,
): Placed {
  const src = boundsOf(mesh)
  const width = src.max.x - src.min.x
  const span = 25.4 * widthUnits
  const final = placeBounds(src, map, {
    x: leftSlotX + (span - width) / 2,
    y: minY,
    z: bottomZ,
  })
  return { name, mesh, matrix: final.matrix, bounds: final.bounds, tabs: through(final.matrix, tabsOf(src)) }
}

// ---------------------------------------------------------------- run

const COL = 2
const ROW = 2
const WIDTH_UNITS = 3
const slotZ = slotRowCenterZ(ROW)

const left = readStlFile(join(REPO_ROOT, 'Sidepieces/Flats/3x0 Flat Left.stl'))
const right = readStlFile(join(REPO_ROOT, 'Sidepieces/Flats/3x0 Flat Right.stl'))
const clip = readStlFile(join(REPO_ROOT, 'Centerpieces/Spacer_clip-on/2x3 Spacer clip-on.stl'))
const blank = readStlFile(join(REPO_ROOT, 'Centerpieces/Spacer_blank/3x3 Spacer blank.stl'))

console.log(`Spike check — 3x0 Flat Left + centerpiece + 3x0 Flat Right`)
console.log(`slot column ${COL}, row ${ROW}, ${WIDTH_UNITS} columns apart\n`)

let winner: { convention: Convention; parts: Placed[] } | null = null

for (const c of [AS_SHIPPED, DOC_CONVENTION]) {
  console.log(`${c.label}`)

  const l = placeSidepiece('3x0 Flat Left', left, c.left, GROOVE_LEFT, slotColumnX(COL), slotZ - 14.55, c.sidepieceMinY)
  const r = placeSidepiece(
    '3x0 Flat Right', right, c.right, GROOVE_RIGHT, slotColumnX(COL + WIDTH_UNITS), slotZ - 14.55, c.sidepieceMinY,
  )
  const b = placeCenterpiece('3x3 Spacer blank', blank, c.centerpiece, slotColumnX(COL), WIDTH_UNITS, slotZ - 11.45, c.centerpieceMinY)

  const span = { lo: slotColumnX(COL), hi: slotColumnX(COL + WIDTH_UNITS) }
  const leftFacesIn = centreX(l.groove as Bounds) > centreX(l.bounds)
  const rightFacesIn = centreX(r.groove as Bounds) < centreX(r.bounds)

  console.log(`  left  body ${l.bounds.min.x.toFixed(1)}..${l.bounds.max.x.toFixed(1)}   socket ${(l.groove as Bounds).min.x.toFixed(1)}..${(l.groove as Bounds).max.x.toFixed(1)}   faces ${leftFacesIn ? '+X (inward)' : '-X (outward)'}`)
  console.log(`  right body ${r.bounds.min.x.toFixed(1)}..${r.bounds.max.x.toFixed(1)}   socket ${(r.groove as Bounds).min.x.toFixed(1)}..${(r.groove as Bounds).max.x.toFixed(1)}   faces ${rightFacesIn ? '-X (inward)' : '+X (outward)'}`)
  console.log(`  blank      ${b.bounds.min.x.toFixed(1)}..${b.bounds.max.x.toFixed(1)}   (slot span ${span.lo.toFixed(1)}..${span.hi.toFixed(1)})`)

  const tabs = b.tabs as Bounds
  const lx = overlap(tabs, l.groove as Bounds, 'x')
  const ly = overlap(tabs, l.groove as Bounds, 'y')
  const lz = overlap(tabs, l.groove as Bounds, 'z')
  console.log(`  left socket   Y ${(l.groove as Bounds).min.y.toFixed(1)}..${(l.groove as Bounds).max.y.toFixed(1)}`)
  console.log(`  blank tabs    Y ${tabs.min.y.toFixed(1)}..${tabs.max.y.toFixed(1)}`)
  console.log(`  tab into left socket:  X ${lx.toFixed(2)}  Y ${ly.toFixed(2)}  Z ${lz.toFixed(2)}`)

  const mates = leftFacesIn && rightFacesIn
  console.log(`  => ${mates ? 'SOCKETS FACE THE CENTERPIECE' : 'SOCKETS FACE OUTWARD — does not mate'}\n`)
  if (mates && !winner) winner = { convention: c, parts: [l, b, r] }
}

// ---------------------------------------------------------------- render

const chosen = winner ?? {
  convention: AS_SHIPPED,
  parts: [
    placeSidepiece('3x0 Flat Left', left, AS_SHIPPED.left, GROOVE_LEFT, slotColumnX(COL), slotZ - 14.55, AS_SHIPPED.sidepieceMinY),
    placeCenterpiece('2x3 Spacer clip-on', clip, AS_SHIPPED.centerpiece, slotColumnX(COL), WIDTH_UNITS, slotZ - 36.85, AS_SHIPPED.centerpieceMinY),
    placeSidepiece('3x0 Flat Right', right, AS_SHIPPED.right, GROOVE_RIGHT, slotColumnX(COL + WIDTH_UNITS), slotZ - 14.55, AS_SHIPPED.sidepieceMinY),
  ],
}

const COLOURS = ['#c1440e', '#2a6f97', '#6a994e']

function view(parts: Placed[], project: (p: Vec3) => { u: number; v: number }, title: string) {
  const polys: string[] = []
  let lo = { u: Infinity, v: Infinity }
  let hi = { u: -Infinity, v: -Infinity }

  parts.forEach((part, i) => {
    const p = part.mesh.positions
    const pts: string[] = []
    for (let t = 0; t < p.length; t += 9) {
      const tri: string[] = []
      for (const j of [0, 3, 6]) {
        const w = applyMatrix(part.matrix, { x: p[t + j]!, y: p[t + j + 1]!, z: p[t + j + 2]! })
        const q = project(w)
        lo = { u: Math.min(lo.u, q.u), v: Math.min(lo.v, q.v) }
        hi = { u: Math.max(hi.u, q.u), v: Math.max(hi.v, q.v) }
        tri.push(`${q.u.toFixed(2)},${q.v.toFixed(2)}`)
      }
      pts.push(`<polygon points="${tri.join(' ')}"/>`)
    }
    polys.push(
      `<g fill="${COLOURS[i]}" fill-opacity="0.10" stroke="${COLOURS[i]}" stroke-width="0.12" stroke-opacity="0.45">${pts.join('')}</g>`,
    )
  })
  return { polys: polys.join('\n'), lo, hi, title }
}

const front = view(chosen.parts, (p) => ({ u: p.x, v: -p.z }), 'front (X across, Z up)')
const top = view(chosen.parts, (p) => ({ u: p.x, v: -p.y }), 'top (X across, Y into wall)')

const PAD = 12
const w = Math.max(front.hi.u - front.lo.u, top.hi.u - top.lo.u) + PAD * 2
const h1 = front.hi.v - front.lo.v
const h2 = top.hi.v - top.lo.v
const h = h1 + h2 + PAD * 4

const slotMarks = Array.from({ length: 5 }, (_, k) => {
  const x = slotColumnX(COL - 1 + k)
  return `<line x1="${x}" y1="${-front.hi.v - PAD}" x2="${x}" y2="${-front.lo.v + PAD}" stroke="#888" stroke-width="0.3" stroke-dasharray="2 2"/>`
}).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${front.lo.u - PAD} ${front.lo.v - PAD} ${w} ${h}" width="${w * 3}" height="${h * 3}">
<rect x="${front.lo.u - PAD}" y="${front.lo.v - PAD}" width="${w}" height="${h}" fill="#faf9f7"/>
<text x="${front.lo.u}" y="${front.lo.v - 3}" font-family="sans-serif" font-size="4" fill="#333">${chosen.convention.label}</text>
<g>${slotMarks}${front.polys}</g>
<text x="${front.lo.u}" y="${front.hi.v + PAD}" font-family="sans-serif" font-size="4" fill="#333">${front.title}</text>
<g transform="translate(0 ${front.hi.v - top.lo.v + PAD * 2})">${top.polys}
<text x="${top.lo.u}" y="${top.hi.v + PAD * 0.6}" font-family="sans-serif" font-size="4" fill="#333">${top.title}</text></g>
</svg>`

writeFileSync(OUT, svg)
console.log(`rendered ${chosen.parts.map((p) => p.name).join(' + ')}`)
console.log(`  -> ${OUT}`)
