/**
 * Placement audit.
 *
 * Reviewing 541 parts by eye is both slow and unreliable — a part that is
 * 25 mm too tall looks much like one that is right. So instead of looking at
 * every part, check every part against the rules its family claims, and look
 * only at what fails.
 *
 * The most productive check is transposition: if a part's measured height
 * matches the rule for its *width* better than for its height, the two
 * numbers in its name are the wrong way round. That is a real and repeated
 * fault in the community-contributed hooks.
 *
 *   npm run audit --workspace @ddd-planner/indexer
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { boundsSize, parsePartName, rotateBounds, turnedAboutZ } from '@ddd-planner/core'
import { REPO_ROOT, loadOverrides, resolvedFamilies } from './assembly'
import { readStlFile } from './stl'

const CENTERPIECE_HEIGHT = (n: number) => 25.4 * n - 0.2
const FLATS_HEIGHT: Record<number, number> = {
  1: 34.9, 2: 57.2, 3: 85.7, 4: 108, 5: 136.5, 6: 158.8, 7: 187.3, 8: 209.6,
}

/** The frame the audit measures in: print axes, before any family map. */
const PRINT_AXES = { x: '+x', y: '+y', z: '+z' } as const

export interface Finding {
  readonly part: string
  readonly family: string
  readonly kind: string
  readonly h: number | null
  readonly w: number | null
  readonly sizeMm: { x: number; y: number; z: number }
  readonly issue: string
  readonly detail: string
  readonly suggest?: Record<string, number>
}

/** How far a measured height is from what a given unit count predicts. */
function heightError(kind: string, units: number, measured: number): number {
  const expected = kind === 'sidepiece' ? FLATS_HEIGHT[units] : CENTERPIECE_HEIGHT(units)
  return expected === undefined ? Number.POSITIVE_INFINITY : Math.abs(expected - measured)
}

/**
 * `applyOverrides` is what makes this a regression check rather than a one-off
 * report: with corrections applied, anything still listed is either a genuine
 * outstanding problem or a part whose bounding box legitimately exceeds its
 * mounting plate.
 */
export function auditLibrary(applyOverrides = true): Finding[] {
  const findings: Finding[] = []
  const overrides = applyOverrides ? loadOverrides() : new Map()

  for (const family of resolvedFamilies()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = family as any
    const fastenerFiles: string[] = rule.fastenerFiles ?? []

    for (const file of readdirSync(join(REPO_ROOT, rule.dir)).filter((f) => /\.stl$/i.test(f))) {
      const named = parsePartName(file)
      if (rule.dimensionless ? fastenerFiles.includes(named.filename) : named.h === null) continue
      if (rule.dimensionless) continue

      const fix = overrides.get(named.filename)
      const parsed = fix ? { ...named, h: fix.h ?? named.h, w: fix.w ?? named.w } : named

      // A mesh drawn round from its family reads as a name disagreement here,
      // because print Y stops being the dimension the name calls height. Turn
      // it back before measuring and the two numbers land where they belong —
      // which is the second dimension that confirms the turn.
      const b = readStlFile(join(REPO_ROOT, rule.dir, file)).bbox
      const sizeMm = fix?.turnZDeg
        ? boundsSize(rotateBounds(turnedAboutZ(PRINT_AXES, fix.turnZDeg), b))
        : { x: b.size.x, y: b.size.y, z: b.size.z }
      const h = parsed.h as number
      const w = parsed.w as number
      const kind = rule.kind as string
      const common = { part: parsed.filename, family: rule.id as string, kind, h, w, sizeMm }

      const asNamed = heightError(kind, h, sizeMm.y)
      const asSwapped = heightError(kind, w, sizeMm.y)

      // Transposed dimensions: the height fits the *width* number instead.
      if (asSwapped < 0.2 && asNamed > 1) {
        findings.push({
          ...common,
          issue: 'dimensions transposed',
          detail: `height ${sizeMm.y.toFixed(1)} matches h=${w} (${
            kind === 'sidepiece' ? FLATS_HEIGHT[w] : CENTERPIECE_HEIGHT(w)
          }), not h=${h}`,
          suggest: { h: w, w: h },
        })
        continue
      }

      if (asNamed <= 0.2) continue

      // Height is off but not by a clean swap. Does another unit count fit?
      let best: { units: number; error: number } | null = null
      for (let units = 1; units <= 10; units++) {
        const error = heightError(kind, units, sizeMm.y)
        if (!best || error < best.error) best = { units, error }
      }

      if (best && best.error <= 0.2 && best.units !== h) {
        findings.push({
          ...common,
          issue: 'height disagrees with name',
          detail: `height ${sizeMm.y.toFixed(1)} matches h=${best.units}, name says h=${h}`,
          suggest: { h: best.units },
        })
      } else {
        findings.push({
          ...common,
          issue: 'height matches no unit count',
          detail: `height ${sizeMm.y.toFixed(1)}; nearest rule is h=${best?.units} off by ${best?.error.toFixed(1)}`,
        })
      }
    }
  }

  return findings
}
