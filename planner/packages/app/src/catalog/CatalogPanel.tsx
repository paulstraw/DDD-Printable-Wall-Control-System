import { useMemo, useState } from 'react'
import { type RankContext, collectFacets, compatibilityScore, searchParts } from '@ddd-planner/core'
import { partById, useStore } from '../store'
import { AssemblyPanel } from '../ui/AssemblyPanel'
import { PARTS_BASE, useCatalog } from './useCatalog'

/** Family ids are paths; the last segment is what a person recognises. */
function familyLabel(id: string): string {
  const tail = id.split('/').pop() ?? id
  return tail.replace(/_/g, ' ')
}

function Chips<T extends string | number | null>({
  label,
  values,
  selected,
  onToggle,
  format = String,
}: {
  label: string
  values: readonly T[]
  selected: readonly T[]
  onToggle: (value: T) => void
  format?: (value: T) => string
}) {
  if (values.length <= 1) return null
  return (
    <div className="facet">
      <span className="facet-label">{label}</span>
      <div className="chips">
        {values.map((value) => (
          <button
            key={String(value)}
            type="button"
            className={selected.includes(value) ? 'chip on' : 'chip'}
            onClick={() => onToggle(value)}
          >
            {format(value)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CatalogPanel() {
  const { catalog, error } = useCatalog()
  const beginPartDrag = useStore((s) => s.beginPartDrag)
  const cancelDrag = useStore((s) => s.cancelDrag)
  const dragMoved = useStore((s) => s.dragMoved)
  const dragging = useStore((s) => s.dragging)
  const selectedIds = useStore((s) => s.selectedIds)
  const placements = useStore((s) => s.placements)

  const [query, setQuery] = useState('')
  const [families, setFamilies] = useState<string[]>([])
  const [variants, setVariants] = useState<(string | null)[]>([])
  const [heights, setHeights] = useState<number[]>([])

  const parts = catalog?.parts ?? []
  const facets = useMemo(() => collectFacets(parts), [parts])

  // The most recently selected part is what someone is working on — a drop
  // selects what it placed, so this is usually "the thing I just added".
  // Taking the whole selection would need a rule for what a mixed one means,
  // and there is no useful answer.
  const context = useMemo<RankContext | null>(() => {
    const last = selectedIds[selectedIds.length - 1]
    if (!last) return null
    const placement = placements.find((p) => p.id === last)
    const part = partById(catalog, placement?.partId ?? null)
    if (!part) return null
    return { role: part.role, h: part.h, family: part.family, variant: part.variant }
  }, [catalog, placements, selectedIds])

  const contextName = useMemo(() => {
    const last = selectedIds[selectedIds.length - 1]
    const placement = placements.find((p) => p.id === last)
    return partById(catalog, placement?.partId ?? null)?.name ?? null
  }, [catalog, placements, selectedIds])

  const results = useMemo(
    () => searchParts(parts, query, { families, variants, heights }, context),
    [parts, query, families, variants, heights, context],
  )

  function toggle<T>(list: T[], set: (next: T[]) => void, value: T) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  return (
    <aside className="catalog">
      <AssemblyPanel />

      <div className="catalog-head">
        <input
          type="search"
          value={query}
          placeholder="Search parts…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search parts"
        />
        <Chips
          label="Family"
          values={facets.families}
          selected={families}
          onToggle={(v) => toggle(families, setFamilies, v)}
          format={familyLabel}
        />
        <Chips
          label="Variant"
          values={facets.variants}
          selected={variants}
          onToggle={(v) => toggle(variants, setVariants, v)}
          format={(v) => v ?? 'plain'}
        />
        <Chips
          label="Height"
          values={facets.heights}
          selected={heights}
          onToggle={(v) => toggle(heights, setHeights, v)}
        />
        <p className="result-count">
          {error ? 'unavailable' : `${results.length} of ${parts.length} parts`}
          {contextName && !error ? (
            // Say why the order changed. A list that silently reshuffles
            // itself when you click something is unsettling.
            <span className="ranked-for"> · sorted for {contextName}</span>
          ) : null}
        </p>
      </div>

      {error ? <p className="catalog-error">{error}</p> : null}

      <ul
        className="parts"
        onScroll={() => {
          // On a touch screen, pressing a card and swiping is how you scroll
          // this list — and pressing a card is also how you arm one. A scroll
          // is the unambiguous signal that the press was not a pick, so the
          // armed part is put back down rather than waiting to be placed by
          // the next tap on the wall.
          if (dragging && !dragMoved) cancelDrag()
        }}
      >
        {results.map((part) => (
          <li key={part.id}>
            <button
              type="button"
              className={
                dragging?.kind === 'part' && dragging.partId === part.id
                  ? 'part dragging'
                  : 'part'
              }
              onPointerDown={(e) => {
                // Touch pointers are implicitly captured by the element that
                // received the press, so every later `pointermove` would be
                // delivered here instead of to the wall — the drag would
                // never find a slot. Releasing the capture restores normal
                // hit-testing and costs nothing with a mouse.
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
                beginPartDrag(part.id)
              }}
              title={
                part.unsupportedReason
                  ? `${part.name} — ${part.unsupportedReason}`
                  : `${part.name} — drag onto the wall`
              }
            >
              <img src={`${PARTS_BASE}${part.thumb}`} alt="" width={44} height={44} draggable={false} />
              <span className="part-name">{part.name}</span>
              {context && compatibilityScore(part, context) >= 4 ? (
                <span className="tag fits" title={`Goes with ${contextName}`}>
                  fits
                </span>
              ) : null}
              {part.supported === false ? (
                <span className="tag warn" title={part.unsupportedReason}>
                  horizontal
                </span>
              ) : null}
              <span className="part-meta">
                {part.h !== null ? `${part.h}×${part.w}` : '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
