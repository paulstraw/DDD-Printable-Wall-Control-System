import { useRef } from 'react'
import { decodeDocument, encodeDocument, unknownPartIds } from '@ddd-planner/core'
import { Toolbar } from '../components'
import { downloadJson, shareFragmentFor } from '../persistence'
import { useStore } from '../store'
import { useHasContent } from '../usePersistence'

/**
 * Share, export and import.
 *
 * All three move the same document; only the vehicle differs.
 */
export function WallActions() {
  const snapshot = useStore((s) => s.snapshot)
  const hydrate = useStore((s) => s.hydrate)
  const catalog = useStore((s) => s.catalog)
  const hasContent = useHasContent()

  // The header has one slot for a message and three components with
  // something to put in it, so the message lives in the store.
  const status = useStore((s) => s.status)
  const setStatus = useStore((s) => s.setStatus)
  const file = useRef<HTMLInputElement>(null)

  async function share() {
    const url = window.location.origin + window.location.pathname + shareFragmentFor(
      encodeDocument(snapshot()),
    )
    try {
      await navigator.clipboard.writeText(url)
      setStatus(`Link copied · ${(url.length / 1024).toFixed(1)} kB`)
    } catch {
      // Clipboard permission can be refused; putting the link in the address
      // bar still lets someone copy it by hand.
      window.location.hash = shareFragmentFor(encodeDocument(snapshot()))
      setStatus('Link is in the address bar — copy it from there')
    }
  }

  function exportFile() {
    downloadJson('wall-plan.json', encodeDocument(snapshot(), { pretty: true }))
    setStatus('Exported wall-plan.json')
  }

  async function importFile(chosen: File) {
    const result = decodeDocument(await chosen.text())
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    hydrate(result.state)

    const missing = catalog
      ? unknownPartIds(result.state, new Set(catalog.parts.map((p) => p.id)))
      : []
    setStatus(
      missing.length > 0
        ? `Imported · ${missing.length} part${missing.length === 1 ? '' : 's'} not in this library`
        : `Imported ${result.state.placements.length} parts`,
    )
  }

  return (
    <Toolbar.Root className="wall-actions" aria-label="Wall">
      <Toolbar.Button className="ghost-button" onClick={share} disabled={!hasContent}>
        Share link
      </Toolbar.Button>
      <Toolbar.Button className="ghost-button" onClick={exportFile} disabled={!hasContent}>
        Export
      </Toolbar.Button>
      <Toolbar.Button className="ghost-button" onClick={() => file.current?.click()}>
        Import
      </Toolbar.Button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const chosen = e.target.files?.[0]
          if (chosen) void importFile(chosen)
          // Reset so choosing the same file twice fires again.
          e.target.value = ''
        }}
      />
      {status ? <span className="wall-status">{status}</span> : null}
    </Toolbar.Root>
  )
}
