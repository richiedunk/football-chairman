import { phaseFactory, type Phase } from '../phases'
import type { Rng } from '../rng'
import type { IdFactory } from '../ids'
import type { NameGenerator } from '../names/generator'
import type { Club, GameState, ID } from '../types'

/**
 * What the season roll passes between its phases.
 *
 * The mechanism — declared reads and writes, enforced at run time — is in
 * `../phases.ts`, along with why it exists and what it cannot catch. This is
 * only the roll's half of it.
 */

export interface RolloverDeps {
  ids: IdFactory
  names: NameGenerator
  rng: Rng
}

export interface RolloverFacts {
  /**
   * Where every club finished, taken from the tables before anything touches
   * them.
   *
   * Read by three phases after the one that builds it, and the reason the
   * roll's order is not arbitrary: the director's XP, promotion and
   * relegation, and every club's reputation all depend on a division a club is
   * about to leave. Reading these off the tables later would read the new
   * season's empty ones.
   */
  finalPositions: Map<ID, number>
  /**
   * The club the director runs.
   *
   * Unlike the weekly tick, nothing here can change it mid-run — and saying so
   * is the point. It was three separate lookups that happened to agree.
   */
  playerClub: Club | null
}

/** Everything a phase of the roll is given. */
export interface RolloverContext {
  state: GameState
  /** The season that has just finished. The clock moves in `newSeason`. */
  season: number
  ids: IdFactory
  names: NameGenerator
  rng: Rng
  /**
   * The same three, as one object.
   *
   * Several of the systems the roll calls into take a `RolloverDeps` whole, so
   * it is carried rather than rebuilt at each call site — and it must be the
   * same `rng`, not a copy: `Rng.fork` draws from its parent, so a second
   * stream would silently give every system after it different numbers.
   */
  deps: RolloverDeps
  facts: RolloverFacts
}

/** Declare a phase of the roll. */
export const phase = phaseFactory<RolloverFacts, RolloverContext>()

export type RolloverPhase = Phase<RolloverFacts, RolloverContext>
