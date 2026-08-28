import { useEffect, useState } from 'react'
import { Dialog } from '../components'
import { MOD } from '../platform'
import { keyboardIsSpokenFor } from '../useKeyboard'

/**
 * Every shortcut, in one place, behind one `?`.
 *
 * These used to live in the header, taught at the moment they applied — a
 * genuinely good property, paid for by a permanent row of `<kbd>` across the
 * top of the app. The row got long enough that it stopped being read, which
 * is the point at which just-in-time teaching is neither.
 *
 * What replaces it is two things, not one. This list is the complete
 * reference, and every control that *has* a key now names it in its own
 * tooltip — so the keys attached to something visible are still discoverable
 * where they are used, and only the ones with no button (the arrows, Del, F,
 * C) depend on this dialog.
 *
 * Pointer gestures are here too, despite the title. Shift-drag to box-select
 * is the least guessable thing in the app and it has no button and no key, so
 * a list of keys that omitted it would be complete and useless.
 */

/**
 * One row. **Adjacent chips are pressed together** — `⇧` `drag` is a
 * shift-drag, not a choice between two things. Where a key has an equivalent
 * rather than a partner, the equivalent goes in the prose, which is the only
 * way to say "or" without inventing a second kind of row.
 */
interface Shortcut {
  keys: string[]
  what: string
}

const GROUPS: { title: string; rows: Shortcut[] }[] = [
  {
    title: 'Selecting',
    rows: [
      { keys: ['⇧', 'click'], what: 'Add a part to the selection, or take one out' },
      { keys: ['⇧', 'drag'], what: 'Sweep a box over the wall and take everything inside it' },
      { keys: [`${MOD}A`], what: 'Select everything on the wall' },
      { keys: ['Esc'], what: 'Deselect — or abandon a part you are in the middle of placing' },
    ],
  },
  {
    title: 'Editing',
    rows: [
      { keys: ['←→↑↓'], what: 'Move the selection one slot' },
      { keys: ['Del'], what: 'Remove the selection. Backspace does the same' },
      { keys: ['R'], what: 'Turn the selection between flat and shelf' },
      { keys: [`${MOD}C`], what: 'Copy the selection' },
      { keys: [`${MOD}X`], what: 'Cut the selection' },
      { keys: [`${MOD}V`], what: 'Paste' },
    ],
  },
  {
    title: 'Looking',
    rows: [
      { keys: ['F'], what: 'Face the wall square on' },
      { keys: ['C'], what: 'Cut a cross-section through the wall, to read depth' },
      { keys: ['drag'], what: 'Orbit the camera' },
      { keys: ['scroll'], what: 'Zoom in and out' },
    ],
  },
  {
    title: 'The document',
    rows: [
      { keys: [`${MOD}Z`], what: 'Undo' },
      { keys: [`${MOD}⇧Z`], what: 'Redo. Ctrl+Y does the same on Windows' },
      { keys: ['?'], what: 'This list' },
    ],
  },
]

export function Shortcuts() {
  const [open, setOpen] = useState(false)

  /*
   * `?` rather than a keyboard combination, because that is what every other
   * application with a shortcut list uses and there is nothing to gain by
   * being different. Matched on the character, not on Shift plus a key, so it
   * works on a layout that puts `?` somewhere else.
   *
   * It opens rather than toggles: once the dialog has focus the guard below
   * catches the second press, and Escape is already the way out of a dialog.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '?') return
      if (keyboardIsSpokenFor(event.target)) return
      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/*
        The app's one icon-only control, and it earns it: `?` is a word in
        this position, not a picture, and spelling out "Shortcuts" would take
        four times the space to say the same thing. The accessible name and
        the tooltip both say it in full.
      */}
      <Dialog.Trigger className="shortcuts-trigger" title="Keyboard shortcuts (?)">
        <span aria-hidden>?</span>
        <span className="visually-hidden">Keyboard shortcuts</span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="shortcuts">
          <Dialog.Title>Shortcuts</Dialog.Title>

          <div className="shortcuts-groups">
            {GROUPS.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <dl>
                  {group.rows.map((row) => (
                    <div key={row.what} className="shortcut">
                      <dt>
                        {row.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </dt>
                      <dd>{row.what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <Dialog.Close className="shortcuts-close">Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
