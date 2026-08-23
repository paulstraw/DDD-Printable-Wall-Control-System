import { OrbitControls } from '@react-three/drei'
import type { Board } from '@ddd-planner/core'
import { Pegboard } from './Pegboard'
import { useFaceOn } from './useFaceOn'

function CameraRig({ board }: { board: Board }) {
  useFaceOn(board)
  return null
}

export function Scene({ board }: { board: Board }) {
  const centre: [number, number, number] = [board.widthMm / 2, 0, board.heightMm / 2]

  return (
    <>
      <color attach="background" args={['#f4f6f8']} />
      <hemisphereLight intensity={0.55} groundColor="#8b8f96" />
      <directionalLight position={[-600, -900, 1200]} intensity={1.5} />
      <directionalLight position={[700, -500, 300]} intensity={0.5} />

      <Pegboard board={board} />

      <OrbitControls makeDefault target={centre} enableDamping dampingFactor={0.12} />
      <CameraRig board={board} />
    </>
  )
}
