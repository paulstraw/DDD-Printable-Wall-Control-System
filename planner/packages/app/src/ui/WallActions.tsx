import { useRef } from 'react'
import { decodeDocument, encodeDocument, unknownPartIds } from '@ddd-planner/core'
import { Popover, Toolbar, useToastManager } from '../components'
import { downloadJson, shareFragmentFor } from '../persistence'
import { useStore } from '../store'
import { useHasContent } from '../usePersistence'

/**
 * Share, export and import — three buttons, now behind one.
 *
 * All three move the same document; only the vehicle differs — and all three
 * have something to say afterwards, which is why the header used to keep one
 * message in the store and why it no longer has to.
 *
 * They fold into a popover for the reason the colors did: a set of controls
 * touched once at the end of a session was holding three of the bar's widest
 * slots permanently. Share is the one with a real claim to staying out, and
 * it is the reason the trigger is named for it rather than for the file
 * operations — "Share…" says what you came for, and Export and Import are
 * the two other ways to do the same thing, which is the shape a menu is for.
 *
 * The panel buys something the bar could not: each action gets a line saying
 * what it does. Import in particular replaces everything on the wall with no
 * confirmation, and as a bare word in a row of buttons it never had anywhere
 * to admit that.
 */
export function WallActions() {
  const snapshot = useStore((s) => s.snapshot)
  const hydrate = useStore((s) => s.hydrate)
  const catalog = useStore((s) => s.catalog)
  const hasContent = useHasContent()

  const toast = useToastManager()
  const file = useRef<HTMLInputElement>(null)

  async function share() {
    const url = window.location.origin + window.location.pathname + shareFragmentFor(
      encodeDocument(snapshot()),
    )
    try {
      await navigator.clipboard.writeText(url)
      toast.add({ title: `Link copied · ${(url.length / 1024).toFixed(1)} kB` })
    } catch {
      // Clipboard permission can be refused; putting the link in the address
      // bar still lets someone copy it by hand.
      window.location.hash = shareFragmentFor(encodeDocument(snapshot()))
      toast.add({ title: 'Link is in the address bar — copy it from there' })
    }
  }

  function exportFile() {
    downloadJson('wall-plan.json', encodeDocument(snapshot(), { pretty: true }))
    toast.add({ title: 'Exported wall-plan.json' })
  }

  async function importFile(chosen: File) {
    const result = decodeDocument(await chosen.text())
    if (!result.ok) {
      // A file that would not load is the one message here worth more than
      // five seconds, so it stays until it is waved away.
      toast.add({ title: result.error, timeout: 0, priority: 'high' })
      return
    }
    hydrate(result.state)

    const missing = catalog
      ? unknownPartIds(result.state, new Set(catalog.parts.map((p) => p.id)))
      : []
    toast.add({
      title:
        missing.length > 0
          ? `Imported · ${missing.length} part${missing.length === 1 ? '' : 's'} not in this library`
          : `Imported ${result.state.placements.length} parts`,
    })
  }

  return (
    <Popover.Root>
      <Popover.Trigger>Share…</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="wall-actions">
            <Popover.Title>This wall</Popover.Title>
            {/*
              A toolbar rather than three loose buttons, for the same reason
              the header's clusters are toolbars: one tab stop, arrows between
              the items. `orientation` because this one is a column.
            */}
            <Toolbar.Root orientation="vertical" aria-label="Wall">
              <Toolbar.Button
                className="wall-action"
                onClick={share}
                disabled={!hasContent}
              >
                <span className="wall-action-name">Copy a link</span>
                <span className="wall-action-note">The whole wall, packed into the URL</span>
              </Toolbar.Button>
              <Toolbar.Button
                className="wall-action"
                onClick={exportFile}
                disabled={!hasContent}
              >
                <span className="wall-action-name">Export a file</span>
                <span className="wall-action-note">Downloads wall-plan.json</span>
              </Toolbar.Button>
              <Toolbar.Button className="wall-action" onClick={() => file.current?.click()}>
                <span className="wall-action-name">Import a file</span>
                <span className="wall-action-note">Replaces everything on the wall</span>
              </Toolbar.Button>
            </Toolbar.Root>
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
