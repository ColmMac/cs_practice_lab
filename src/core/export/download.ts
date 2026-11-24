/** Saves a Blob through a temporary link. Nothing leaves the browser. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

/** `data:image/png;base64,…` → Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, payload = ''] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream'
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

/** Copies text; false if the browser refused (no permission, insecure context…). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const MIME = {
  markdown: 'text/markdown',
  csv: 'text/csv',
  latex: 'application/x-tex',
  json: 'application/json',
  png: 'image/png',
} as const
