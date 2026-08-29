import { compress as compressInline, decompress as decompressInline } from './adapter'

/**
 * Client for the compression worker, with a synchronous fallback.
 *
 * Workers are unavailable in a few real situations — headless Node tests, a
 * strict CSP, an older WebView — so every call falls back to doing the work
 * inline rather than failing. The game must always be able to save.
 */

type PendingResolve = (data: Uint8Array) => void
type PendingReject = (error: Error) => void

let worker: Worker | null = null
let workerFailed = false
let nextRequestId = 1
const pending = new Map<number, { resolve: PendingResolve; reject: PendingReject }>()

function getWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker
  if (typeof Worker === 'undefined') {
    workerFailed = true
    return null
  }
  try {
    worker = new Worker(new URL('./compressionWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent) => {
      const { id, ok, data, error } = event.data as {
        id: number; ok: boolean; data?: ArrayBuffer; error?: string
      }
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (ok && data) entry.resolve(new Uint8Array(data))
      else entry.reject(new Error(error ?? 'Compression failed'))
    }
    worker.onerror = () => {
      // One failure is enough: fall back permanently rather than retrying a
      // worker that cannot start, which would stall every subsequent save.
      workerFailed = true
      for (const entry of pending.values()) {
        entry.reject(new Error('Compression worker failed'))
      }
      pending.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

function run(op: 'compress' | 'decompress', bytes: Uint8Array): Promise<Uint8Array> | null {
  const active = getWorker()
  if (!active) return null

  const id = nextRequestId++
  // Copy before transferring: the caller's buffer would otherwise be detached
  // out from under them, which is a genuinely baffling bug to debug.
  const copy = bytes.slice()
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject })
  })
  active.postMessage({ id, op, data: copy.buffer }, [copy.buffer])
  return promise
}

export async function compressAsync(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  const viaWorker = run('compress', bytes)
  if (!viaWorker) return compressInline(text)
  try {
    return await viaWorker
  } catch {
    return compressInline(text)
  }
}

export async function decompressAsync(data: Uint8Array): Promise<string> {
  const viaWorker = run('decompress', data)
  if (!viaWorker) return decompressInline(data)
  try {
    return new TextDecoder().decode(await viaWorker)
  } catch {
    return decompressInline(data)
  }
}
