import { Canvas } from '@react-three/fiber'
import { slotColumnCount, slotRowCount } from '@ddd-planner/core'
import { BomPanel } from './bom/BomPanel'
import { CatalogPanel } from './catalog/CatalogPanel'
import { Scene } from './scene/Scene'
import { partById, useStore } from './store'
import { useKeyboard } from './useKeyboard'
import { WallSizeControls } from './ui/WallSizeControls'

export function App() {
  useKeyboard()

  const board = useStore((s) => s.board)
  const widthIn = useStore((s) => s.widthIn)
  const heightIn = useStore((s) => s.heightIn)
  const setWallSize = useStore((s) => s.setWallSize)
  const placements = useStore((s) => s.placements)
  const catalog = useStore((s) => s.catalog)
  const selectedId = useStore((s) => s.selectedId)

  const selected = placements.find((p) => p.id === selectedId) ?? null
  const selectedPart = partById(catalog, selected?.partId ?? null)

  return (
    <div className="app">
      <header className="bar">
        <h1>Wall planner</h1>
        <WallSizeControls widthIn={widthIn} heightIn={heightIn} onChange={setWallSize} />
        <span className="count">
          {slotColumnCount(board)} × {slotRowCount(board)} slots · {placements.length} placed
        </span>
        <span className="hint">
          {selectedPart ? (
            <>
              <strong>{selectedPart.name}</strong>
              {selectedPart.supported === false ? (
                <span className="warn-note"> · for a horizontal panel — position is not meaningful</span>
              ) : null}{' '}
              · <kbd>←→↑↓</kbd> nudge · <kbd>Del</kbd> remove
            </>
          ) : (
            <>
              drag a part onto the wall · <kbd>F</kbd> to face it
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
        </div>
        <BomPanel />
      </div>
    </div>
  )
}
