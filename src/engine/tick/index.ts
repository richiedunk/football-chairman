import { Rng } from '../rng'
import { IdFactory } from '../ids'
import { NameGenerator } from '../names/generator'
import type { TransferAttemptStats } from '../systems/transfers'
import { guardedFacts, runPhases } from '../phases'
import { academyIntake, openTheWeek, seasonClock } from './phases/calendar'
import { cupDraws, cupRounds, fixtureList, matchdayIntegrity, matches } from './phases/matchday'
import { clubWeek, development, morale, squadWarning, worldRotation } from './phases/clubWeek'
import { deadlineDay, frozenOutClients, registrationLock, scouting, takeovers, transfers, valuations } from './phases/market'
import { internationalCallUps, internationalDuty, internationalTournament } from './phases/international'
import { contracts, dataDepartment } from './phases/backroom'
import { press } from './phases/press'
import { aiBoard, architects, boardAndCoach, housekeeping } from './phases/boardroom'
import type { TickContext, TickFacts, TickPhase } from './context'
import type { Fixture, GameState, MatchResult } from '../types'

/**
 * The weekly tick.
 *
 * One call advances the world by a week: matches are played, players develop
 * and get injured, money moves, the press writes, the board judges, and the
 * inbox fills with things that need answering.
 *
 * This file is now a manifest and a loop, and that is all it is. The week is
 * the list below, in order, and the work is in the phases. Subtle bugs in a
 * simulation of this shape are almost always ordering bugs, and the previous
 * arrangement — one six-hundred-line procedure with its sections numbered in
 * comments — made them as hard to see as they can be made. By the end the
 * numbers did not even sort: there were two sections both called `7b`, and the
 * page read 7b, 7a2, 7b2, 7c, 8, 7b, 8b. Nothing anywhere said what any
 * section needed, so nothing could tell you whether an order was a decision.
 *
 * A phase declares the facts it reads and the facts it writes, and `context.ts`
 * enforces both at run time — including the case that actually ships bugs here,
 * a phase reading something no earlier phase has produced.
 *
 * **Two constraints on reordering, before anybody tries.**
 *
 * The first is the declarations, which will tell you loudly. The second will
 * not: `Rng.fork` draws from its parent, so the *sequence* of fork calls across
 * a week decides every random number in it. Moving a phase, or adding one that
 * forks, reshuffles every draw after it. That is not a correctness problem —
 * the world stays deterministic for a given seed — but it does mean any
 * reordering changes the world, and a change that was meant to be pure will
 * not be. `scripts/worldhash.ts` is how you find out which you did.
 */

export interface TickResult {
  /** Matches involving the player's club, for the results screen. */
  playerFixtures: { fixture: Fixture; result: MatchResult }[]
  /** True when the season rolled over during this tick. */
  seasonEnded: boolean
  /** True when the director was dismissed. */
  sacked: boolean
  sackMessage?: string
}

export interface TickDeps {
  ids: IdFactory
  names: NameGenerator
  /**
   * A tally for the AI transfer market, when something is counting.
   *
   * Absent in the game and in every test. `scripts/attemptcheck.ts` passes one
   * in to find out which of five conditions is actually binding, a question
   * that has been guessed wrong twice. It threads through the tick because the
   * alternative — a module variable in `transfers.ts`, which is what this was
   * — is state shared by every world in the process and switched on from
   * somewhere else entirely.
   */
  transferStats?: TransferAttemptStats
}

/**
 * A week, in order.
 *
 * Read it top to bottom and you have read the game. Adding something to the
 * week means adding a phase and putting it here; there is no longer a
 * six-hundred-line procedure to find the right place inside.
 */
export const WEEK: readonly TickPhase[] = [
  openTheWeek,
  academyIntake,

  cupDraws,
  fixtureList,
  matchdayIntegrity,
  matches,
  cupRounds,

  worldRotation,
  clubWeek,
  development,
  squadWarning,
  morale,

  valuations,
  transfers,
  registrationLock,
  deadlineDay,
  takeovers,
  frozenOutClients,
  scouting,

  internationalCallUps,
  internationalDuty,
  internationalTournament,

  dataDepartment,
  contracts,
  press,

  boardAndCoach,
  aiBoard,
  architects,
  housekeeping,

  seasonClock,
]

export function advanceWeek(state: GameState, deps: TickDeps): TickResult {
  const { ids, names, transferStats } = deps
  const week = state.date.week
  const rng = new Rng(`${state.seed}:${state.date.season}:${week}`)

  const result: TickResult = { playerFixtures: [], seasonEnded: false, sacked: false }
  const guard = guardedFacts<TickFacts>()
  const { facts } = guard

  const ctx: TickContext = {
    state,
    ids,
    names,
    rng,
    week,
    facts,
    transferStats,
    sack: (message: string) => {
      result.sacked = true
      result.sackMessage = message
    },
    endSeason: () => { result.seasonEnded = true },
  }

  runPhases(WEEK, guard, ctx)

  // The results screen is the one thing the caller gets back, so it is read
  // out under a phase of its own rather than by reaching past the guard.
  guard.enter({ name: 'after the week', reads: ['playerFixtures'] })
  result.playerFixtures = facts.playerFixtures

  return result
}
