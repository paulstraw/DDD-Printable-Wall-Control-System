import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { MM_PER_INCH } from '@ddd-planner/core'

// Scaffold scene. The real pegboard, catalog and BOM panels land in later tasks;
// this exists so the toolchain (React + r3f + drei + workspace import) is proven.
export function App() {
  return (
    <div className="app">
      <Canvas camera={{ position: [0, 0, 600], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[200, 300, 400]} intensity={1.2} />
        <mesh>
          <boxGeometry args={[MM_PER_INCH * 16, MM_PER_INCH * 32, 1.587]} />
          <meshStandardMaterial color="#7a8a99" />
        </mesh>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
