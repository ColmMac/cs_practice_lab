/// <reference lib="webworker" />
// Dedicated worker: loads Pyodide from the CDN, installs tracer.py and pseudocode.py, serves requests.
// Runs user code off the main thread so infinite loops / heavy recursion can never freeze the UI.
import type { PyodideInterface } from 'pyodide'
import pseudocodeSource from './pseudocode.py?raw'
import tracerSource from './tracer.py?raw'
import type { PseudoResult } from '../../core/pseudocode/types'
import type { FromWorker, ToWorker, WireChunk, WireResult } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (m: FromWorker) => ctx.postMessage(m)

let validateWatchFn: ((expr: string) => string) | null = null
let pseudocodeFn: ((code: string, dialect: string) => string) | null = null
let runTraceFn: ((code: string, optionsJson: string, emit: (chunkJson: string) => void) => string) | null = null

async function init(indexURL: string) {
  post({ type: 'status', status: 'loading', message: 'Downloading Python runtime…' })
  // Loaded from the pinned CDN build so the bundler never has to process Pyodide's loader.
  const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import('pyodide')
  const pyodide: PyodideInterface = await mod.loadPyodide({ indexURL })
  post({ type: 'status', status: 'loading', message: 'Starting Python…' })
  const ns = pyodide.globals.get('dict')()
  pyodide.runPython(tracerSource, { globals: ns })
  runTraceFn = ns.get('run_trace')
  validateWatchFn = ns.get('validate_watch')
  ns.destroy()
  // its own namespace: the converter and the tracer share nothing
  const pseudo = pyodide.globals.get('dict')()
  pyodide.runPython(pseudocodeSource, { globals: pseudo })
  pseudocodeFn = pseudo.get('to_pseudocode')
  pseudo.destroy()
  post({ type: 'status', status: 'ready' })
}

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      await init(msg.indexURL)
    } else if (msg.type === 'validate-watch') {
      if (!validateWatchFn) throw new Error('Python runtime is not ready')
      const r = JSON.parse(validateWatchFn(msg.expr)) as { ok: boolean; message?: string }
      post({ type: 'watch-validated', requestId: msg.requestId, ...r })
    } else if (msg.type === 'pseudocode') {
      if (!pseudocodeFn) throw new Error('Python runtime is not ready')
      const result = JSON.parse(pseudocodeFn(msg.code, msg.dialect)) as PseudoResult
      post({ type: 'pseudocode-done', requestId: msg.requestId, result })
    } else if (msg.type === 'run') {
      if (!runTraceFn) throw new Error('Python runtime is not ready')
      // The tracer calls `emit` as each row finishes. postMessage delivers while Python is still
      // running, so a worker killed mid-run has already handed over everything recorded so far.
      const emit = (chunkJson: string) =>
        post({ type: 'chunk', runId: msg.runId, chunk: JSON.parse(chunkJson) as WireChunk })
      const result = JSON.parse(runTraceFn(msg.code, JSON.stringify(msg.options), emit)) as WireResult
      post({ type: 'done', runId: msg.runId, result })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (msg.type === 'run') post({ type: 'run-failed', runId: msg.runId, message })
    // a failed validation is not a broken runtime: report it as a rejected watch
    else if (msg.type === 'validate-watch') post({ type: 'watch-validated', requestId: msg.requestId, ok: false, message })
    else if (msg.type === 'pseudocode') {
      post({ type: 'pseudocode-done', requestId: msg.requestId, result: { ok: false, message: `Could not convert this program: ${message}` } })
    } else post({ type: 'fatal', message })
  }
}
