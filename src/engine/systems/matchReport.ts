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
import { coachRegister, phrase, type CoachRegister } from './voice'

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
 * The coach's line, by verdict and by the register he speaks to you in.
 *
 * This used to be a two-way warm/cold split, which was the cheapest way to
 * make the relationship audible and predated the coach having a voice anywhere
 * else. He has one now — `coachRegister`, from how much he courts the press
 * and what he makes of you — and the post-match verdict was the last place he
 * still spoke in a fixed one. A talkative coach who rates you and a taciturn
 * one who does not should not hand you the same sentence after the same game.
 *
 * Four registers: warm talks and shares the credit, brisk states the outcome,
 * terse says as little as the moment allows, and pointed makes sure you know
 * whose fault it is.
 */
const COACH_LINES: Record<Verdict, Record<CoachRegister, string[]>> = {
  outstanding: {
    warm: [
      'That is the group you built for me. They were superb, and you should take some of that.',
      'Nobody gave us a prayer. Look at them now — that is your recruitment as much as my coaching.',
    ],
    brisk: [
      'Excellent. They carried it out exactly as we worked on it.',
      'That is as well as we can play. Pleased.',
    ],
    terse: [
      'Good day.',
      'They were superb. That is all I will say.',
    ],
    pointed: [
      'The players deserve enormous credit for that. They have had to.',
      'We got what we deserved for once. It has been a while.',
    ],
  },
  good: {
    warm: [
      'Pleased with that. The squad has enough in it, and that is down to both of us.',
      'A good day. They carried out the plan and they had the legs to do it.',
    ],
    brisk: [
      'Job done. We took our chances and saw it out.',
      'A good result. No complaints from me.',
    ],
    terse: [
      'Fine. Next one.',
      'That will do.',
    ],
    pointed: [
      'We took our chances. That is the job done, for now.',
      'A decent result, all things considered. And there is a lot to consider.',
    ],
  },
  par: {
    warm: [
      'About right, and nothing to complain about. We are where we ought to be.',
      'That is roughly where we are at the moment, and I am comfortable with it.',
    ],
    brisk: [
      'Fair result. Neither side did enough to change it.',
      'About par. We move on.',
    ],
    terse: [
      'It is what it is.',
      'Par.',
    ],
    pointed: [
      'About what this squad is worth, if I am honest with you.',
      'That is the level we are at. I have said why.',
    ],
  },
  poor: {
    warm: [
      'Disappointed, but that is on the day and not on the squad you have given me.',
      'We were not at it. That one is mine — I will sort it out on the training ground.',
    ],
    brisk: [
      'Not good enough. We will look at it this week.',
      'Below where we should be. My job to fix.',
    ],
    terse: [
      'Poor.',
      'Not good enough. Nothing else to say.',
    ],
    pointed: [
      'We are short in one or two areas and it showed. Again.',
      'I can only work with what I am given.',
    ],
  },
  dismal: {
    warm: [
      'That was unacceptable and I have told them so. It is not a reflection on the work you have done.',
      'No excuses. I got it wrong today and I will put it right.',
    ],
    brisk: [
      'Unacceptable. I will deal with it.',
      'Nowhere near. That is on me and on them.',
    ],
    terse: [
      'Unacceptable.',
      'You saw it.',
    ],
    pointed: [
      'I have been saying for weeks that this group is not deep enough. Today is what that looks like.',
      'You saw it. I have nothing to add that I have not already put in writing.',
    ],
  },
}

// The pick is `phrase` from ./voice, which is the same job this file had its
// own hash for. Two deterministic string pickers in one codebase is one too
// many, and reopening a report still never changes what was said.

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

  const register = coachRegister(
    coach?.attributes?.mediaHandling ?? 50,
    coach?.coachProfile?.dofRelationship ?? 50,
  )
  const lines = COACH_LINES[verdict][register]

  return {
    verdict,
    outcome,
    headline: HEADLINES[verdict],
    coachLine: coach ? phrase(`verdict:${fixture.id}:${coach.id}`, lines) : '',
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
