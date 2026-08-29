import { describe, expect, it } from 'vitest'
import { Rng, clamp, remap } from '../src/engine/rng'

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng('SEED123')
    const b = new Rng('SEED123')
    const left = Array.from({ length: 500 }, () => a.next())
    const right = Array.from({ length: 500 }, () => b.next())
    expect(left).toEqual(right)
  })

  it('produces different streams for different seeds', () => {
    const a = new Rng('SEED123')
    const b = new Rng('SEED124')
    expect(a.next()).not.toBe(b.next())
  })

  it('stays within [0, 1)', () => {
    const rng = new Rng('bounds')
    for (let i = 0; i < 20_000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('distributes uniformly enough for gameplay', () => {
    const rng = new Rng('uniform')
    const buckets = new Array(10).fill(0)
    const samples = 100_000
    for (let i = 0; i < samples; i++) buckets[Math.floor(rng.next() * 10)]++
    for (const count of buckets) {
      // Each bucket should hold ~10%; allow a generous 1.5% band.
      expect(Math.abs(count / samples - 0.1)).toBeLessThan(0.015)
    }
  })

  it('respects int bounds inclusively', () => {
    const rng = new Rng('ints')
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) {
      const value = rng.int(3, 7)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(7)
      seen.add(value)
    }
    expect(seen.size).toBe(5)
  })

  it('produces a normal distribution with the requested moments', () => {
    const rng = new Rng('normal')
    const values = Array.from({ length: 50_000 }, () => rng.normal(50, 10))
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    expect(mean).toBeGreaterThan(49.5)
    expect(mean).toBeLessThan(50.5)
    expect(Math.sqrt(variance)).toBeGreaterThan(9.5)
    expect(Math.sqrt(variance)).toBeLessThan(10.5)
  })

  it('keeps the Box-Muller spare independent of the primary value', () => {
    // The spare is returned on alternate calls; a bug here would show up as
    // adjacent draws being correlated.
    const rng = new Rng('spare')
    const evens: number[] = []
    const odds: number[] = []
    for (let i = 0; i < 20_000; i++) {
      ;(i % 2 === 0 ? evens : odds).push(rng.normal())
    }
    const correlation = pearson(evens, odds)
    expect(Math.abs(correlation)).toBeLessThan(0.05)
  })

  it('weights selections proportionally', () => {
    const rng = new Rng('weights')
    const counts = { a: 0, b: 0 }
    for (let i = 0; i < 20_000; i++) {
      counts[rng.weighted(['a', 'b'] as const, [3, 1])]++
    }
    expect(counts.a / (counts.a + counts.b)).toBeGreaterThan(0.72)
    expect(counts.a / (counts.a + counts.b)).toBeLessThan(0.78)
  })

  it('forks into independent streams', () => {
    const parent = new Rng('fork')
    const a = parent.fork('one')
    const b = parent.fork('two')
    expect(a.next()).not.toBe(b.next())
  })
})

describe('helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })

  it('remaps between ranges', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50)
    expect(remap(-5, 0, 10, 0, 100)).toBe(0)
  })
})

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n
  const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n
  let num = 0
  let denomA = 0
  let denomB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denomA += da * da
    denomB += db * db
  }
  return num / Math.sqrt(denomA * denomB)
}
