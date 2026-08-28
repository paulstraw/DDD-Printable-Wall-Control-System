import { useEffect, useRef, useState } from 'react'
import { MAX_ASSEMBLY_NAME } from '@ddd-planner/core'
import { Button, Field, Input, Popover, Toolbar, useToastManager } from '../components'
import { useStore } from '../store'

/**
 * Name and save whatever is selected.
 *
 * It sits in the selection bar now, with the other things that act on a
 * selection, rather than off on the far side of the header — and the naming
 * step moved into a popover with it. Inline, the name box was twelve rem of
 * bar arriving out of nowhere and leaving again; in a panel it is a box under
 * a heading, which is what it always was.
 *
 * The ambient "3 assemblies" readout is gone. `AssemblyPanel` lists them all,
 * by name, next to the catalog they are dragged from, so the header was
 * counting something already on screen. The one thing that count carried
 * which the panel does not — that the save just now worked — is a toast,
 * which is this app's answer to that everywhere else.
 */
export function SaveAssembly() {
  const selectedCount = useStore((s) => s.selectedIds.length)
  const save = useStore((s) => s.saveSelectionAsAssembly)
  const toast = useToastManager()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Losing the selection mid-name means there is nothing left to save. The
  // trigger unmounts on its own, but the open flag would otherwise survive
  // and reopen the panel over the next selection.
  useEffect(() => {
    if (selectedCount === 0) {
      setOpen(false)
      setName('')
    }
  }, [selectedCount])

  if (selectedCount === 0) return null

  function commit() {
    const stored = save(name)
    if (!stored) return
    // `save` resolves collisions, so the name in the toast is the one that
    // was actually used and not necessarily the one that was typed.
    toast.add({ title: `Saved “${stored}”` })
    setName('')
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Toolbar.Button
        render={<Popover.Trigger />}
        title="Save the selection as a reusable group"
      >
        Save as assembly
      </Toolbar.Button>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          {/* The box is the only reason to open this, so it gets the focus. */}
          <Popover.Popup className="save-assembly" initialFocus={input}>
            <Popover.Title>
              Save {selectedCount} part{selectedCount === 1 ? '' : 's'}
            </Popover.Title>
            <Field.Root className="save-assembly-field">
              <Field.Label className="visually-hidden">Name this assembly</Field.Label>
              <Input
                ref={input}
                value={name}
                maxLength={MAX_ASSEMBLY_NAME}
                placeholder="Name this assembly"
                onValueChange={setName}
                onKeyDown={(e) => {
                  // Enter commits. Escape belongs to the popover, which closes
                  // on it already — and the global handler now stands aside
                  // for anything inside a popup, so neither key needs stopping
                  // here the way both did when this box sat bare in the header.
                  if (e.key === 'Enter') commit()
                }}
              />
              <Button onClick={commit} disabled={name.trim().length === 0}>
                Save
              </Button>
            </Field.Root>
            <Popover.Description>
              Saved groups appear under the catalog, ready to drag back on.
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
