import { Canvas } from '@react-three/fiber'
import { slotColumnCount, slotRowCount } from '@ddd-planner/core'
import { BomPanel } from './bom/BomPanel'
import { CatalogPanel } from './catalog/CatalogPanel'
import { Scene } from './scene/Scene'
import { partById, useStore } from './store'
import { useKeyboard } from './useKeyboard'
import { usePersistence } from './usePersistence'
import { EmptyState } from './ui/EmptyState'
import { SectionHud } from './ui/SectionHud'
import { IssuesPanel } from './ui/IssuesPanel'
import { OrientationToggle } from './ui/OrientationToggle'
import { SaveAssembly } from './ui/SaveAssembly'
import { WallActions } from './ui/WallActions'
import { WallSizeControls } from './ui/WallSizeControls'

export function App() {
  useKeyboard()
  const [restoreNote, dismissRestoreNote] = usePersistence()

  const board = useStore((s) => s.board)
  const widthIn = useStore((s) => s.widthIn)
  const heightIn = useStore((s) => s.heightIn)
  const setWallSize = useStore((s) => s.setWallSize)
  const placements = useStore((s) => s.placements)
  const catalog = useStore((s) => s.catalog)
  const selectedIds = useStore((s) => s.selectedIds)
  const dragging = useStore((s) => s.dragging)

  // One selected part gets named; several get counted. Naming the last one
  // clicked would be worse than useless — it hides that others will move too.
  const only = selectedIds.length === 1 ? placements.find((p) => p.id === selectedIds[0]) : null
  const selectedPart = partById(catalog, only?.partId ?? null)

  return (
    <div className="app">
      <header className="bar">
        <h1>Wall planner</h1>
        <WallSizeControls widthIn={widthIn} heightIn={heightIn} onChange={setWallSize} />
        <span className="count">
          {slotColumnCount(board)} × {slotRowCount(board)} slots · {placements.length} placed
        </span>
        <SaveAssembly />
        <WallActions />
        {restoreNote ? (
          <button
            className="wall-status warn-note as-text"
            onClick={dismissRestoreNote}
            title="Dismiss"
          >
            {restoreNote}
          </button>
        ) : null}
        <span className="hint">
          {dragging ? (
            <>
              <strong>Tap the wall to place</strong> · tap the part again to cancel
            </>
          ) : selectedPart ? (
            <>
              <strong>{selectedPart.name}</strong>
              {selectedPart.supported === false ? (
                <span className="warn-note"> · for a horizontal panel — position is not meaningful</span>
              ) : null}{' '}
              · <kbd>←→↑↓</kbd> nudge · <kbd>Del</kbd> remove
              <OrientationToggle />
            </>
          ) : selectedIds.length > 1 ? (
            <>
              <strong>{selectedIds.length} selected</strong> · <kbd>←→↑↓</kbd> move together ·{' '}
              <kbd>Del</kbd> remove
              <OrientationToggle />
            </>
          ) : (
            <>
              drag a part onto the wall · <kbd>⇧</kbd>click or <kbd>⇧</kbd>drag to
              select · <kbd>F</kbd> to face it · <kbd>C</kbd> to cut
            </>
          )}
        </span>
      </header>

      <div className="body">
        <CatalogPanel />
        <div className="viewport">
          <Canvas
            dpr={[1, 2]}
            camera={{
              // Z is up in wall space, so the camera has to be told.
              up: [0, 0, 1],
              position: [board.widthMm * 0.5, -board.heightMm * 1.35, board.heightMm * 0.95],
              fov: 45,
              near: 1,
              far: 20000,
            }}
          >
            <Scene board={board} />
          </Canvas>
          <EmptyState />
          <SectionHud />
        </div>
        <div className="right">
          <IssuesPanel />
          <BomPanel />
        </div>
      </div>
    </div>
  )
}
