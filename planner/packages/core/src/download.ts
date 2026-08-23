/**
 * Fetching the STLs.
 *
 * The printable files are not served from the planner. They live in the
 * upstream repository, and the browser pulls them straight from a CDN, so the
 * Pages deploy stays small and never falls out of date with the library.
 *
 * Two sources, both verified to send `Access-Control-Allow-Origin: *`:
 *
 *   jsDelivr   cached 7 days, but refuses anything over 20 MB with a 403
 *   raw.github cached 5 minutes, no size limit
 *
 * So: jsDelivr first for the speed, raw as the fallback — for the handful of
 * oversized files by policy, and for everything else if a request fails.
 */

export const UPSTREAM_REPO = 'aderusha/DDD-Printable-Wall-Control-System'
export const UPSTREAM_REF = 'main'

/** jsDelivr answers 403 above this, so anything larger must skip it. */
export const JSDELIVR_MAX_BYTES = 20 * 1024 * 1024

export interface SourceOptions {
  readonly repo?: string
  readonly ref?: string
}

/**
 * Encode each segment separately: the separators have to survive, but the
 * names contain spaces, brackets and plus signs that do not.
 */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment !== '')
    .map(encodeURIComponent)
    .join('/')
}

export function jsdelivrUrl(path: string, options: SourceOptions = {}): string {
  const repo = options.repo ?? UPSTREAM_REPO
  const ref = options.ref ?? UPSTREAM_REF
  return `https://cdn.jsdelivr.net/gh/${repo}@${ref}/${encodePath(path)}`
}

export function rawGithubUrl(path: string, options: SourceOptions = {}): string {
  const repo = options.repo ?? UPSTREAM_REPO
  const ref = options.ref ?? UPSTREAM_REF
  return `https://raw.githubusercontent.com/${repo}/${ref}/${encodePath(path)}`
}

/**
 * Candidate URLs in the order to try them. A file known to be over jsDelivr's
 * limit skips it entirely rather than spending a request on a certain 403;
 * one of unknown size still tries, because most of the library is small.
 */
export function assetSources(
  path: string,
  sizeBytes: number | null = null,
  options: SourceOptions = {},
): string[] {
  const raw = rawGithubUrl(path, options)
  if (sizeBytes !== null && sizeBytes > JSDELIVR_MAX_BYTES) return [raw]
  return [jsdelivrUrl(path, options), raw]
}

/**
 * Flatten a repo path to a ZIP entry name.
 *
 * Keeping the folders would make someone dig through four levels to reach one
 * file. The family prefix stays, because `3x0 Flat Left.stl` alone does not
 * say which of eight families it came from.
 */
export function zipEntryName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const file = segments.at(-1) ?? path
  const family = segments.length >= 2 ? segments.at(-2) : undefined
  return family ? `${family} - ${file}` : file
}

/** Make a set of entry names unique, so a duplicate cannot silently vanish. */
export function uniqueEntryNames(paths: readonly string[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()

  for (const path of paths) {
    // The same path twice is the same file, and belongs in the archive once.
    if (out.has(path)) continue

    const base = zipEntryName(path)
    let name = base
    let n = 2
    while (used.has(name)) {
      const dot = base.lastIndexOf('.')
      name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`
      n++
    }
    used.add(name)
    out.set(path, name)
  }
  return out
}

export interface DownloadEstimate {
  readonly fileCount: number
  readonly totalBytes: number
  /** True when the download is big enough to be worth warning about first. */
  readonly isLarge: boolean
}

/** Above this, ask before starting — see Risk 6, phone memory. */
export const LARGE_DOWNLOAD_BYTES = 48 * 1024 * 1024

export function estimateDownload(
  files: readonly { readonly path: string; readonly sizeBytes?: number | null }[],
): DownloadEstimate {
  const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
  return {
    fileCount: files.length,
    totalBytes,
    isLarge: totalBytes >= LARGE_DOWNLOAD_BYTES,
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
