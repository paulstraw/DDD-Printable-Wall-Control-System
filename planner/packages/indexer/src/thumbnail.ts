/**
 * Thumbnails, rendered in-process.
 *
 * The design doc flags headless rendering as the fiddliest CI step and
 * suggests Puppeteer. These parts are small, opaque, flat-shaded solids seen
 * from one fixed angle, which is little enough that a z-buffered orthographic
 * rasteriser does the job in a fraction of the code and none of the
 * infrastructure — no browser to install, no GPU, and byte-identical output
 * on every machine.
 */

import sharp from 'sharp'

export interface Vec3 {
  x: number
  y: number
  z: number
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
}

export interface ThumbnailOptions {
  readonly size?: number
  /** Direction the camera looks along, in wall space. */
  readonly forward?: Vec3
  readonly background?: readonly [number, number, number]
  readonly base?: readonly [number, number, number]
}

/**
 * Three-quarter view from the front, above and to the left — wall space has
 * X across, Y into the wall and Z up, so the viewer stands at negative Y.
 */
const DEFAULT_FORWARD: Vec3 = { x: 0.42, y: 0.82, z: -0.39 }

export function renderRgba(positions: Float32Array, options: ThumbnailOptions = {}) {
  const size = options.size ?? 256
  const bg = options.background ?? [250, 249, 247]
  const base = options.base ?? [126, 138, 152]

  const f = unit(options.forward ?? DEFAULT_FORWARD)
  const worldUp: Vec3 = Math.abs(f.z) > 0.95 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 }
  const right = unit(cross(worldUp, f))
  const up = cross(f, right)

  // Project once to find the extent, then again to fill the frame.
  const n = positions.length / 3
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  const d = new Float32Array(n)
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity

  for (let i = 0, p = 0; i < positions.length; i += 3, p++) {
    const q: Vec3 = { x: positions[i]!, y: positions[i + 1]!, z: positions[i + 2]! }
    u[p] = dot(q, right)
    v[p] = dot(q, up)
    d[p] = dot(q, f)
    if (u[p]! < uMin) uMin = u[p]!
    if (u[p]! > uMax) uMax = u[p]!
    if (v[p]! < vMin) vMin = v[p]!
    if (v[p]! > vMax) vMax = v[p]!
  }

  const pad = size * 0.08
  const span = Math.max(uMax - uMin, vMax - vMin, 1e-6)
  const scale = (size - pad * 2) / span
  const offU = (size - (uMax - uMin) * scale) / 2 - uMin * scale
  const offV = (size - (vMax - vMin) * scale) / 2 - vMin * scale

  const rgba = new Uint8Array(size * size * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bg[0]
    rgba[i + 1] = bg[1]
    rgba[i + 2] = bg[2]
    rgba[i + 3] = 255
  }
  const depth = new Float32Array(size * size).fill(Infinity)

  const light = unit({ x: -0.4, y: -0.75, z: 0.53 })

  for (let t = 0; t < n; t += 3) {
    const a = { u: u[t]! * scale + offU, v: size - (v[t]! * scale + offV), d: d[t]! }
    const b = { u: u[t + 1]! * scale + offU, v: size - (v[t + 1]! * scale + offV), d: d[t + 1]! }
    const c = { u: u[t + 2]! * scale + offU, v: size - (v[t + 2]! * scale + offV), d: d[t + 2]! }

    const area = (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u)
    if (Math.abs(area) < 1e-9) continue

    const i0 = t * 3
    const e1 = sub(
      { x: positions[i0 + 3]!, y: positions[i0 + 4]!, z: positions[i0 + 5]! },
      { x: positions[i0]!, y: positions[i0 + 1]!, z: positions[i0 + 2]! },
    )
    const e2 = sub(
      { x: positions[i0 + 6]!, y: positions[i0 + 7]!, z: positions[i0 + 8]! },
      { x: positions[i0]!, y: positions[i0 + 1]!, z: positions[i0 + 2]! },
    )
    const normal = unit(cross(e1, e2))
    // Two-sided: STL winding in this library is not always outward.
    const lambert = Math.abs(dot(normal, light))
    const shade = 0.34 + 0.66 * lambert

    const minX = Math.max(0, Math.floor(Math.min(a.u, b.u, c.u)))
    const maxX = Math.min(size - 1, Math.ceil(Math.max(a.u, b.u, c.u)))
    const minY = Math.max(0, Math.floor(Math.min(a.v, b.v, c.v)))
    const maxY = Math.min(size - 1, Math.ceil(Math.max(a.v, b.v, c.v)))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const py = y + 0.5
        let w0 = ((b.u - a.u) * (py - a.v) - (b.v - a.v) * (px - a.u)) / area
        let w1 = ((c.u - b.u) * (py - b.v) - (c.v - b.v) * (px - b.u)) / area
        let w2 = ((a.u - c.u) * (py - c.v) - (a.v - c.v) * (px - c.u)) / area
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        // Barycentric order: w1 belongs to a, w2 to b, w0 to c.
        const z = w1 * a.d + w2 * b.d + w0 * c.d
        const at = y * size + x
        if (z >= depth[at]!) continue
        depth[at] = z
        const o = at * 4
        rgba[o] = Math.min(255, Math.round(base[0] * shade))
        rgba[o + 1] = Math.min(255, Math.round(base[1] * shade))
        rgba[o + 2] = Math.min(255, Math.round(base[2] * shade))
        rgba[o + 3] = 255
      }
    }
  }

  return { rgba, size }
}

export async function renderWebp(
  positions: Float32Array,
  options: ThumbnailOptions = {},
): Promise<Uint8Array> {
  const { rgba, size } = renderRgba(positions, options)
  const out = await sharp(Buffer.from(rgba), { raw: { width: size, height: size, channels: 4 } })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()
  return new Uint8Array(out)
}
