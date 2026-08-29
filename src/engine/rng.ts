/**
 * Deterministic seeded RNG.
 *
 * The whole simulation runs off explicit RNG instances rather than Math.random
 * so that a save file plus a seed fully determines the world. That matters for
 * reproducing bugs, for regenerating a world from a short seed string instead
 * of storing every generated entity, and for keeping autosaves honest — a
 * player cannot reload to reroll a transfer outcome unless we let them.
 *
 * Uses xoshiro128** over a SplitMix32-expanded seed: fast, tiny, and a much
 * better distribution than the usual `sin(seed)` hack.
 */
export class Rng {
  private s0 = 0
  private s1 = 0
  private s2 = 0
  private s3 = 0
  /** Spare value from the last Box-Muller pair — see `normal`. */
  private spareNormal: number | null = null

  constructor(seed: number | string) {
    const n = typeof seed === 'string' ? hashString(seed) : seed >>> 0
    let x = n === 0 ? 0x9e3779b9 : n >>> 0
    // SplitMix32 to spread one 32-bit seed across the four state words.
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0
      let z = x
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
      return (z ^ (z >>> 15)) >>> 0
    }
    this.s0 = next()
    this.s1 = next()
    this.s2 = next()
    this.s3 = next()
  }

  /** Raw 32-bit unsigned integer. */
  nextUint(): number {
    const result = Math.imul(this.s1, 5) >>> 0
    const rotated = ((result << 7) | (result >>> 25)) >>> 0
    const out = Math.imul(rotated, 9) >>> 0

    const t = (this.s1 << 9) >>> 0
    this.s2 ^= this.s0
    this.s3 ^= this.s1
    this.s1 ^= this.s2
    this.s0 ^= this.s3
    this.s2 ^= t
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0
    return out
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint() / 4294967296
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with empty array')
    return items[this.int(0, items.length - 1)]
  }

  /**
   * Pick from `items` using parallel `weights`. Weights need not sum to 1.
   * Non-positive weights are treated as zero.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error('Rng.weighted called with empty array')
    let total = 0
    for (const w of weights) total += Math.max(0, w)
    if (total <= 0) return this.pick(items)
    let roll = this.next() * total
    for (let i = 0; i < items.length; i++) {
      roll -= Math.max(0, weights[i] ?? 0)
      if (roll <= 0) return items[i]
    }
    return items[items.length - 1]
  }

  /** Pick from a list of `[item, weight]` pairs. */
  weightedPairs<T>(pairs: readonly (readonly [T, number])[]): T {
    return this.weighted(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1]),
    )
  }

  /** Fisher-Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      const tmp = out[i]
      out[i] = out[j]
      out[j] = tmp
    }
    return out
  }

  /** Take `n` distinct items. Returns fewer if the pool is smaller. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, n))
  }

  /**
   * Normally distributed value (Box-Muller), clamped to +/- 4 sigma so a
   * freak tail cannot produce a 300-rated wonderkid.
   */
  normal(mean = 0, stdDev = 1): number {
    // Box-Muller yields two independent normals per pair of uniforms. Keeping
    // the second halves the cost of the transcendentals, which matters: the
    // simulation draws tens of thousands of normals per week.
    if (this.spareNormal !== null) {
      const spare = this.spareNormal
      this.spareNormal = null
      return mean + clamp(spare, -4, 4) * stdDev
    }
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    const radius = Math.sqrt(-2 * Math.log(u))
    const angle = 2 * Math.PI * v
    this.spareNormal = radius * Math.sin(angle)
    const z = radius * Math.cos(angle)
    return mean + clamp(z, -4, 4) * stdDev
  }

  /** Normal, clamped to [min, max] and rounded. */
  normalInt(mean: number, stdDev: number, min: number, max: number): number {
    return Math.round(clamp(this.normal(mean, stdDev), min, max))
  }

  /**
   * A fresh, independent Rng derived from this one. Used to give each
   * subsystem its own stream so adding a die roll in, say, the media system
   * does not shift every subsequent match result.
   */
  fork(label = ''): Rng {
    return new Rng(`${this.nextUint()}:${label}`)
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

/** Map `value` from one range to another, clamped to the output range. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin
  return clamp(outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax))
}

/** Generate a short, readable seed string for a new save. */
export function randomSeed(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
