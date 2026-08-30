/**
 * The clock on a career.
 *
 * You start at thirty and you are finished at sixty-five, without exception.
 * Both ends of that do work.
 *
 * Thirty, because the jobs board already gates by experience and age is the
 * reason for the gate. You are not starting in non-league because the game
 * says so; you are starting there because you are thirty and nobody sensible
 * hands a thirty-year-old a Premier League recruitment department.
 *
 * Sixty-five, because without an end nothing costs anything. A three-year
 * rebuild at fifty-eight is a different decision from the same rebuild at
 * thirty-four, and until now nothing in the game made the player feel a clock
 * at all. It also turns a save from an open-ended soak into a finite
 * thirty-five seasons, which is roughly a real career — a director appointed
 * at thirty who lasts is Txiki Begiristain, not a dynasty.
 */

import type { DirectorProfile, GameState } from '../types'

export const STARTING_AGE = 30
export const RETIREMENT_AGE = 65

/** The most seasons anyone can work. Thirty at the start, gone after sixty-five. */
export const MAX_CAREER_SEASONS = RETIREMENT_AGE - STARTING_AGE

/** Seasons left before the rules end it, whatever the player wants. */
export function seasonsRemaining(director: DirectorProfile): number {
  return Math.max(0, RETIREMENT_AGE - director.age)
}

/**
 * True once the director is out of time.
 *
 * Checked after the birthday at the season roll, so the last season worked is
 * the one during which they turn sixty-five: they see it out, then go.
 */
export function mustRetire(director: DirectorProfile): boolean {
  return director.age >= RETIREMENT_AGE
}

/**
 * How the end of a career is described.
 *
 * Retiring on your own terms and being retired by the calendar are not the
 * same story, and a career screen that called both of them "retired" would
 * flatten the one decision a player gets to make about when they stop.
 */
export type RetirementReason = 'age' | 'choice'

export interface CareerSummary {
  name: string
  reason: RetirementReason
  age: number
  seasonsWorked: number
  clubs: number
  trophies: number
  /** Career net spend on players: negative means you sold more than you bought. */
  netSpend: number
  /** Best league finish anywhere, as a position. Zero if never placed. */
  bestFinish: number
  careerEarnings: number
  xp: number
  /** The last club, for the line that names where it ended. */
  finalClubName: string | null
}

export function careerSummary(
  state: GameState,
  reason: RetirementReason,
): CareerSummary {
  const d = state.director
  const history = d.careerHistory

  const trophies = history.reduce((sum, entry) => sum + entry.trophies.length, 0)
  const finishes = history.map((entry) => entry.bestFinish).filter((p) => p > 0)
  const netSpend = history.reduce((sum, entry) => sum + entry.netSpend, 0)

  return {
    name: d.name,
    reason,
    age: d.age,
    // Every season sat in a chair, counted once even where two spells at the
    // same club would otherwise double it.
    seasonsWorked: Math.max(0, d.age - STARTING_AGE),
    clubs: new Set(history.map((entry) => entry.clubId)).size,
    trophies,
    /** Everything spent on players less everything recovered, over a career. */
    netSpend,
    bestFinish: finishes.length ? Math.min(...finishes) : 0,
    careerEarnings: d.careerEarnings,
    xp: d.xp,
    finalClubName: state.playerClubId ? state.clubs[state.playerClubId]?.name ?? null : null,
  }
}

/**
 * A line for the top of the retirement screen.
 *
 * Written to be read once, at the end of thirty-five seasons, so it says what
 * happened rather than congratulating anyone.
 */
export function retirementHeadline(summary: CareerSummary): string {
  if (summary.reason === 'choice') {
    return `${summary.name} steps down at ${summary.age}`
  }
  return `${summary.name} retires at ${summary.age}`
}
