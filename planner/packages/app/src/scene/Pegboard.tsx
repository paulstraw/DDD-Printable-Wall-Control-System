import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D } from 'three'
import type { InstancedMesh } from 'three'
import {
  PANEL_THICKNESS_MM,
  SLOT_HEIGHT_MM,
  SLOT_WIDTH_MM,
  type Board,
  slotColumnCount,
  slotColumnX,
  slotRowCenterZ,
  slotRowCount,
} from '@ddd-planner/core'

/**
 * The virtual pegboard.
 *
 * Free-size by decision: the user types a width and height and gets one
 * unbroken board. No panel tiling, no seams — which also means it will accept
 * placements a real tiled wall would not, since real panels carry a ~1"
 * unslotted border at every join.
 *
 * Wall space: X across, Y into the wall, Z up. The front face is y = 0, so
 * the board itself occupies y from 0 to its thickness and everything mounted
 * on it sits at negative y.
 */
export function Pegboard({ board }: { board: Board }) {
  const slots = useRef<InstancedMesh>(null)

  const layout = useMemo(() => {
    const cols = slotColumnCount(board)
    const rows = slotRowCount(board)
    const positions: [number, number][] = []
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) positions.push([slotColumnX(c), slotRowCenterZ(r)])
    }
    return { cols, rows, positions }
  }, [board])

  useLayoutEffect(() => {
    const mesh = slots.current
    if (!mesh) return
    const dummy = new Object3D()
    layout.positions.forEach(([x, z], i) => {
      dummy.position.set(x, PANEL_THICKNESS_MM / 2, z)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = layout.positions.length
  }, [layout])

  return (
    <group>
      <mesh position={[board.widthMm / 2, PANEL_THICKNESS_MM / 2, board.heightMm / 2]} receiveShadow>
        <boxGeometry args={[board.widthMm, PANEL_THICKNESS_MM, board.heightMm]} />
        <meshStandardMaterial color="#c8ccd2" roughness={0.85} metalness={0} />
      </mesh>

      {/* Slots are drawn slightly proud of both faces so they read as cut
          through the panel rather than z-fighting with it. */}
      <instancedMesh
        key={layout.positions.length}
        ref={slots}
        args={[undefined, undefined, Math.max(1, layout.positions.length)]}
      >
        <boxGeometry args={[SLOT_WIDTH_MM, PANEL_THICKNESS_MM * 3, SLOT_HEIGHT_MM]} />
        <meshStandardMaterial color="#2f353d" roughness={0.95} metalness={0} />
      </instancedMesh>
    </group>
  )
}
