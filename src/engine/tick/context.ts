import type { Rng } from '../rng'
import type { IdFactory } from '../ids'
import type { NameGenerator } from '../names/generator'
import { phaseFactory, type Phase } from '../phases'
import type { TransferAttemptStats } from '../systems/transfers'
import type { Club, Fixture, GameState, ID, MatchResult } from '../types'

/**
 * What a week is made of, and who is allowed to touch it.
 *
 * The mechanism — declared reads and writes, enforced at run time — lives in
 * `../phases.ts`, along with why it exists and what it cannot catch. This file
 * is only the week's half of it: the facts a tick passes between its phases,
 * and what a phase is handed.
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
  /** A tally for the AI transfer market, when a calibration run wants one. */
  transferStats?: TransferAttemptStats
  /** Set by whichever phase ends the director's employment. */
  sack: (message: string) => void
  /** Set by the rollover phase. */
  endSeason: () => void
}

/** Declare a phase of the week. */
export const phase = phaseFactory<TickFacts, TickContext>()

export type TickPhase = Phase<TickFacts, TickContext>
