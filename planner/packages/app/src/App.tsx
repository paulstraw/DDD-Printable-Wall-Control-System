import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { createBoard, slotColumnCount, slotRowCount } from '@ddd-planner/core'
import { Scene } from './scene/Scene'
import { WallSizeControls } from './ui/WallSizeControls'

export function App() {
  const [size, setSize] = useState({ widthIn: 32, heightIn: 32 })
  const board = useMemo(() => createBoard(size.widthIn, size.heightIn), [size])

  const cols = slotColumnCount(board)
  const rows = slotRowCount(board)

  return (
    <div className="app">
      <header className="bar">
        <h1>Wall planner</h1>
        <WallSizeControls widthIn={size.widthIn} heightIn={size.heightIn} onChange={setSize} />
        <span className="count">
          {cols} × {rows} slots
        </span>
        <span className="hint">
          drag to orbit · scroll to zoom · <kbd>F</kbd> to face the wall
        </span>
      </header>

      <div className="viewport">
        <Canvas
          shadows
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
    </div>
  )
}
