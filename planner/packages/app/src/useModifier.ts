import { useEffect, useState } from 'react'

/**
 * Whether a selection modifier (Shift, Cmd or Ctrl) is held.
 *
 * There is one answer to that question and it lives here, because the last
 * time there were two — the pointer event's `shiftKey` for the box-select,
 * the keyboard for the camera — they disagreed and the failure was silent:
 * the camera froze for a selection that never happened.
 *
 * It has to come from the keyboard rather than the pointer event because of
 * *when* it is needed. OrbitControls listens on the canvas directly and
 * starts rotating the moment the pointer goes down; disabling it in response
 * to that same event is a frame too late. Knowing the modifier is held
 * before the press arrives is what lets the camera stand down in time.
 */

let held = false
const listeners = new Set<(value: boolean) => void>()

function set(value: boolean) {
  if (value === held) return
  held = value
  for (const listener of listeners) listener(value)
}

if (typeof window !== 'undefined') {
  const read = (e: KeyboardEvent) => set(e.shiftKey || e.metaKey || e.ctrlKey)
  window.addEventListener('keydown', read)
  window.addEventListener('keyup', read)
  // Alt-tabbing away with Shift down would otherwise leave it stuck on.
  window.addEventListener('blur', () => set(false))
}

/** Read it at event time, without subscribing a component to it. */
export function modifierHeld(): boolean {
  return held
}

/** Subscribe, for the two components that must *render* differently. */
export function useModifier(): boolean {
  const [value, setValue] = useState(held)

  useEffect(() => {
    // Between render and effect the key may have moved.
    setValue(held)
    listeners.add(setValue)
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  return value
}
