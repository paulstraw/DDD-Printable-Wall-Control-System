import { Toolbar } from '../components'
import { partById, useStore } from '../store'
import { CopyCut } from './Clipboard'
import { OrientationToggle, useTurnable } from './OrientationToggle'
import { PaintSelection } from './PaintSelection'
import { SaveAssembly } from './SaveAssembly'

/**
 * What you can do to what is selected, and nothing else.
 *
 * This is the right-hand end of the header, and it used to be a paragraph:
 * the part's name, then `←→↑↓ nudge · Del remove`, then flat/shelf with an
 * `R` chip, then nine paint swatches and a free picker and a Default button,
 * then Copy and Cut — with Save-as-assembly answering the same selection from
 * the far left of the bar. Enough of it that the row stopped being read.
 *
 * Two things fixed that. The keys left, since a key is not a control and the
 * shortcuts dialog is where they all are now. And every control that could
 * collapse behind a trigger did, so what remains is five things wide instead
 * of fifteen.
 *
 * One `Toolbar.Root` for the lot, which is the change that is invisible until
 * you use a keyboard. It was four tab stops across one visual group —
 * flat/shelf, paint, copy/cut, save — and it is one now, with the arrow keys
 * moving between them. That is what the toolbar seam is for.
 *
 * The clipboard splits across the bar and that is on purpose: Copy and Cut
 * are here because they act on a selection, and Paste is over with the
 * always-on controls because it is exactly the thing you do without one.
 */
export function SelectionBar() {
  const placements = useStore((s) => s.placements)
  const catalog = useStore((s) => s.catalog)
  const selectedIds = useStore((s) => s.selectedIds)
  const dragging = useStore((s) => s.dragging)

  // One selected part gets named; several get counted. Naming the last one
  // clicked would be worse than useless — it hides that others will move too.
  const only = selectedIds.length === 1 ? placements.find((p) => p.id === selectedIds[0]) : null
  const selectedPart = partById(catalog, only?.partId ?? null)

  // The toggle hides itself next to a bracket, and its separator has to go
  // with it or the bar opens on a divider with nothing to its left.
  const turnable = useTurnable().length > 0

  /*
   * Placing is a mode, and the only one in the app. It gets the last line of
   * prose left in the header because tap-to-place has no visible exit — on
   * touch there is no Escape key to guess at, and the ghost following your
   * finger does not say that tapping the part again puts it back.
   */
  if (dragging) {
    return (
      <span className="hint">
        <strong>Tap the wall to place</strong> · tap the part again to cancel
      </span>
    )
  }

  if (selectedIds.length === 0) return null

  return (
    <Toolbar.Root className="selection-bar" aria-label="Selection">
      {/*
        A name, or a count. The box has a max width and the name wraps inside
        it rather than being cut short: a part called "3x3 Spacer blank" and
        one called "3x3 Spacer blank with countersink" are the same string
        until the last word, so an ellipsis would hide the only part of the
        name that identifies it.
      */}
      <span className="selection-name">
        {selectedPart ? (
          <>
            <strong>{selectedPart.name}</strong>
            {selectedPart.supported === false ? (
              <span className="warn-note"> · for a horizontal panel — position is not meaningful</span>
            ) : null}
          </>
        ) : (
          <strong>{selectedIds.length} selected</strong>
        )}
      </span>

      {turnable ? (
        <>
          <Toolbar.Separator />
          <OrientationToggle />
        </>
      ) : null}
      <Toolbar.Separator />
      <PaintSelection />
      <Toolbar.Separator />
      <CopyCut />
      <Toolbar.Separator />
      <SaveAssembly />
    </Toolbar.Root>
  )
}
