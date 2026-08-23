import { auditLibrary } from './audit'

const raw = auditLibrary(false)
const findings = auditLibrary()
console.log(`${raw.length} findings before overrides, ${findings.length} after — ${raw.length - findings.length} corrected\n`)
const byIssue = new Map<string, typeof findings>()
for (const f of findings) {
  if (!byIssue.has(f.issue)) byIssue.set(f.issue, [])
  byIssue.get(f.issue)!.push(f)
}

for (const [issue, group] of [...byIssue].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`## ${issue} — ${group.length}`)
  const byFamily = new Map<string, number>()
  for (const f of group) byFamily.set(f.family, (byFamily.get(f.family) ?? 0) + 1)
  console.log(`   families: ${[...byFamily].map(([f, n]) => `${f.split('/').pop()} ${n}`).join(', ')}`)
  for (const f of group.slice(0, 14)) console.log(`   ${f.part.slice(0, 48).padEnd(49)} ${f.detail}`)
  if (group.length > 14) console.log(`   … and ${group.length - 14} more`)
  console.log()
}
