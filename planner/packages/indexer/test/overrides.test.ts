import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePartName } from '@ddd-planner/core'
import { PLANNER_ROOT, REPO_ROOT, loadOverrides, resolvedFamilies } from '../src/assembly'
import { auditLibrary } from '../src/audit'

const FILE = JSON.parse(
  readFileSync(join(PLANNER_ROOT, 'data', 'overrides.json'), 'utf8'),
) as {
  parts: { name: string; h?: number; w?: number; reason: string }[]
  notCorrected: { name: string; reason: string }[]
}

/** Every part name in the library, so an override cannot name a ghost. */
const ALL_NAMES = new Set<string>()
for (const family of resolvedFamilies()) {
  for (const file of readdirSync(join(REPO_ROOT, family.dir as string))) {
    if (/\.stl$/i.test(file)) ALL_NAMES.add(parsePartName(file).filename)
  }
}

describe('overrides.json', () => {
  it('names only parts that exist', () => {
    for (const entry of [...FILE.parts, ...FILE.notCorrected]) {
      expect(ALL_NAMES.has(entry.name), `${entry.name} is not in the library`).toBe(true)
    }
  })

  it('gives a reason for every entry', () => {
    for (const entry of [...FILE.parts, ...FILE.notCorrected]) {
      expect(entry.reason.length, entry.name).toBeGreaterThan(20)
    }
  })

  it('actually changes something', () => {
    for (const entry of FILE.parts) {
      const named = parsePartName(entry.name)
      const changed = (entry.h !== undefined && entry.h !== named.h) ||
        (entry.w !== undefined && entry.w !== named.w)
      expect(changed, `${entry.name} overrides nothing`).toBe(true)
    }
  })

  it('stays a small fraction of the library', () => {
    // Risk 1 says escalate past ~10%. This is the number that would trigger it.
    const share = FILE.parts.length / ALL_NAMES.size
    expect(share).toBeLessThan(0.1)
  })

  it('loads into a map keyed by part name', () => {
    const map = loadOverrides()
    expect(map.size).toBe(FILE.parts.length)
    for (const entry of FILE.parts) expect(map.get(entry.name)?.reason).toBe(entry.reason)
  })
})

describe('the audit, with overrides applied', () => {
  const findings = auditLibrary()

  it('leaves no uncorrected name disagreement except the documented one', () => {
    // "height matches no unit count" is a different problem — a bounding box
    // that legitimately exceeds its mounting plate — and is not an override.
    const naming = findings.filter(
      (f) => f.issue === 'dimensions transposed' || f.issue === 'height disagrees with name',
    )
    const excused = new Set(FILE.notCorrected.map((n) => n.name))
    const unexplained = naming.filter((f) => !excused.has(f.part))

    expect(
      unexplained.map((f) => `${f.part}: ${f.detail}`),
      'a part disagrees with its name and is neither corrected nor excused',
    ).toEqual([])
  })

  it('finds nothing at all outside the community hooks', () => {
    // The seventeen curated families follow their rules exactly. This is the
    // strongest standing evidence that the parametric model holds.
    const elsewhere = findings.filter((f) => f.family !== 'centerpieces/tool_hooks')
    expect(elsewhere.map((f) => `${f.family}/${f.part}`)).toEqual([])
  })

  it('corrects ten parts', () => {
    const before = auditLibrary(false).length
    expect(before - findings.length).toBe(FILE.parts.length)
  })
})
