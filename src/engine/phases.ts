/**
 * Phases, and the facts they pass between one another.
 *
 * This engine has two orchestrators — the weekly tick and the season roll —
 * and both were the same thing: one long procedure with its sections numbered
 * in comments, every local reachable from every line, and the numbers the only
 * statement anywhere of what ran when. In the tick the numbers had rotted to
 * the point of two sections both called `7b`, in an order that read 7b, 7a2,
 * 7b2, 7c, 8, 7b, 8b.
 *
 * That is not a tidiness complaint. Both ordering bugs this project has
 * actually shipped were one shape — a later section reading something an
 * earlier one had not built yet, or had already thrown away:
 *
 *   - gate receipts read off match results *after* those results were trimmed
 *     to save space, so every club in the world took nothing at the gate;
 *   - a per-week cache keyed on a fixture count taken before the cup draw
 *     added that week's ties, so it went stale inside the same tick.
 *
 * Neither is hard to find once you know it is there. Both are invisible in a
 * procedure where every line can reach every local.
 *
 * So a stage of work is a phase: a value with a name, a declaration of the
 * facts it reads and the facts it writes, and a body. The declaration is
 * enforced at run time rather than believed:
 *
 *   - reading a fact the phase did not declare throws;
 *   - writing a fact the phase did not declare throws;
 *   - **reading a fact nothing has written yet throws**, which is the ordering
 *     bug above, caught where it happens and named.
 *
 * What it does not catch, so nobody trusts it further than it goes: this
 * guards the *bindings*, not what is behind them. A phase that legitimately
 * reads a collection and then mutates something reachable through it is doing
 * something no proxy can see. Deep mutation is still a matter of reading the
 * code.
 *
 * **A convention, since the guard cannot tell.** Declare `writes` when a phase
 * is a *producer* of a fact — whether it assigns the binding or fills the
 * collection behind it. A phase that fills a Set it was handed declares both:
 * it reads the binding and it writes through it.
 *
 * **And a constraint the guard says nothing about.** `Rng.fork` draws from its
 * parent, so the *sequence* of fork calls decides every random number in the
 * run. Moving a phase, or adding one that forks, reshuffles every draw after
 * it. The world stays deterministic for a given seed, so this is not a
 * correctness problem — but it does mean no reordering is free, and a change
 * meant to be pure will not be. `scripts/worldhash.ts` is how you find out
 * which you did.
 */

/** One stage of an orchestrated run. */
export interface Phase<Facts, Ctx> {
  /** Named in the error when this phase breaks its declaration. */
  name: string
  /** Facts this phase may read. */
  reads?: readonly (keyof Facts)[]
  /** Facts this phase produces, by assignment or by filling. */
  writes?: readonly (keyof Facts)[]
  run(ctx: Ctx): void
}

/**
 * A `phase(...)` for one orchestrator's fact set.
 *
 * A function returning a function only so that phase files can write
 * `phase({ name, reads, writes, run })` and have every field inferred and
 * checked without annotating each one.
 */
export function phaseFactory<Facts, Ctx>() {
  return (p: Phase<Facts, Ctx>): Phase<Facts, Ctx> => p
}

export interface GuardedFacts<Facts extends object> {
  /** The bag itself. Hand it to phases; do not read it outside one. */
  facts: Facts
  /** Point the guard at a phase for the duration of its run. */
  enter: (p: { name: string; reads?: readonly (keyof Facts)[]; writes?: readonly (keyof Facts)[] }) => void
}

/**
 * Build a fact bag and the guard that polices it.
 *
 * The guard is a Proxy. A run touches these a few dozen times in total, so the
 * cost does not clear the noise on a tick that spends its time simulating
 * matches — measured, not assumed. It is always on: a check that only runs
 * under test is a check that drifts from the code it is meant to be checking.
 */
export function guardedFacts<Facts extends object>(): GuardedFacts<Facts> {
  const store: Partial<Facts> = {}
  const written = new Set<keyof Facts>()
  let current: { name: string; reads?: readonly (keyof Facts)[]; writes?: readonly (keyof Facts)[] } | null = null

  const declared = (list: readonly (keyof Facts)[] | undefined, name: keyof Facts) =>
    list !== undefined && list.includes(name)

  const facts = new Proxy(store as Facts, {
    get(target, key) {
      const name = key as keyof Facts
      if (!current) throw new Error(`fact "${String(name)}" read outside any phase`)
      if (!declared(current.reads, name)) {
        throw new Error(
          `phase "${current.name}" read fact "${String(name)}" without declaring it. `
          + "Add it to that phase's `reads`, or stop reading it.",
        )
      }
      if (!written.has(name)) {
        // The ordering bug, named where it happens. Either this phase is too
        // early or the one that produces the fact is too late, and the
        // manifest is where that gets decided.
        throw new Error(
          `phase "${current.name}" read fact "${String(name)}" before anything wrote it. `
          + 'Something earlier in the run has to produce it.',
        )
      }
      return target[name]
    },
    set(target, key, value) {
      const name = key as keyof Facts
      if (!current) throw new Error(`fact "${String(name)}" written outside any phase`)
      if (!declared(current.writes, name)) {
        throw new Error(
          `phase "${current.name}" wrote fact "${String(name)}" without declaring it. `
          + "Add it to that phase's `writes`, or stop writing it.",
        )
      }
      ;(target as unknown as Record<string, unknown>)[name as string] = value
      written.add(name)
      return true
    },
  })

  return { facts, enter: (p) => { current = p } }
}

/** Run a manifest in order, with each phase's declaration enforced as it goes. */
export function runPhases<Facts extends object, Ctx>(
  manifest: readonly Phase<Facts, Ctx>[],
  guard: GuardedFacts<Facts>,
  ctx: Ctx,
): void {
  for (const p of manifest) {
    guard.enter(p)
    p.run(ctx)
  }
}
