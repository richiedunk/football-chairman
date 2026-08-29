/// <reference lib="webworker" />

/**
 * Compression worker.
 *
 * Gzipping a save takes the better part of a second, and the same again to
 * inflate it. On the main thread that is a visibly frozen UI every time the
 * game autosaves — on a mid-range phone, considerably worse.
 *
 * Only the compression crosses the thread boundary, not the game state:
 * structured-cloning a 30MB object graph would cost more than the compression
 * it was meant to move. The caller serialises to bytes and transfers the
 * buffer, so the hand-off itself is free.
 */

type Request =
  | { id: number; op: 'compress'; data: ArrayBuffer }
  | { id: number; op: 'decompress'; data: ArrayBuffer }

type Response =
  | { id: number; ok: true; data: ArrayBuffer }
  | { id: number; ok: false; error: string }

const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, op, data } = event.data
  try {
    const bytes = new Uint8Array(data)
    const out = op === 'compress' ? await gzip(bytes) : await gunzip(bytes)
    const response: Response = { id, ok: true, data: out.buffer as ArrayBuffer }
    ;(self as unknown as Worker).postMessage(response, [out.buffer as ArrayBuffer])
  } catch (error) {
    const response: Response = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'function') return bytes
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Saves written on a platform without CompressionStream are stored as plain
  // UTF-8 and must still load here.
  if (typeof DecompressionStream !== 'function') return bytes
  if (!(bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1)) return bytes
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export {}
