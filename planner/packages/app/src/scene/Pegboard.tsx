import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { PANEL_THICKNESS_MM, type Board, panelSolids } from '@ddd-planner/core'

/**
 * One rectangle of panel: one instance of this.
 *
 * The thickness is baked in here rather than applied as an instance scale,
 * so every front face is an authored y = 0 and not the difference between
 * two halves of 1.587. The section overlay's default cut is the y = 0 plane
 * — the very same plane — and a front face whose clip distance is *nearly*
 * zero renders as speckle rather than as panel.
 */
const UNIT_PANEL = new BoxGeometry(1, PANEL_THICKNESS_MM, 1).translate(0, PANEL_THICKNESS_MM / 2, 0)

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
 *
 * The slots are not drawn. *Nothing* is drawn where a slot is: the board is
 * the material `panelSolids` says is there and no more, one box per
 * rectangle. A slot is therefore a genuine void — you see the scene through
 * it, and from behind you see the backs of the parts hanging on it. The 1/4"
 * mounting holes are not cut; see the planner README.
 */
export function Pegboard({ board }: { board: Board }) {
  const panel = useRef<InstancedMesh>(null)

  const solids = useMemo(() => panelSolids(board), [board])

  useLayoutEffect(() => {
    const mesh = panel.current
    if (!mesh) return
    const dummy = new Object3D()
    solids.forEach((solid, i) => {
      dummy.position.set(solid.x, 0, solid.z)
      dummy.scale.set(solid.widthMm, 1, solid.heightMm)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = solids.length
    mesh.computeBoundingSphere()
  }, [solids])

  return (
    <instancedMesh key={solids.length} ref={panel} args={[UNIT_PANEL, undefined, solids.length]}>
      <meshStandardMaterial color="#a8aeb7" roughness={0.85} metalness={0} />
    </instancedMesh>
  )
}
