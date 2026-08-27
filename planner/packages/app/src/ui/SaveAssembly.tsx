import { useEffect, useRef, useState } from 'react'
import { MAX_ASSEMBLY_NAME } from '@ddd-planner/core'
import { Button, Field, Input } from '../components'
import { useStore } from '../store'

/**
 * Name and save whatever is selected.
 *
 * Two states: a button, and a name box. It only appears when something is
 * selected, because "save nothing" is not an offer worth making.
 */
export function SaveAssembly() {
  const selectedCount = useStore((s) => s.selectedIds.length)
  const assemblies = useStore((s) => s.assemblies)
  const save = useStore((s) => s.saveSelectionAsAssembly)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (naming) input.current?.focus()
  }, [naming])

  // Losing the selection mid-name means there is nothing left to save.
  useEffect(() => {
    if (selectedCount === 0) setNaming(false)
  }, [selectedCount])

  function commit() {
    const stored = save(name)
    if (!stored) return
    setSaved(stored)
    setName('')
    setNaming(false)
  }

  if (selectedCount === 0) {
    return assemblies.length > 0 ? (
      <span className="count">
        {assemblies.length} assembl{assemblies.length === 1 ? 'y' : 'ies'}
        {saved ? ` · saved “${saved}”` : ''}
      </span>
    ) : null
  }

  if (!naming) {
    return <Button onClick={() => setNaming(true)}>Save {selectedCount} as assembly</Button>
  }

  return (
    <Field.Root className="save-assembly">
      {/*
        The label is hidden, not absent — there was none at all before. The
        placeholder was standing in for one, and a placeholder leaves the
        moment you start typing, taking the only description of the box with
        it. Showing it would put the word "Name" in the header every time
        someone saves an assembly, next to a box that only exists because they
        pressed "Save 3 as assembly" a second ago. Hidden buys the accessible
        name without spending the space.
      */}
      <Field.Label className="visually-hidden">Name this assembly</Field.Label>
      <Input
        ref={input}
        value={name}
        maxLength={MAX_ASSEMBLY_NAME}
        placeholder="Name this assembly"
        onValueChange={setName}
        onKeyDown={(e) => {
          // Enter and Escape belong to the box while it is open; the global
          // handler already stands aside for inputs.
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setNaming(false)
            setName('')
          }
          e.stopPropagation()
        }}
      />
      <Button onClick={commit} disabled={name.trim().length === 0}>
        Save
      </Button>
    </Field.Root>
  )
}
