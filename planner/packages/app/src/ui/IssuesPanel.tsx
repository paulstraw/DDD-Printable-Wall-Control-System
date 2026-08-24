import { useMemo } from 'react'
import { type IssueKind, type IssuePart, findIssues } from '@ddd-planner/core'
import { useStore } from '../store'

const LABEL: Record<IssueKind, string> = {
  overlap: 'Overlap',
  'height-mismatch': 'Mismatch',
  unmounted: 'Unmounted',
  unsupported: 'Horizontal',
}

/**
 * Warnings, never refusals.
 *
 * Clicking one selects the parts it is about, because "which of my forty
 * parts is this?" is the first thing anyone asks. Dismissing hides it for
 * the session; the count of what was dismissed stays visible so the panel
 * never quietly becomes a lie about a clean wall.
 */
export function IssuesPanel() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const dismissed = useStore((s) => s.dismissedIssues)
  const dismissIssue = useStore((s) => s.dismissIssue)
  const restoreIssues = useStore((s) => s.restoreIssues)
  const select = useStore((s) => s.select)

  const issues = useMemo(() => {
    if (!catalog) return []
    const parts = new Map<string, IssuePart>(
      catalog.parts.map((p) => [
        p.id,
        {
          name: p.name,
          h: p.h,
          role: p.role,
          supported: p.supported,
          ...(p.unsupportedReason ? { unsupportedReason: p.unsupportedReason } : {}),
          placement: p.placement,
          sizeMm: p.sizeMm,
        },
      ]),
    )
    return findIssues(placements, parts)
  }, [catalog, placements])

  const hiddenCount = issues.filter((issue) => dismissed.includes(issue.id)).length
  const shown = issues.filter((issue) => !dismissed.includes(issue.id))

  if (issues.length === 0) return null

  return (
    <section className="issues">
      <div className="issues-head">
        <h2>
          {shown.length > 0
            ? `${shown.length} issue${shown.length === 1 ? '' : 's'}`
            : 'No issues showing'}
        </h2>
        {hiddenCount > 0 ? (
          <button className="ghost-button" onClick={restoreIssues}>
            Show {hiddenCount} dismissed
          </button>
        ) : null}
      </div>

      <ul>
        {shown.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              className="issue"
              onClick={() => {
                select(issue.placementIds[0] ?? null)
                for (const id of issue.placementIds.slice(1)) select(id, 'add')
              }}
              title={issue.detail ?? 'Select the parts involved'}
            >
              <span className={`tag ${issue.kind}`}>{LABEL[issue.kind]}</span>
              <span className="issue-text">{issue.message}</span>
            </button>
            <button
              type="button"
              className="issue-dismiss"
              onClick={() => dismissIssue(issue.id)}
              aria-label="Dismiss"
              title="Dismiss — nothing is blocked either way"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
