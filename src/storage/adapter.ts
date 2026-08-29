/**
 * Persistence.
 *
 * A generated world is around 19MB of JSON — comfortably beyond localStorage's
 * ~5MB ceiling. Rather than shrink the world, saves are gzipped through the
 * platform's own CompressionStream, which takes a typical save to roughly 1.5MB.
 * That fits everywhere, including base64 in localStorage as a last resort.
 *
 * Everything sits behind this interface so the same game code runs unchanged
 * on the web, in a Capacitor WebView, and in Node for headless tests. Swapping
 * IndexedDB for Capacitor Filesystem on native is a new implementation of
 * `StorageAdapter`, not a change to any game system.
 */

export interface SaveSlotMeta {
  id: string
  name: string
  savedAt: number
  /** Uncompressed byte length, for the UI. */
  size: number
  /** Denormalised so the load screen does not have to decompress every save. */
  summary: {
    directorName: string
    clubName: string
    leagueName: string
    season: number
    week: number
    level: number
    xp: number
  }
}

export interface StorageAdapter {
  readonly name: string
  list(): Promise<SaveSlotMeta[]>
  read(id: string): Promise<Uint8Array | null>
  write(id: string, data: Uint8Array, meta: SaveSlotMeta): Promise<void>
  remove(id: string): Promise<void>
  /** Bytes available, or null when the platform will not say. */
  quota(): Promise<{ used: number; available: number } | null>
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

const hasCompressionStream =
  typeof globalThis !== 'undefined' && typeof (globalThis as unknown as {
    CompressionStream?: unknown
  }).CompressionStream === 'function'

export async function compress(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  if (!hasCompressionStream) return bytes

  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

export async function decompress(data: Uint8Array): Promise<string> {
  if (!hasCompressionStream) return new TextDecoder().decode(data)

  // Gzip magic number. Saves written before compression was available, or on a
  // platform without it, are stored as plain UTF-8 and must still load.
  if (!(data[0] === 0x1f && data[1] === 0x8b)) {
    return new TextDecoder().decode(data)
  }

  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

// ---------------------------------------------------------------------------
// IndexedDB — the primary store in a browser and in a Capacitor WebView
// ---------------------------------------------------------------------------

const DB_NAME = 'director-of-football'
const DB_VERSION = 1
const SAVES_STORE = 'saves'
const META_STORE = 'meta'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SAVES_STORE)) db.createObjectStore(SAVES_STORE)
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export class IndexedDbAdapter implements StorageAdapter {
  readonly name = 'IndexedDB'

  static isAvailable(): boolean {
    return typeof indexedDB !== 'undefined'
  }

  async list(): Promise<SaveSlotMeta[]> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(META_STORE, 'readonly')
      const all = await promisify(tx.objectStore(META_STORE).getAll())
      return (all as SaveSlotMeta[]).sort((a, b) => b.savedAt - a.savedAt)
    } finally {
      db.close()
    }
  }

  async read(id: string): Promise<Uint8Array | null> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(SAVES_STORE, 'readonly')
      const value = await promisify(tx.objectStore(SAVES_STORE).get(id))
      if (!value) return null
      return value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer)
    } finally {
      db.close()
    }
  }

  async write(id: string, data: Uint8Array, meta: SaveSlotMeta): Promise<void> {
    const db = await openDatabase()
    try {
      const tx = db.transaction([SAVES_STORE, META_STORE], 'readwrite')
      tx.objectStore(SAVES_STORE).put(data, id)
      tx.objectStore(META_STORE).put(meta, id)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  async remove(id: string): Promise<void> {
    const db = await openDatabase()
    try {
      const tx = db.transaction([SAVES_STORE, META_STORE], 'readwrite')
      tx.objectStore(SAVES_STORE).delete(id)
      tx.objectStore(META_STORE).delete(id)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  async quota(): Promise<{ used: number; available: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const estimate = await navigator.storage.estimate()
    return {
      used: estimate.usage ?? 0,
      available: (estimate.quota ?? 0) - (estimate.usage ?? 0),
    }
  }
}

// ---------------------------------------------------------------------------
// localStorage — fallback only
// ---------------------------------------------------------------------------

/**
 * Stores compressed saves as base64. Base64 costs a third in size, so a 1.5MB
 * compressed save becomes ~2MB — inside the usual 5MB budget, but only just.
 * This exists so the game still works in a private window or wherever
 * IndexedDB is unavailable, not as the intended path.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage'
  private prefix = 'dof:save:'
  private metaPrefix = 'dof:meta:'

  static isAvailable(): boolean {
    try {
      const key = '__dof_probe__'
      localStorage.setItem(key, '1')
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }

  async list(): Promise<SaveSlotMeta[]> {
    const out: SaveSlotMeta[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(this.metaPrefix)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        out.push(JSON.parse(raw) as SaveSlotMeta)
      } catch {
        // A corrupt meta entry should not make the whole load screen fail.
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  }

  async read(id: string): Promise<Uint8Array | null> {
    const raw = localStorage.getItem(this.prefix + id)
    if (!raw) return null
    return base64ToBytes(raw)
  }

  async write(id: string, data: Uint8Array, meta: SaveSlotMeta): Promise<void> {
    try {
      localStorage.setItem(this.prefix + id, bytesToBase64(data))
      localStorage.setItem(this.metaPrefix + id, JSON.stringify(meta))
    } catch (error) {
      throw new Error(
        'Not enough browser storage to save. Delete an old save and try again.',
        { cause: error },
      )
    }
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(this.prefix + id)
    localStorage.removeItem(this.metaPrefix + id)
  }

  async quota(): Promise<{ used: number; available: number } | null> {
    let used = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      used += (localStorage.getItem(key)?.length ?? 0) * 2
    }
    return { used, available: Math.max(0, 5 * 1024 * 1024 - used) }
  }
}

// ---------------------------------------------------------------------------
// In-memory — headless tests
// ---------------------------------------------------------------------------

export class MemoryAdapter implements StorageAdapter {
  readonly name = 'memory'
  private saves = new Map<string, Uint8Array>()
  private metas = new Map<string, SaveSlotMeta>()

  async list(): Promise<SaveSlotMeta[]> {
    return Array.from(this.metas.values()).sort((a, b) => b.savedAt - a.savedAt)
  }
  async read(id: string): Promise<Uint8Array | null> {
    return this.saves.get(id) ?? null
  }
  async write(id: string, data: Uint8Array, meta: SaveSlotMeta): Promise<void> {
    this.saves.set(id, data)
    this.metas.set(id, meta)
  }
  async remove(id: string): Promise<void> {
    this.saves.delete(id)
    this.metas.delete(id)
  }
  async quota(): Promise<{ used: number; available: number } | null> {
    return null
  }
}

/** Pick the best adapter this platform offers. */
export function createStorageAdapter(): StorageAdapter {
  if (IndexedDbAdapter.isAvailable()) return new IndexedDbAdapter()
  if (typeof localStorage !== 'undefined' && LocalStorageAdapter.isAvailable()) {
    return new LocalStorageAdapter()
  }
  return new MemoryAdapter()
}

// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked so a multi-megabyte save does not blow the argument limit on
  // String.fromCharCode.
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
