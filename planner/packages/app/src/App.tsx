import { Canvas } from '@react-three/fiber'
import { BomPanel } from './bom/BomPanel'
import { CatalogPanel } from './catalog/CatalogPanel'
import { Scene } from './scene/Scene'
import { useStore } from './store'
import { useClipboard } from './useClipboard'
import { useKeyboard } from './useKeyboard'
import { usePersistence } from './usePersistence'
import { PasteButton } from './ui/Clipboard'
import { EmptyState } from './ui/EmptyState'
import { Toasts } from './ui/Toasts'
import { SectionHud } from './ui/SectionHud'
import { IssuesPanel } from './ui/IssuesPanel'
import { SelectionBar } from './ui/SelectionBar'
import { Shortcuts } from './ui/Shortcuts'
import { UndoRedo } from './ui/UndoRedo'
import { WallActions } from './ui/WallActions'
import { WallColors } from './ui/WallColors'
import { WallSize } from './ui/WallSize'

export function App() {
  useKeyboard()
  useClipboard()
  usePersistence()

  const board = useStore((s) => s.board)

  return (
    <div className="app">
      {/*
        The bar, in three parts: what the document is, what you can do to it,
        and — pushed to the right — what you can do to the selection.

        Almost everything here is a trigger rather than the control itself.
        That is the trade this header makes on purpose: the wall size, the
        colors, the file actions and the paint are all set a handful of times
        in a session, and each was holding permanent space in a row that had
        run out of it. One click each buys back a bar you can read.
      */}
      <header className="bar">
        <h1>Wall planner</h1>
        <WallSize />
        <WallColors />
        <UndoRedo />
        <PasteButton />
        <WallActions />
        <SelectionBar />
        <Shortcuts />
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

      <Toasts />
    </div>
  )
}
