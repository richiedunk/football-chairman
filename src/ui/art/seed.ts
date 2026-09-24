/**
 * Deterministic choice from a string.
 *
 * Every generated picture in the game — a crest, a kit, a face — is a pure
 * function of an id. The same club gets the same crest on every screen, on
 * every device, in every save, and nothing has to be stored to make that true.
 */

/** FNV-1a, 32-bit. Small, fast, and spreads short ids like `c12` well. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32: a seeded stream of floats in [0, 1). */
export function stream(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One item from a list, weighted. Weights need not sum to anything. */
export function weighted<T>(rand: () => number, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, w]) => sum + w, 0)
  let roll = rand() * total
  for (const [value, w] of options) {
    roll -= w
    if (roll < 0) return value
  }
  return options[options.length - 1][0]
}
