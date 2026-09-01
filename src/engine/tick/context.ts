import type { Rng } from '../rng'
import type { IdFactory } from '../ids'
import type { NameGenerator } from '../names/generator'
import type { Club, Fixture, GameState, ID, MatchResult } from '../types'

/**
 * What a week is made of, and who is allowed to touch it.
 *
 * `advanceWeek` used to be one six-hundred-line procedure whose sections were
 * numbered in comments. The numbers were the only statement of what ran when,
 * and they rotted: by the end there were two sections both called `7b`, and
 * the order on the page read 7b, 7a2, 7b2, 7c, 8, 7b, 8b. A reader could not
 * tell whether international football running after scouting was a decision or
 * an accident, because nothing anywhere said what either of them needed.
 *
 * That is not a cosmetic complaint. Both of the ordering bugs this project has
 * actually shipped were of one shape — a later section reading something an
 * earlier section had not built yet, or had already thrown away:
 *
 *   - gate receipts were read off match results *after* those results had been
 *     trimmed to save space, so every club's income was zero;
 *   - a per-week cache was keyed on a fixture count taken before the cup draw
 *     added that week's ties, so it went stale within the same tick.
 *
 * Neither is a hard bug to find once you know it is there. Both are invisible
 * in a procedure where every section can reach every local.
 *
 * So the week is now a list of phases, and the things phases pass between one
 * another are named. A phase declares what it reads and what it writes, and
 * the declaration is enforced at run time rather than believed:
 *
 *   - reading a fact the phase did not declare throws;
 *   - writing a fact the phase did not declare throws;
 *   - **reading a fact nothing has written yet throws**, which is the ordering
 *     bug above, caught at the moment it happens and named.
 *
 * What it does not catch, stated plainly so nobody trusts it further than it
 * goes: this guards the *bindings*, not what is behind them. A phase that
 * legitimately reads `playedClubs` and then mutates a match result reachable
 * through it is doing something no proxy can see. Deep mutation is still a
 * matter of reading the code.
 */

/**
 * The values a week passes between its phases.
 *
 * Deliberately small. This is not "everything the tick touches" — that would
 * be `GameState`, and declaring it would say nothing. These are the working
 * values that exist only for the duration of one week and are computed by one
 * phase for the benefit of another.
 */
export interface TickFacts {
  /** Every club in the world, in a stable order. */
  allClubs: Club[]
  /**
   * True when a club is due its turn in a staggered pass this week.
   *
   * The player's club is always due. Everyone else is spread across `period`
   * weeks so a phone is not asked to run the whole world every tick.
   */
  inRotation: (club: Club, period: number) => boolean
  /** This week's unplayed fixtures. */
  weekFixtures: Fixture[]
  /** Players serving a suspension this week, from accumulated cards. */
  suspendedIds: Set<ID>
  /** Clubs that played this week, and so are due fatigue and injury. */
  playedClubs: Set<ID>
  /**
   * Home gate for each club that hosted, captured while the result still has
   * it. Most results are trimmed immediately after the match to keep the save
   * small, so this is the only surviving record by the time finance runs.
   */
  gateReceipts: Map<ID, number>
  /**
   * The club the player is in charge of, or null.
   *
   * A fact rather than a lookup because it *changes during the week*: a
   * director who cannot field a side is dismissed before kick-off, and every
   * phase after that must see the club as somebody else's. That used to be
   * three separate calls to `playerClub(state)` at three different points in
   * the procedure, with nothing saying why they might disagree.
   */
  playerClub: Club | null
  /** Fixtures involving the player's club, for the results screen. */
  playerFixtures: { fixture: Fixture; result: MatchResult }[]
}

export type FactName = keyof TickFacts

/** Everything a phase is given. */
export interface TickContext {
  state: GameState
  ids: IdFactory
  names: NameGenerator
  /** The week's root stream. Phases fork it; nobody draws from it directly. */
  rng: Rng
  /** The week being played. Read often enough to be worth not spelling out. */
  week: number
  /** The declared, enforced working set. */
  facts: TickFacts
  /** Set by whichever phase ends the director's employment. */
  sack: (message: string) => void
  /** Set by the rollover phase. */
  endSeason: () => void
}

/**
 * One step of a week.
 *
 * A phase is a value, not a comment. It can be listed, counted, reordered,
 * tested on its own, and — because `reads` and `writes` are checked — it
 * cannot quietly start depending on something it never declared.
 */
export interface Phase {
  /** Shown in the error when this phase breaks its declaration. */
  name: string
  /** Facts this phase may read. */
  reads?: readonly FactName[]
  /** Facts this phase may write. */
  writes?: readonly FactName[]
  run(ctx: TickContext): void
}

/** Declare a phase. A function only so the types land without annotation. */
export function phase(p: Phase): Phase {
  return p
}

/**
 * Build the fact bag and the guard that polices it.
 *
 * The guard is a Proxy: about forty property accesses across a whole week, so
 * the cost does not show up against a tick that spends its time simulating
 * matches. It is always on. A check that only runs under test is a check that
 * drifts from the code it is meant to be checking.
 */
export function createFacts(): {
  facts: TickFacts
  /** Point the guard at a phase for the duration of its run. */
  enter: (p: Phase) => void
  /** Facts nothing wrote, for the report at the end of a week. */
  unwritten: () => FactName[]
} {
  const store: Partial<TickFacts> = {}
  const written = new Set<FactName>()
  let current: Phase | null = null

  const allowed = (list: readonly FactName[] | undefined, name: FactName) =>
    list !== undefined && list.includes(name)

  const facts = new Proxy(store as TickFacts, {
    get(target, key) {
      const name = key as FactName
      if (!current) {
        throw new Error(`tick fact "${String(name)}" read outside any phase`)
      }
      if (!allowed(current.reads, name)) {
        throw new Error(
          `phase "${current.name}" read fact "${String(name)}" without declaring it. `
          + `Add it to that phase's \`reads\`, or stop reading it.`,
        )
      }
      if (!written.has(name)) {
        // The ordering bug, named at the moment it happens. Either this phase
        // is too early or the phase that produces the fact is too late; the
        // manifest in index.ts is where that gets decided.
        throw new Error(
          `phase "${current.name}" read fact "${String(name)}" before anything wrote it. `
          + `Something earlier in the week has to produce it.`,
        )
      }
      return target[name]
    },
    set(target, key, value) {
      const name = key as FactName
      if (!current) {
        throw new Error(`tick fact "${String(name)}" written outside any phase`)
      }
      if (!allowed(current.writes, name)) {
        throw new Error(
          `phase "${current.name}" wrote fact "${String(name)}" without declaring it. `
          + `Add it to that phase's \`writes\`, or stop writing it.`,
        )
      }
      ;(target as unknown as Record<string, unknown>)[name as string] = value
      written.add(name)
      return true
    },
  })

  return {
    facts,
    enter: (p: Phase) => { current = p },
    unwritten: () => {
      const all: FactName[] = [
        'allClubs', 'inRotation', 'weekFixtures', 'suspendedIds', 'playedClubs',
        'gateReceipts', 'playerClub', 'playerFixtures',
      ]
      return all.filter((name) => !written.has(name))
    },
  }
}
