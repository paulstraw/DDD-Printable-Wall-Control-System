import { useEffect } from 'react'
import { useStore } from '../store'

/** Where the indexer writes. Vite's base prefix keeps this right on Pages. */
export const PARTS_BASE = `${import.meta.env.BASE_URL}parts/`

export function useCatalog() {
  const catalog = useStore((s) => s.catalog)
  const error = useStore((s) => s.catalogError)
  const setCatalog = useStore((s) => s.setCatalog)
  const setCatalogError = useStore((s) => s.setCatalogError)

  useEffect(() => {
    if (catalog) return
    let cancelled = false

    fetch(`${PARTS_BASE}index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setCatalog(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // The catalog is a build artefact, so the likeliest cause by far is
        // that nobody has run the indexer yet. Say so.
        setCatalogError(
          `Could not load the part library (${e instanceof Error ? e.message : String(e)}). ` +
            'Run `npm run index --workspace @ddd-planner/indexer`.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [catalog, setCatalog, setCatalogError])

  return { catalog, error }
}
