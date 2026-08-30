/**
 * What a result meant.
 *
 * The match engine already produces everything a report needs — a scoreline,
 * per-player ratings, the events, the shot counts — and until now the UI threw
 * all of it away in favour of a one-line summary. What it does not produce is
 * a *judgement*: whether the result was any good.
 *
 * That judgement is not the same as the scoreline. Losing at the champions is
 * not the same as losing at home to the bottom club, and a director who is
 * shown only "lost 2-1" has to work out which one happened. So this compares
 * the result to what the match was worth before kick-off, and hands the
 * verdict to the head coach to say out loud — because he is the one who picks
 * the team, and his read on a game is the only football opinion in the game
 * that is his to give rather than yours.
 *
 * Pure, and given plain values rather than the store, so the wording can be
 * tested without simulating a season.
 */

import type { Club, Fixture, MatchResult, Staff } from '../types'

export type Verdict = 'outstanding' | 'good' | 'par' | 'poor' | 'dismal'

export interface MatchVerdict {
  verdict: Verdict
  /** Won / drew / lost, from the player club's side. */
  outcome: 'W' | 'D' | 'L'
  /** Short headline for the report screen. */
  headline: string
  /** The head coach's line. Empty when the club has no coach. */
  coachLine: string
  /** Roughly what the club should have taken from the match, 0-3 points. */
  expectedPoints: number
}

/** Home advantage in reputation points. Worth about a fifth of a division. */
const HOME_EDGE = 6

/**
 * Points a club of this standing would be expected to take from this match.
 *
 * A crude model on purpose: what matters is that a hard fixture and an easy
 * one are told apart, not that the number is precise to two decimals.
 */
export function expectedPoints(own: number, opponent: number, isHome: boolean): number {
  const edge = own + (isHome ? HOME_EDGE : -HOME_EDGE) - opponent
  // A twenty-point reputation gap is the difference between "should win" and
  // "should lose", which is about right across a division.
  const winShare = 1 / (1 + Math.exp(-edge / 9))
  const drawShare = 0.26 - Math.abs(winShare - 0.5) * 0.2
  return Math.max(0, Math.min(3, winShare * 3 * (1 - drawShare) + drawShare * 1))
}

function pointsFor(outcome: 'W' | 'D' | 'L'): number {
  return outcome === 'W' ? 3 : outcome === 'D' ? 1 : 0
}

function gradeFor(taken: number, expected: number): Verdict {
  const delta = taken - expected
  if (delta >= 1.6) return 'outstanding'
  if (delta >= 0.55) return 'good'
  if (delta >= -0.55) return 'par'
  if (delta >= -1.6) return 'poor'
  return 'dismal'
}

const HEADLINES: Record<Verdict, string> = {
  outstanding: 'Far more than anyone expected',
  good: 'A good afternoon',
  par: 'About what the game was worth',
  poor: 'Points dropped',
  dismal: 'That should not have happened',
}

/**
 * The coach's line, by verdict and by how he gets on with you.
 *
 * A coach who trusts the director says the same thing more generously than one
 * who does not, which is the cheapest way to make the relationship audible
 * without inventing a conversation system.
 */
const COACH_LINES: Record<Verdict, { warm: string[]; cold: string[] }> = {
  outstanding: {
    warm: [
      'That is the group you built for me. They were superb.',
      'Nobody gave us a prayer. Look at them now.',
    ],
    cold: [
      'The players deserve enormous credit for that.',
      'We got what we deserved for once.',
    ],
  },
  good: {
    warm: [
      'Pleased with that. The squad has enough in it.',
      'A good day. They carried out the plan.',
    ],
    cold: [
      'We took our chances. That is the job done.',
      'A decent result, all things considered.',
    ],
  },
  par: {
    warm: [
      'About right. Nothing to complain about.',
      'That is roughly where we are at the moment.',
    ],
    cold: [
      'It is what it is. We move on to the next one.',
      'Fair result. Neither side did much to change it.',
    ],
  },
  poor: {
    warm: [
      'Disappointed. That is on the day, not on the squad.',
      'We were not at it. I will sort that out.',
    ],
    cold: [
      'We are short in one or two areas and it showed.',
      'I can only work with what I am given.',
    ],
  },
  dismal: {
    warm: [
      'That was unacceptable and I will say so to them.',
      'No excuses. I got it wrong today.',
    ],
    cold: [
      'I have been saying for weeks that this group is not deep enough.',
      'You saw it. I have nothing to add.',
    ],
  },
}

/** Deterministic pick, so reopening a report never changes what was said. */
function pick(options: string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return options[Math.abs(hash) % options.length]
}

export function matchVerdict(
  club: Club,
  opponent: Club,
  fixture: Fixture,
  result: MatchResult,
  coach: Staff | null,
): MatchVerdict {
  const isHome = fixture.homeClubId === club.id
  const own = isHome ? result.homeGoals : result.awayGoals
  const theirs = isHome ? result.awayGoals : result.homeGoals
  const outcome: 'W' | 'D' | 'L' = own > theirs ? 'W' : own === theirs ? 'D' : 'L'

  const expected = expectedPoints(club.reputation, opponent.reputation, isHome)
  const verdict = gradeFor(pointsFor(outcome), expected)

  const relationship = coach?.coachProfile?.dofRelationship ?? 50
  const lines = COACH_LINES[verdict][relationship >= 55 ? 'warm' : 'cold']

  return {
    verdict,
    outcome,
    headline: HEADLINES[verdict],
    coachLine: coach ? pick(lines, `${fixture.id}:${coach.id}`) : '',
    expectedPoints: expected,
  }
}

/** The best performer in the club's own side, or null if nobody was rated. */
export function manOfTheMatch(
  club: Club,
  fixture: Fixture,
  result: MatchResult,
): { playerId: string; rating: number } | null {
  const isHome = fixture.homeClubId === club.id
  const lineup = isHome ? result.homeLineup : result.awayLineup
  let best: { playerId: string; rating: number } | null = null
  for (const id of lineup) {
    const rating = result.ratings[id]
    if (rating === undefined) continue
    if (!best || rating > best.rating) best = { playerId: id, rating }
  }
  return best
}
