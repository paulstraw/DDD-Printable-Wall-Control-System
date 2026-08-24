/**
 * Where a wall is kept: this browser, a link, or a file.
 *
 * The document itself is `core/persistence` — this module only moves it
 * about. Everything here can fail for reasons that are nobody's fault
 * (private browsing, a truncated link, a full disk), so nothing throws:
 * a failed read is `null` and the caller carries on with an empty wall.
 */

export const STORAGE_KEY = 'ddd-wall-planner/v1'

/** The fragment key, as in `#w=…`. */
export const SHARE_KEY = 'w'

/**
 * Base64url, because a share link is mostly punctuation otherwise.
 *
 * `encodeURIComponent` escapes every `{`, `"`, `[` and `,` in the JSON to
 * three characters — around 2.5x. Base64 is 1.33x and survives being pasted
 * into a chat window. The `btoa` pair only handles latin-1, so the text goes
 * through UTF-8 first; assembly names are user-typed and contain anything.
 */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    // A link that was wrapped by an email client lands here.
    return null
  }
}

/** Pull the document out of a `#w=…` fragment, if there is one. */
export function readShareFragment(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const value = params.get(SHARE_KEY)
  if (!value) return null
  return fromBase64Url(value)
}

export function shareFragmentFor(json: string): string {
  return `#${SHARE_KEY}=${toBase64Url(json)}`
}

export function loadLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private browsing, or storage disabled entirely.
    return null
  }
}

export function saveLocal(json: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    // Over quota, or storage disabled. Losing an autosave is not worth
    // interrupting someone mid-drag over.
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do */
  }
}

/** Hand the browser a file without a server. */
export function downloadJson(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoking immediately cancels the download in some browsers — the same
  // trap the STL ZIP hit.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
