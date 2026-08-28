import { Plane, Vector3 } from 'three'
import type { Ray } from 'three'
import type { Point2 } from '@ddd-planner/core'

/**
 * The plane every wall gesture is measured against.
 *
 * A hair in front of the board, which is where `DropTarget` puts its catcher
 * mesh — the two have to agree, because a press read off the mesh and a move
 * read off the ray have to land on the same surface or the first millimetre
 * of every drag would be a jump.
 */
export const WALL_PLANE_Y = -0.2

const PLANE = new Plane().setFromNormalAndCoplanarPoint(
  new Vector3(0, -1, 0),
  new Vector3(0, WALL_PLANE_Y, 0),
)

const HIT = new Vector3()

/**
 * Where a pointer ray meets the wall.
 *
 * Against the mathematical plane rather than against a mesh, which is the
 * whole point of it existing. A mesh stops at the board's edge, faces one way
 * so nothing is picked from behind the wall, and hands back the point it was
 * *hit* at — which for a part standing 50 mm proud, seen 30° off axis, is
 * nearly 29 mm from where the cursor actually is on the board, more than a
 * column. The plane has none of those limits, so a press on a part and a drag
 * off the edge both come back with the point under the cursor.
 *
 * Null when the ray runs parallel to the wall or meets it behind the camera.
 */
export function wallPointFrom(ray: Ray): Point2 | null {
  const hit = ray.intersectPlane(PLANE, HIT)
  return hit === null ? null : { x: hit.x, z: hit.z }
}
