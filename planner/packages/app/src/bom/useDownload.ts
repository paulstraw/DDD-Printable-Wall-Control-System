import { useCallback, useState } from 'react'
import { zip } from 'fflate'
import { assetSources, uniqueEntryNames } from '@ddd-planner/core'

export interface DownloadFile {
  readonly path: string
  readonly sizeBytes?: number | null
}

export type DownloadStatus =
  | { phase: 'idle' }
  | { phase: 'fetching'; done: number; total: number }
  | { phase: 'zipping' }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

/**
 * Try each source in turn. jsDelivr is first for the cache, but a 403 (over
 * its size limit) or any network hiccup should fall through to raw rather
 * than failing the whole archive.
 */
async function fetchFirstAvailable(path: string, sizeBytes: number | null): Promise<Uint8Array> {
  const sources = assetSources(path, sizeBytes)
  let lastError = 'no sources'

  for (const url of sources) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`
        continue
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`${path}: ${lastError}`)
}

function saveBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function useDownload() {
  const [status, setStatus] = useState<DownloadStatus>({ phase: 'idle' })

  const download = useCallback(async (files: readonly DownloadFile[], filename = 'wall-parts.zip') => {
    if (files.length === 0) return

    const names = uniqueEntryNames(files.map((f) => f.path))
    const entries: Record<string, Uint8Array> = {}

    setStatus({ phase: 'fetching', done: 0, total: files.length })
    try {
      let done = 0
      for (const file of files) {
        const bytes = await fetchFirstAvailable(file.path, file.sizeBytes ?? null)
        entries[names.get(file.path) ?? file.path] = bytes
        done++
        setStatus({ phase: 'fetching', done, total: files.length })
      }

      setStatus({ phase: 'zipping' })
      const archive = await new Promise<Uint8Array>((resolve, reject) => {
        // level 6: STLs, especially the ASCII half, compress hard.
        zip(entries, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
      })

      saveBlob(archive, filename)
      setStatus({ phase: 'done' })
      setTimeout(() => setStatus({ phase: 'idle' }), 2500)
    } catch (e) {
      setStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  return { status, download }
}
