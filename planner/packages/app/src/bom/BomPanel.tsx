import { useMemo, useState } from 'react'
import { bomToCsv, bomToMarkdown, buildBom } from '@ddd-planner/core'
import { useStore } from '../store'

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
export function BomPanel() {
  const catalog = useStore((s) => s.catalog)
  const placements = useStore((s) => s.placements)

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

          <p className="bom-note">
            {bom.files.length} distinct STL{bom.files.length === 1 ? '' : 's'} to download.
            Filament assumes solid parts, so it is an upper bound.
          </p>
        </>
      )}
    </aside>
  )
}
