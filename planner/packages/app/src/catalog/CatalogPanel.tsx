import { useMemo, useState } from 'react'
import { collectFacets, searchParts } from '@ddd-planner/core'
import { useStore } from '../store'
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
  const dragging = useStore((s) => s.dragging)

  const [query, setQuery] = useState('')
  const [families, setFamilies] = useState<string[]>([])
  const [variants, setVariants] = useState<(string | null)[]>([])
  const [heights, setHeights] = useState<number[]>([])

  const parts = catalog?.parts ?? []
  const facets = useMemo(() => collectFacets(parts), [parts])
  const results = useMemo(
    () => searchParts(parts, query, { families, variants, heights }),
    [parts, query, families, variants, heights],
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
        </p>
      </div>

      {error ? <p className="catalog-error">{error}</p> : null}

      <ul className="parts">
        {results.map((part) => (
          <li key={part.id}>
            <button
              type="button"
              className={
                dragging?.kind === 'part' && dragging.partId === part.id
                  ? 'part dragging'
                  : 'part'
              }
              onPointerDown={() => beginPartDrag(part.id)}
              title={
                part.unsupportedReason
                  ? `${part.name} — ${part.unsupportedReason}`
                  : `${part.name} — drag onto the wall`
              }
            >
              <img src={`${PARTS_BASE}${part.thumb}`} alt="" width={44} height={44} draggable={false} />
              <span className="part-name">{part.name}</span>
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
