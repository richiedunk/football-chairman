import { describe, expect, it } from 'vitest'
import { guardedFacts, phaseFactory, runPhases, type Phase } from '../src/engine/phases'
import { WEEK } from '../src/engine/tick'
import { ROLL } from '../src/engine/season'

/**
 * The guard on the guard.
 *
 * `phases.ts` is the only thing standing between this engine and the class of
 * bug it has shipped twice — a stage of work reading something an earlier
 * stage had not produced, or had already destroyed. Both orchestrators depend
 * on it, and if it quietly stopped guarding, nothing anywhere would fail.
 * Every check below would still pass against an engine with the enforcement
 * ripped out, so these are here to say that it enforces.
 *
 * The manifest checks at the bottom are the more useful half. They read the
 * declarations of the real week and the real season roll and prove the order
 * holds — statically, in a millisecond, without simulating anything. A phase
 * moved above the thing that feeds it fails here rather than in season four of
 * somebody's save.
 */

interface Facts { a: number; b: number }
type Ctx = { facts: Facts }
const phase = phaseFactory<Facts, Ctx>()

function run(manifest: Phase<Facts, Ctx>[]): void {
  const guard = guardedFacts<Facts>()
  runPhases(manifest, guard, { facts: guard.facts })
}

describe('a phase cannot touch what it did not declare', () => {
  it('lets a declared write through, and a declared read of it afterwards', () => {
    let seen = 0
    run([
      phase({ name: 'writer', writes: ['a'], run: ({ facts }) => { facts.a = 7 } }),
      phase({ name: 'reader', reads: ['a'], run: ({ facts }) => { seen = facts.a } }),
    ])
    expect(seen).toBe(7)
  })

  it('throws on a read the phase did not declare, and names both', () => {
    expect(() => run([
      phase({ name: 'writer', writes: ['a'], run: ({ facts }) => { facts.a = 1 } }),
      phase({ name: 'sneak', run: ({ facts }) => { void facts.a } }),
    ])).toThrow(/phase "sneak" read fact "a" without declaring it/)
  })

  it('throws on a write the phase did not declare', () => {
    expect(() => run([
      phase({ name: 'sneak', run: ({ facts }) => { facts.a = 1 } }),
    ])).toThrow(/phase "sneak" wrote fact "a" without declaring it/)
  })

  it('throws on a read of a fact nothing has written — the ordering bug', () => {
    // The one that matters. Declared correctly, in the wrong order.
    expect(() => run([
      phase({ name: 'early', reads: ['a'], run: ({ facts }) => { void facts.a } }),
      phase({ name: 'late', writes: ['a'], run: ({ facts }) => { facts.a = 1 } }),
    ])).toThrow(/phase "early" read fact "a" before anything wrote it/)
  })

  it('lets a phase read back a fact it wrote itself, when it declares both', () => {
    expect(() => run([
      phase({
        name: 'both', reads: ['a'], writes: ['a'],
        run: ({ facts }) => { facts.a = 1; facts.a = facts.a + 1 },
      }),
    ])).not.toThrow()
  })

  it('refuses to hand out a fact outside any phase at all', () => {
    const guard = guardedFacts<Facts>()
    expect(() => guard.facts.a).toThrow(/outside any phase/)
  })
})

/**
 * The real manifests, checked without running them.
 *
 * `reads` and `writes` are enough to prove the order on their own: every fact
 * a phase reads must be produced by that phase or one before it. Simulating a
 * season would find the same faults, eventually, in whichever week the phase
 * happened to do anything.
 */
function checkOrder(name: string, manifest: readonly Phase<never, never>[]): void {
  describe(name, () => {
    it('never reads a fact before something has produced it', () => {
      const produced = new Set<string>()
      const faults: string[] = []
      for (const p of manifest) {
        for (const fact of p.writes ?? []) produced.add(String(fact))
        for (const fact of p.reads ?? []) {
          if (!produced.has(String(fact))) {
            faults.push(`${p.name} reads "${String(fact)}" before anything writes it`)
          }
        }
      }
      expect(faults).toEqual([])
    })

    it('produces nothing that nothing reads', () => {
      // A fact written and never read is the dial problem in miniature: work
      // done every run for nobody.
      const read = new Set<string>()
      for (const p of manifest) for (const f of p.reads ?? []) read.add(String(f))
      const orphans: string[] = []
      for (const p of manifest) {
        for (const f of p.writes ?? []) {
          if (!read.has(String(f))) orphans.push(`${p.name} writes "${String(f)}", read by nothing`)
        }
      }
      expect(orphans).toEqual([])
    })

    it('has a name for every phase, and no duplicates', () => {
      const names = manifest.map((p) => p.name)
      expect(names.filter((n) => !n)).toEqual([])
      expect(new Set(names).size).toBe(names.length)
    })
  })
}

checkOrder('the week', WEEK as readonly Phase<never, never>[])
checkOrder('the season roll', ROLL as readonly Phase<never, never>[])
