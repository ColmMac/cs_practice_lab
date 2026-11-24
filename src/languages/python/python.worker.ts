/// <reference lib="webworker" />
// Dedicated worker: loads Pyodide from the CDN, installs tracer.py, runs traces on request.
// Runs user code off the main thread so infinite loops / heavy recursion can never freeze the UI.
import type { PyodideInterface } from 'pyodide'
import tracerSource from './tracer.py?raw'
import type { FromWorker, ToWorker, WireResult } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (m: FromWorker) => ctx.postMessage(m)

let runTraceFn: ((code: string, optionsJson: string) => string) | null = null

async function init(indexURL: string) {
  post({ type: 'status', status: 'loading', message: 'Downloading Python runtime…' })
  // Loaded from the pinned CDN build so the bundler never has to process Pyodide's loader.
  const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import('pyodide')
  const pyodide: PyodideInterface = await mod.loadPyodide({ indexURL })
  post({ type: 'status', status: 'loading', message: 'Starting Python…' })
  const ns = pyodide.globals.get('dict')()
  pyodide.runPython(tracerSource, { globals: ns })
  runTraceFn = ns.get('run_trace')
  ns.destroy()
  post({ type: 'status', status: 'ready' })
}

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      await init(msg.indexURL)
    } else if (msg.type === 'run') {
      if (!runTraceFn) throw new Error('Python runtime is not ready')
      const result = JSON.parse(runTraceFn(msg.code, JSON.stringify(msg.options))) as WireResult
      post({ type: 'done', runId: msg.runId, result })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (msg.type === 'run') post({ type: 'run-failed', runId: msg.runId, message })
    else post({ type: 'fatal', message })
  }
}
