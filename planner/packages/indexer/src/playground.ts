/**
 * An audit wall: every family the centerpiece axis map touches, laid out so a
 * wrong orientation is obvious at a glance.
 *
 * Four bands, because each answers a different question:
 *
 *   1. flat, bare        — which way is the part facing?
 *   2. shelf, bare       — did turning it keep the face that carries the ribs
 *                          underneath?
 *   3. flat, in a joint  — does the tab still reach the socket cut for it?
 *   4. shelf, in a joint — does the rib still sit in the arm pocket?
 *
 * Bands 1 and 2 have no sidepieces on purpose: a joint hides the very faces
 * that say which way a part is pointing.
 *
 * Writes a document in the shipped save format, so it loads through exactly
 * the code a share link does rather than a test-only path.
 *
 *   npm run playground --workspace @ddd-planner/indexer
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_COLORS, type Orientation, type PlacedRef, encodeDocument } from '@ddd-planner/core'
import { PLANNER_ROOT } from './assembly'

const INDEX = join(PLANNER_ROOT, 'packages', 'app', 'public', 'parts', 'index.json')
const OUT = process.env.PLAYGROUND_OUT ?? join(PLANNER_ROOT, 'playground.json')

interface Row {
  readonly id: string
  readonly family: string
  readonly name: string
  readonly h: number | null
  readonly w: number | null
  readonly orientations: Partial<Record<Orientation, unknown>>
}

const catalog = JSON.parse(readFileSync(INDEX, 'utf8')) as { parts: Row[] }
const byId = new Map(catalog.parts.map((p) => [p.id, p]))

/**
 * The families that read `printToWall` off the centerpiece archetype. Listed
 * rather than derived: the point of the audit is to check the ones the change
 * touches, and a derived list would quietly shrink if the change went wrong.
 */
const SUBJECTS: readonly { family: string; prefer?: readonly string[] }[] = [
  { family: 'centerpieces/spacer_blank', prefer: ['3x3 Spacer blank'] },
  { family: 'centerpieces/spacer_perforated', prefer: ['3x3 Spacer perforated'] },
  { family: 'centerpieces/spacer_clip-on', prefer: ['3x3 Spacer clip-on'] },
  { family: 'centerpieces/spacer_blank_flush', prefer: ['3x3 Spacer blank flush'] },
  { family: 'centerpieces/locking_spacer', prefer: ['3x3 Locking Spacer'] },
  { family: 'sidepieces/retainers', prefer: ['3x1 Locking Retainer'] },
  // Hooks are the sharpest orientation tell in the library - a hook that
  // opens downward is unmistakable in a way a symmetric plate never is - so
  // the hook families get specimens chosen rather than ranked.
  { family: 'centerpieces/u_hooks', prefer: ['3x2 1.5in U hook'] },
  { family: 'centerpieces/honeycomb_storage_wall', prefer: ['4x4 Honeycomb Storage Wall'] },
  {
    family: 'centerpieces/locking_spacer_for_horizontal_wall_control',
    prefer: ['3x3 Locking Spacer for horizontal Wall Control'],
  },
  {
    family: 'centerpieces/tool_hooks',
    // The Medium Pliers Rack is here for the same reason a hook is: its six
    // slots have to open into the room, and a rack drawn back to front looks
    // like a solid block from the front and nothing else gives it away. It is
    // one of the three parts in this family that carries a `turnZDeg`.
    prefer: ['2x2 38mm Hammer Hook', '2x3 5x 6mm Box Wrench holder', '4x6 Medium Pliers Rack'],
  },
]

