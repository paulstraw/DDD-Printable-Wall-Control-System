import { useEffect, useRef, useState } from 'react'
import { decodeDocument, encodeDocument, unknownPartIds } from '@ddd-planner/core'
import { loadLocal, readShareFragment, saveLocal } from './persistence'
import { useStore } from './store'

/**
 * Restore a wall on arrival, then keep saving it.
 *
 * Two rules that are easy to get wrong:
 *
 * 1. **Nothing is saved until something has been loaded.** Autosaving from
 *    the first render would write the empty default over a real saved wall
 *    before the restore had a chance to run.
 * 2. **A share link is consumed, not adopted.** It loads once and then the
 *    fragment is stripped from the URL. Leaving it would mean a reload
 *    silently threw away everything the visitor had done since — the link
 *    is an import, not a live document.
 *
 * Restoring waits for the catalog so that parts a link names but this
 * library does not have can be reported rather than vanishing.
 */
export function usePersistence(): [note: string | null, dismiss: () => void] {
  const catalog = useStore((s) => s.catalog)
  const hydrate = useStore((s) => s.hydrate)
  const snapshot = useStore((s) => s.snapshot)

  const placements = useStore((s) => s.placements)
  const assemblies = useStore((s) => s.assemblies)
  const widthIn = useStore((s) => s.widthIn)
  const heightIn = useStore((s) => s.heightIn)

  const [note, setNote] = useState<string | null>(null)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current || !catalog) return
    restored.current = true

    const fromLink = readShareFragment(window.location.hash)
    const text = fromLink ?? loadLocal()
    if (!text) return

    const result = decodeDocument(text)
    if (!result.ok) {
      setNote(fromLink ? `That share link could not be read. ${result.error}` : null)
      return
    }

    // The beginning: nothing preceded it, so it is not somewhere undo can
    // take you back from.
    hydrate(result.state, { beginning: true })

    if (fromLink) {
      // Consume the link so editing and reloading does not revert.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    const missing = unknownPartIds(result.state, new Set(catalog.parts.map((p) => p.id)))
    if (missing.length > 0) {
      setNote(
        `${missing.length} part${missing.length === 1 ? '' : 's'} in that wall ${
          missing.length === 1 ? 'is' : 'are'
        } not in this library and will not appear.`,
      )
    }
  }, [catalog, hydrate])

  useEffect(() => {
    if (!restored.current) return
    const state = snapshot()
    // An empty wall is still worth writing — it is how "I cleared it" is
    // remembered rather than being undone by the next reload.
    saveLocal(encodeDocument(state))
  }, [placements, assemblies, widthIn, heightIn, snapshot])

  // The note describes what happened at load. It stays until waved away
  // rather than guessing when it has stopped being interesting.
  return [note, () => setNote(null)]
}

/** Whether there is anything worth putting in a link or a file. */
export function useHasContent(): boolean {
  return useStore((s) => s.placements.length > 0 || s.assemblies.length > 0)
}
