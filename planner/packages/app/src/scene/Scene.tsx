import { OrbitControls } from '@react-three/drei'
import type { Board } from '@ddd-planner/core'
import { useStore } from '../store'
import { useModifier } from '../useModifier'
import { DragGhost, DropTarget, Marquee } from './DropTarget'
import { Pegboard } from './Pegboard'
import { PlacedParts } from './PlacedParts'
import { SectionClip } from './SectionClip'
import { SectionHandle } from './SectionHandle'
import { useFaceOn } from './useFaceOn'

function CameraRig({ board }: { board: Board }) {
  useFaceOn(board)
  return null
}

export function Scene({ board }: { board: Board }) {
  const centre: [number, number, number] = [board.widthMm / 2, 0, board.heightMm / 2]
  // A drag that crosses the canvas must not also swing the camera — that
  // goes for a box-select just as much as for a part coming out of the
  // catalog. A plain wall drag *is* the camera, so it stays enabled.
  //
  // The camera stands down while a modifier is *held*, not once a
  // box-select has started: OrbitControls claims the pointerdown before
  // React can react to it. See useModifier.
  const selecting = useModifier()
  const busy = useStore(
    (s) => s.dragging !== null || s.marquee?.selecting === true || s.section.dragging,
  )
  const background = useStore((s) => s.colors.background)

  return (
    <>
      {/*
        The viewport's own background, not the app's. The chrome around the
        canvas keeps its own colors — this is a scene, not a theme.
      */}
      <color attach="background" args={[background]} />
      <hemisphereLight intensity={0.55} groundColor="#8b8f96" />
      <directionalLight position={[-600, -900, 1200]} intensity={1.5} />
      <directionalLight position={[700, -500, 300]} intensity={0.5} />

      <Pegboard board={board} />
      <DropTarget board={board} />
      <PlacedParts />
      <DragGhost />
      <Marquee />
      <SectionClip />
      <SectionHandle board={board} />

      <OrbitControls
        makeDefault
        target={centre}
        enabled={!busy && !selecting}
        enableDamping
        dampingFactor={0.12}
      />
      <CameraRig board={board} />
    </>
  )
}
