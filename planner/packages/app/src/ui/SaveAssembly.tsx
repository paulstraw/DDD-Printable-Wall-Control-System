import { useEffect, useRef, useState } from 'react'
import { MAX_ASSEMBLY_NAME } from '@ddd-planner/core'
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
    return (
      <button className="ghost-button" onClick={() => setNaming(true)}>
        Save {selectedCount} as assembly
      </button>
    )
  }

  return (
    <span className="save-assembly">
      <input
        ref={input}
        value={name}
        maxLength={MAX_ASSEMBLY_NAME}
        placeholder="Name this assembly"
        onChange={(e) => setName(e.target.value)}
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
      <button className="ghost-button" onClick={commit} disabled={name.trim().length === 0}>
        Save
      </button>
    </span>
  )
}
