/**
 * Phase-1 spike check.
 *
 * Places `3x0 Flat Left` + `3x3 Spacer blank` + `3x0 Flat Right` using the
 * rules exactly as they ship in data/families.json, and asks the only
 * question that matters: do the sockets face the centerpiece, and does each
 * tab reach the groove cut for it?
 *
 * Renders front and top views so the answer can be looked at rather than
 * taken on trust. Exits non-zero if the joint does not close.
 *
 *   npm run spike --workspace @ddd-planner/indexer
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Vec3, applyMatrix, slotColumnX, slotRowCenterZ } from '@ddd-planner/core'
import { PLANNER_ROOT, type Placed, assessJoint, buildPhase1Joint } from './assembly'

const OUT = process.env.SPIKE_OUT ?? join(PLANNER_ROOT, 'spike.svg')
const COL = 2
const ROW = 2
const WIDTH_UNITS = 3

const joint = buildPhase1Joint(WIDTH_UNITS, COL, slotRowCenterZ(ROW))
const verdict = assessJoint(joint)
const parts: Placed[] = [joint.left, joint.centre, joint.right]

const mm = (n: number) => n.toFixed(2).padStart(7)

console.log('Spike check — rules as they ship in data/families.json\n')
console.log(`  ${joint.left.name} + ${joint.centre.name} + ${joint.right.name}`)
console.log(`  slot column ${COL}, row ${ROW}, ${WIDTH_UNITS} columns apart\n`)

for (const [label, part] of [['left', joint.left], ['right', joint.right]] as const) {
  const g = part.groove!
  console.log(
    `  ${label.padEnd(5)} body ${mm(part.bounds.min.x)} ..${mm(part.bounds.max.x)}` +
      `   socket ${mm(g.min.x)} ..${mm(g.max.x)}`,
  )
}
console.log(
  `  blank body ${mm(joint.centre.bounds.min.x)} ..${mm(joint.centre.bounds.max.x)}` +
    `   (slot span ${mm(slotColumnX(COL))} ..${mm(slotColumnX(COL + WIDTH_UNITS))})`,
)
console.log('')
console.log(`  sockets face the centerpiece: ${verdict.socketsFaceEachOther ? 'yes' : 'NO'}`)
console.log(
  `  tab into left socket   X ${mm(verdict.intoLeftSocket.x)}  Y ${mm(verdict.intoLeftSocket.y)}  Z ${mm(verdict.intoLeftSocket.z)}`,
)
console.log(
  `  tab into right socket  X ${mm(verdict.intoRightSocket.x)}  Y ${mm(verdict.intoRightSocket.y)}  Z ${mm(verdict.intoRightSocket.z)}`,
)

const seated =
  verdict.socketsFaceEachOther &&
  verdict.intoLeftSocket.x > 1 &&
  verdict.intoLeftSocket.y > 1 &&
  verdict.intoRightSocket.x > 1 &&
  verdict.intoRightSocket.y > 1

console.log(`\n  => ${seated ? 'THE JOINT CLOSES' : 'THE JOINT DOES NOT CLOSE'}\n`)

// ---------------------------------------------------------------- render

const COLOURS = ['#c1440e', '#2a6f97', '#6a994e']

function view(project: (p: Vec3) => { u: number; v: number }, title: string) {
  const groups: string[] = []
  let lo = { u: Infinity, v: Infinity }
  let hi = { u: -Infinity, v: -Infinity }

  parts.forEach((part, i) => {
    const p = part.mesh.positions
    const tris: string[] = []
    for (let t = 0; t < p.length; t += 9) {
      const pts: string[] = []
      for (const j of [0, 3, 6]) {
        const w = applyMatrix(part.matrix, { x: p[t + j]!, y: p[t + j + 1]!, z: p[t + j + 2]! })
        const q = project(w)
        lo = { u: Math.min(lo.u, q.u), v: Math.min(lo.v, q.v) }
        hi = { u: Math.max(hi.u, q.u), v: Math.max(hi.v, q.v) }
        pts.push(`${q.u.toFixed(2)},${q.v.toFixed(2)}`)
      }
      tris.push(`<polygon points="${pts.join(' ')}"/>`)
    }
    groups.push(
      `<g fill="${COLOURS[i]}" fill-opacity="0.09" stroke="${COLOURS[i]}" stroke-width="0.11" stroke-opacity="0.42">${tris.join('')}</g>`,
    )
  })
  return { body: groups.join('\n'), lo, hi, title }
}

const front = view((p) => ({ u: p.x, v: -p.z }), 'front — X across, Z up')
const top = view((p) => ({ u: p.x, v: -p.y }), 'top — X across, wall behind')

const PAD = 14
const width = Math.max(front.hi.u - front.lo.u, top.hi.u - top.lo.u) + PAD * 2
const height = front.hi.v - front.lo.v + (top.hi.v - top.lo.v) + PAD * 4
const shift = front.hi.v - top.lo.v + PAD * 2

const slotMarks = Array.from({ length: WIDTH_UNITS + 3 }, (_, k) => {
  const x = slotColumnX(COL - 1 + k)
  return `<line x1="${x}" y1="${front.lo.v - 4}" x2="${x}" y2="${front.hi.v + 4}" stroke="#b0a89c" stroke-width="0.35" stroke-dasharray="2 2"/>`
}).join('')

const label = (x: number, y: number, text: string, size = 4) =>
  `<text x="${x}" y="${y}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${size}" fill="#3a3733">${text}</text>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${front.lo.u - PAD} ${front.lo.v - PAD * 1.6} ${width} ${height}" width="${width * 3.2}" height="${height * 3.2}">
<rect x="${front.lo.u - PAD}" y="${front.lo.v - PAD * 1.6}" width="${width}" height="${height}" fill="#faf9f7"/>
${label(front.lo.u, front.lo.v - PAD * 0.6, seated ? 'joint closes — sockets face the centerpiece, both tabs seated' : 'joint does NOT close', 4.6)}
<g>${slotMarks}${front.body}</g>
${label(front.lo.u, front.hi.v + PAD * 0.8, front.title, 3.6)}
<g transform="translate(0 ${shift})">${top.body}</g>
${label(front.lo.u, top.hi.v + shift + PAD * 0.8, top.title, 3.6)}
</svg>`

writeFileSync(OUT, svg)
console.log(`  rendered -> ${OUT}`)

if (!seated) process.exitCode = 1
