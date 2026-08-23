import { describe, expect, it } from 'vitest'
import {
  JSDELIVR_MAX_BYTES,
  LARGE_DOWNLOAD_BYTES,
  assetSources,
  estimateDownload,
  formatBytes,
  jsdelivrUrl,
  rawGithubUrl,
  uniqueEntryNames,
  zipEntryName,
} from '../src/download'

const FLAT = 'Sidepieces/Flats/3x0 Flat Left.stl'
/** A real Tool_hooks name — the awkward characters are not hypothetical. */
const AWKWARD = 'Centerpieces/Tool_hooks/1x3 Knipex 3x Pliers Wrench 86-05-[150+180+250].stl'

describe('URLs', () => {
  it('builds a jsDelivr URL pinned to a ref', () => {
    expect(jsdelivrUrl(FLAT)).toBe(
      'https://cdn.jsdelivr.net/gh/aderusha/DDD-Printable-Wall-Control-System@main/Sidepieces/Flats/3x0%20Flat%20Left.stl',
    )
  })

  it('builds a raw.githubusercontent URL', () => {
    expect(rawGithubUrl(FLAT)).toBe(
      'https://raw.githubusercontent.com/aderusha/DDD-Printable-Wall-Control-System/main/Sidepieces/Flats/3x0%20Flat%20Left.stl',
    )
  })

  it('encodes the characters the community names actually use', () => {
    const url = jsdelivrUrl(AWKWARD)
    // Spaces, brackets and plus signs all have to survive a round trip.
    expect(url).toContain('%5B150%2B180%2B250%5D')
    expect(url).not.toMatch(/[[\]+ ]/)
  })

  it('keeps the path separators intact', () => {
    expect(jsdelivrUrl(FLAT)).toContain('/Sidepieces/Flats/')
    expect(jsdelivrUrl(FLAT)).not.toContain('%2F')
  })

  it('takes another repo and ref', () => {
    const url = rawGithubUrl('a/b.stl', { repo: 'me/fork', ref: 'v2' })
    expect(url).toBe('https://raw.githubusercontent.com/me/fork/v2/a/b.stl')
  })

  it('tolerates a leading slash', () => {
    expect(jsdelivrUrl('/Accessories/8mm Lock Pin.stl')).toContain('@main/Accessories/')
  })
})

describe('assetSources', () => {
  it('tries jsDelivr first, then raw', () => {
    const [first, second] = assetSources(FLAT, 40_000)
    expect(first).toContain('jsdelivr')
    expect(second).toContain('raw.githubusercontent')
  })

  it('skips jsDelivr for a file over its limit', () => {
    // jsDelivr answers 403 above 20 MB, so the request would only be wasted.
    const sources = assetSources(FLAT, JSDELIVR_MAX_BYTES + 1)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toContain('raw.githubusercontent')
  })

  it('still tries jsDelivr when the size is unknown', () => {
    expect(assetSources(FLAT, null)[0]).toContain('jsdelivr')
  })

  it('keeps a file exactly at the limit on jsDelivr', () => {
    expect(assetSources(FLAT, JSDELIVR_MAX_BYTES)).toHaveLength(2)
  })
})

describe('zip entry names', () => {
  it('flattens the path but keeps the family', () => {
    expect(zipEntryName(FLAT)).toBe('Flats - 3x0 Flat Left.stl')
    expect(zipEntryName('Accessories/4x10x8mm Pin.stl')).toBe('Accessories - 4x10x8mm Pin.stl')
  })

  it('handles a bare filename', () => {
    expect(zipEntryName('loose.stl')).toBe('loose.stl')
  })

  it('never lets two entries collide', () => {
    // The same fastener is duplicated into several family folders, and two
    // entries with one name would silently drop a file from the archive.
    const names = uniqueEntryNames([
      'Accessories/4x10x8mm Pin.stl',
      'Accessories/4x10x8mm Pin.stl',
      'Centerpieces/Spacer_clip-on/4x10x8mm Pin.stl',
    ])
    const values = [...names.values()]
    expect(new Set(values).size).toBe(values.length)
  })

  it('treats the same path twice as one entry', () => {
    const names = uniqueEntryNames(['a/x.stl', 'a/x.stl'])
    expect([...names.values()]).toEqual(['a - x.stl'])
  })

  it('numbers a genuine collision before the extension', () => {
    // Two different files that flatten to the same name.
    const names = uniqueEntryNames(['Flats/3x0.stl', 'Flats - 3x0.stl'])
    expect([...names.values()]).toEqual(['Flats - 3x0.stl', 'Flats - 3x0 (2).stl'])
  })
})

describe('estimateDownload', () => {
  it('adds up what will be fetched', () => {
    const estimate = estimateDownload([
      { path: 'a.stl', sizeBytes: 1000 },
      { path: 'b.stl', sizeBytes: 2000 },
    ])
    expect(estimate.fileCount).toBe(2)
    expect(estimate.totalBytes).toBe(3000)
    expect(estimate.isLarge).toBe(false)
  })

  it('flags a download worth warning about', () => {
    const estimate = estimateDownload([{ path: 'big.stl', sizeBytes: LARGE_DOWNLOAD_BYTES }])
    expect(estimate.isLarge).toBe(true)
  })

  it('copes with unknown sizes rather than producing NaN', () => {
    const estimate = estimateDownload([{ path: 'a.stl' }, { path: 'b.stl', sizeBytes: null }])
    expect(estimate.totalBytes).toBe(0)
    expect(estimate.fileCount).toBe(2)
  })
})

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 kB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(36 * 1024 * 1024)).toBe('36 MB')
  })

  it('does not print nonsense for nothing', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})