/** A family's specimen: the asked-for part if it exists, else its widest 3-high one. */
function specimensFor(subject: (typeof SUBJECTS)[number]): Row[] {
  const family = catalog.parts.filter((p) => p.family === subject.family)
  if (family.length === 0) throw new Error(`no parts in family ${subject.family}`)

  const named = (subject.prefer ?? []).map((name) => {
    const found = family.find((p) => p.name === name)
    // A silent fallback here would be the worst kind of quiet: the audit
    // would still render, just not of the part anyone meant to look at.
    if (!found) throw new Error(`${subject.family} has no part named ${name}`)
    return found
  })
  if (named.length > 0) return named

  // Deterministic fallback: closest to 3x3, then by name. Small and square
  // keeps the wall readable; a 14-wide specimen tells you nothing extra.
  const near = (p: Row) => Math.abs((p.h ?? 1) - 3) + Math.abs((p.w ?? 1) - 3)
  const ranked = [...family].sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name))
  return [ranked[0] as Row]
}

const columns = (p: Row) => Math.max(1, Math.round(p.w ?? 1))

/** A Flat in the specimen's own height, which is what makes the joint close. */
function flatsFor(p: Row): { left: string; right: string } | null {
  const h = Math.max(1, Math.round(p.h ?? 3))
  const left = `sidepieces-flats-${h}x0-flat-left`
  const right = `sidepieces-flats-${h}x0-flat-right`
  return byId.has(left) && byId.has(right) ? { left, right } : null
}

/**
 * A shelf needs a sidepiece with an arm to drop into, and one that reaches
 * further than the shelf is deep. The 4.25" square bracket clears every
 * specimen here.
 */
const SHELF_LEFT = 'sidepieces-square-brackets-2x4-25-square-bracket-flat-left'
const SHELF_RIGHT = 'sidepieces-square-brackets-2x4-25-square-bracket-flat-right'

const placements: PlacedRef[] = []
let maxCol = 0
const place = (partId: string, col: number, row: number, orientation: Orientation) => {
  placements.push({ partId, col, row, orientation })
  maxCol = Math.max(maxCol, col + columns(byId.get(partId) ?? ({ w: 1 } as Row)))
}

const specimens = SUBJECTS.flatMap(specimensFor)
// Which band a specimen belongs in is the catalog's answer, not a guess:
// tool hooks have no flat orientation at all, so putting one in a flat band
// would draw it turned anyway and quietly misrepresent the row.
const hangsFlat = specimens.filter((p) => p.orientations.flat !== undefined)
const turnable = specimens.filter((p) => p.orientations.shelf !== undefined)

/** Slot rows are 2" apart, so a band every two rows leaves 4" of clear air. */
const BAND = { flatBare: 12, shelfBare: 9, flatJoint: 5, shelfJoint: 2 } as const
const GAP_COLUMNS = 2

function layOut(subjects: readonly Row[], row: number, orientation: Orientation, joint: boolean) {
  let col = 1
  for (const p of subjects) {
    const span = columns(p)
    const sides = joint ? (orientation === 'shelf' ? { left: SHELF_LEFT, right: SHELF_RIGHT } : flatsFor(p)) : null
    if (sides) {
      place(sides.left, col, row, 'flat')
      place(sides.right, col + span, row, 'flat')
    }
    place(p.id, col, row, orientation)
    col += span + 1 + GAP_COLUMNS
  }
}

layOut(hangsFlat, BAND.flatBare, 'flat', false)
layOut(turnable, BAND.shelfBare, 'shelf', false)
layOut(hangsFlat, BAND.flatJoint, 'flat', true)
layOut(turnable, BAND.shelfJoint, 'shelf', true)

const state = {
  // One column of margin each side, and enough height to clear the top band.
  widthIn: maxCol + 2,
  heightIn: (BAND.flatBare + 1) * 2 + 2,
  placements,
  assemblies: [],
  // An audit wall is for measuring parts, not looking at.
  colors: DEFAULT_COLORS,
}

writeFileSync(OUT, encodeDocument(state, { pretty: true }))

console.log(`Audit wall — ${specimens.length} specimens, ${placements.length} placements`)
for (const p of specimens) {
  const turns = (['flat', 'shelf'] as const).filter((o) => p.orientations[o] !== undefined).join(' + ')
  console.log(`  ${p.name.padEnd(46)} ${p.family.padEnd(52)} ${turns}`)
}
console.log(`\n  wall ${state.widthIn}" x ${state.heightIn}"`)
console.log(`  written -> ${OUT}`)
