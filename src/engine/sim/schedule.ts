import { Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import type { Fixture, ID } from '../types'

/**
 * Fixture scheduling.
 *
 * A season is 52 weeks. Matches run from week 6 to week 44, leaving a
 * pre-season and a summer window either side. Divisions vary in size, so the
 * number of rounds varies too — a 24-club division plays 46 rounds and has to
 * double up midweek, which is exactly the fixture congestion that makes squad
 * depth matter rather than being a stat you look at once.
 */

export const SEASON_WEEKS = 52
export const FIRST_MATCH_WEEK = 6
export const LAST_MATCH_WEEK = 44

/**
 * Circle-method round-robin. Produces `n - 1` rounds in which every club plays
 * once, then mirrors them with reversed home advantage for the second half.
 */
function roundRobinRounds(clubIds: ID[]): { home: ID; away: ID }[][] {
  const clubs = clubIds.slice()
  // Odd club counts get a bye marker so the rotation still works.
  const bye = '__bye__'
  if (clubs.length % 2 === 1) clubs.push(bye)

  const n = clubs.length
  const roundsPerHalf = n - 1
  const half = n / 2
  const firstHalf: { home: ID; away: ID }[][] = []

  const rotating = clubs.slice(1)
  for (let round = 0; round < roundsPerHalf; round++) {
    const pairings: { home: ID; away: ID }[] = []
    const ordered = [clubs[0], ...rotating]

    for (let i = 0; i < half; i++) {
      const a = ordered[i]
      const b = ordered[n - 1 - i]
      if (a === bye || b === bye) continue
      // Alternate home advantage by round so no club has a run of home games.
      if ((round + i) % 2 === 0) pairings.push({ home: a, away: b })
      else pairings.push({ home: b, away: a })
    }
    firstHalf.push(pairings)
    rotating.unshift(rotating.pop() as ID)
  }

  // Reverse fixtures: same pairings, swapped venues.
  const secondHalf = firstHalf.map((round) =>
    round.map(({ home, away }) => ({ home: away, away: home })),
  )

  return [...firstHalf, ...secondHalf]
}

/**
 * Turn rounds into dated fixtures, spreading them across the match calendar and
 * doubling up midweek when there are more rounds than weeks.
 */
export function scheduleLeague(
  rng: Rng,
  ids: IdFactory,
  leagueId: ID,
  clubIds: ID[],
  season: number,
): Fixture[] {
  if (clubIds.length < 2) return []

  const rounds = roundRobinRounds(rng.shuffle(clubIds))
  const availableWeeks = LAST_MATCH_WEEK - FIRST_MATCH_WEEK + 1
  const fixtures: Fixture[] = []

  // Spread rounds evenly across the window. With 38 rounds in 39 weeks this is
  // one per week; with 46 it interleaves midweek rounds through the season.
  for (let r = 0; r < rounds.length; r++) {
    const week = FIRST_MATCH_WEEK + Math.floor((r * availableWeeks) / rounds.length)
    for (const pairing of rounds[r]) {
      fixtures.push({
        id: ids.next(ID_PREFIX.fixture),
        competitionId: leagueId,
        competitionType: 'league',
        round: r + 1,
        week,
        season,
        homeClubId: pairing.home,
        awayClubId: pairing.away,
      })
    }
  }

  return fixtures
}

/**
 * Weeks on which domestic cup rounds are played. Chosen to sit between league
 * rounds rather than replacing them, so a cup run genuinely adds fixtures.
 */
export const DOMESTIC_CUP_WEEKS = [10, 15, 20, 26, 32, 37, 42]

/**
 * Weeks on which continental rounds are played.
 *
 * Spaced six apart rather than the domestic cup's five, because every
 * continental round bar the final is two-legged and the second leg lands three
 * weeks after the first. Five would have put the next first leg on top of the
 * previous second leg. Like the domestic weeks these are consumed from the end,
 * so the final is always week 41 whatever the size of the field.
 *
 * Six entries is room for a 64-club competition. The largest this world builds
 * is 29, which takes five rounds and therefore starts in week 18 — a European
 * campaign running from autumn to a final three weeks before the league ends,
 * which is the right shape.
 */
export const CONTINENTAL_WEEKS = [11, 17, 23, 29, 35, 41]

export const CUP_ROUND_NAMES = [
  'First Round', 'Second Round', 'Third Round', 'Fourth Round',
  'Quarter-final', 'Semi-final', 'Final',
]

const SEASON_PHASE_WEEKS: { phase: string; from: number; to: number }[] = [
  { phase: 'preseason', from: 1, to: 5 },
  { phase: 'earlySeason', from: 6, to: 14 },
  { phase: 'autumn', from: 15, to: 25 },
  { phase: 'winterWindow', from: 26, to: 30 },
  { phase: 'runIn', from: 31, to: 44 },
  { phase: 'endOfSeason', from: 45, to: 47 },
  { phase: 'summerWindow', from: 48, to: 52 },
]

export function phaseForWeek(week: number): string {
  for (const entry of SEASON_PHASE_WEEKS) {
    if (week >= entry.from && week <= entry.to) return entry.phase
  }
  return 'preseason'
}

/** Transfer windows: summer (weeks 48-52 and 1-5) and winter (weeks 26-30). */
export function isTransferWindowOpen(week: number): boolean {
  return week >= 48 || week <= 5 || (week >= 26 && week <= 30)
}

export function windowLabel(week: number): string {
  if (week >= 48 || week <= 5) return 'Summer window'
  if (week >= 26 && week <= 30) return 'Winter window'
  return 'Window closed'
}

/** Human-readable week label, e.g. "Week 14 · Autumn". */
export const PHASE_LABELS: Record<string, string> = {
  preseason: 'Pre-season',
  earlySeason: 'Early season',
  autumn: 'Autumn',
  winterWindow: 'Winter window',
  runIn: 'Run-in',
  endOfSeason: 'End of season',
  summerWindow: 'Summer window',
}
