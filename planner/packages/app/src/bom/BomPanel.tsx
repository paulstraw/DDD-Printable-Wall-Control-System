import { useMemo, useState } from 'react'
import { bomToCsv, bomToMarkdown, buildBom, estimateDownload, formatBytes } from '@ddd-planner/core'
import { useStore } from '../store'
import { type DownloadFile, useDownload } from './useDownload'

const round1 = (n: number) => Math.round(n * 10) / 10

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          // Clipboard access can be refused; saying nothing would look broken.
          setCopied(false)
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

/**
 * The print list.
 *
 * Fasteners are not placed on the wall — they are implied by the families that
 * are, so they appear here without anyone having to remember them.
 */
function downloadLabel(status: ReturnType<typeof useDownload>['status'], estimate: { fileCount: number; totalBytes: number }): string {
  switch (status.phase) {
    case 'fetching':
      return `Fetching ${status.done}/${status.total}…`
    case 'zipping':
      return 'Zipping…'
    case 'done':
      return 'Downloaded'
    case 'error':
      return 'Retry download'
    default:
      return `Download ${estimate.fileCount} STL${estimate.fileCount === 1 ? '' : 's'}`
  }
}

export function BomPanel() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)
  const { status, download } = useDownload()

  const bom = useMemo(
    () =>
      buildBom({
        placements,
        parts: catalog?.parts ?? [],
        fasteners: catalog?.fasteners ?? {},
      }),
    [placements, catalog],
  )

  const lines = [...bom.parts, ...bom.fasteners]

  // Sizes come from the index, so the estimate is exact before a byte moves.
  const downloadFiles = useMemo<DownloadFile[]>(() => {
    const sizes = new Map<string, number>()
    for (const part of catalog?.parts ?? []) sizes.set(part.file, part.sourceBytes)
    for (const f of Object.values(catalog?.fasteners ?? {})) sizes.set(f.file, f.sourceBytes)
    return bom.files.map((path) => ({ path, sizeBytes: sizes.get(path) ?? null }))
  }, [bom.files, catalog])

  const estimate = estimateDownload(downloadFiles)
  const [confirmLarge, setConfirmLarge] = useState(false)
  const busy = status.phase === 'fetching' || status.phase === 'zipping'

  async function onDownload() {
    // Asked inline rather than through `window.confirm`, which is a blocking
    // system modal — jarring on a phone, and the one place this warning
    // matters most is a phone.
    if (estimate.isLarge && !confirmLarge) {
      setConfirmLarge(true)
      return
    }
    setConfirmLarge(false)
    await download(downloadFiles)
  }

  return (
    <aside className="bom">
      <div className="bom-head">
        <h2>Print list</h2>
        {lines.length > 0 ? (
          <div className="bom-actions">
            <CopyButton label="Markdown" text={bomToMarkdown(bom)} />
            <CopyButton label="CSV" text={bomToCsv(bom)} />
          </div>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="bom-empty">Drag parts onto the wall and they will be listed here.</p>
      ) : (
        <>
          <ul className="bom-lines">
            {lines.map((line) => (
              <li key={`${line.kind}-${line.id}`} className={`bom-line ${line.kind}`}>
                <span className="qty">{line.quantity}×</span>
                <span className="name">
                  {line.name}
                  {line.kind === 'fastener' ? <span className="tag">fastener</span> : null}
                </span>
                <span className="grams">{round1(line.totalGrams)} g</span>
              </li>
            ))}
            <li className="bom-line total">
              <span className="qty">{bom.totalPieces}</span>
              <span className="name">total</span>
              <span className="grams">{round1(bom.totalGrams)} g</span>
            </li>
          </ul>

          <div className="bom-foot">
            {confirmLarge ? (
              <p className="download-warning">
                That is {formatBytes(estimate.totalBytes)} across {estimate.fileCount} files, and
                the archive is built in memory. On a phone it may be slow.
              </p>
            ) : null}
            <button
              type="button"
              className={confirmLarge ? 'download warn' : 'download'}
              onClick={onDownload}
              disabled={busy}
            >
              {confirmLarge ? 'Download anyway' : downloadLabel(status, estimate)}
            </button>
            <p className="bom-note">
              {estimate.totalBytes > 0 ? `${formatBytes(estimate.totalBytes)} of STLs, ` : ''}
              fetched from jsDelivr and zipped in your browser. Filament assumes solid parts,
              so it is an upper bound.
            </p>
            {status.phase === 'error' ? <p className="bom-error">{status.message}</p> : null}
          </div>
        </>
      )}
    </aside>
  )
}
