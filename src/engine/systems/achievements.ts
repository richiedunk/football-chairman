import { weeklyRevenue } from './finance'
import { squadRegistration } from './registration'
import type { GameState } from '../types'

/**
 * Career milestones.
 *
 * Deliberately an engine concern rather than a platform one. What counts as an
 * achievement is a question about the game state — the same question whether
 * the answer is going to Play Games, Game Center, or nowhere at all. The
 * platform layer takes this list and reports it; it never decides it, and this
 * file has no idea whether anyone is listening.
 *
 * Everything here is derived on demand rather than stored. A flag set at the
 * moment of unlocking would drift from the truth the first time a save was
 * loaded into a build with a different rule, and would need its own migration
 * every time the list changed.
 */

export type AchievementCategory = 'career' | 'silverware' | 'squad' | 'money' | 'stewardship'

export interface Achievement {
  id: string
  name: string
  description: string
  category: AchievementCategory
  /** True for milestones most players will never see. Shown differently. */
  rare?: boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-job',
    name: 'In the Building',
    description: 'Take your first job as a director of football.',
    category: 'career',
  },
  {
    id: 'first-season',
    name: 'A Full Season',
    description: 'See out a complete season in post.',
    category: 'career',
  },
  {
    id: 'promotion',
    name: 'Going Up',
    description: 'Win promotion with a club.',
    category: 'career',
  },
  {
    id: 'promotion-double',
    name: 'Back-to-Back',
    description: 'Win promotion in two consecutive seasons.',
    category: 'career',
    rare: true,
  },
  {
    id: 'top-flight',
    name: 'The Top Table',
    description: 'Take charge of a club in the top division.',
    category: 'career',
  },
  {
    id: 'climb',
    name: 'The Long Climb',
    description: 'Reach the top division with a club you took over below it.',
    category: 'career',
    rare: true,
  },
  {
    id: 'trophy',
    name: 'Something in the Cabinet',
    description: 'Win a trophy.',
    category: 'silverware',
  },
  {
    id: 'trophy-five',
    name: 'A Collection',
    description: 'Win five trophies across your career.',
    category: 'silverware',
    rare: true,
  },
  {
    id: 'league-title',
    name: 'Champions',
    description: 'Win a league title.',
    category: 'silverware',
  },
  {
    id: 'academy-graduate',
    name: 'One of Our Own',
    description: 'Field three academy graduates in the same season.',
    category: 'squad',
  },
  {
    id: 'homegrown-squad',
    name: 'Locally Sourced',
    description: 'Register a squad with at least fifteen homegrown players.',
    category: 'squad',
  },
  {
    id: 'big-sale',
    name: 'Sold Well',
    description: "Bank a transfer fee larger than the club's annual revenue.",
    category: 'money',
    rare: true,
  },
  {
    id: 'debt-free',
    name: 'Books Balanced',
    description: 'Clear the club of all debt.',
    category: 'money',
  },
  {
    id: 'stadium-built',
    name: 'Bricks and Mortar',
    description: 'Complete a stadium expansion or rebuild.',
    category: 'stewardship',
  },
  {
    id: 'five-years',
    name: 'Part of the Furniture',
    description: 'Spend five seasons at the same club.',
    category: 'stewardship',
    rare: true,
  },
  {
    id: 'ten-years',
    name: 'A Career',
    description: 'Spend ten seasons as a director of football.',
    category: 'career',
    rare: true,
  },
]

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function achievement(id: string): Achievement | null {
  return BY_ID.get(id) ?? null
}

/**
 * Every milestone the current save has reached.
 *
 * Recomputed from scratch each time it is asked. Cheap enough — the whole
 * career history is a few dozen entries — and it means the answer is always
 * the truth about this save rather than a flag somebody set two builds ago.
 */
export function earnedAchievements(state: GameState): Set<string> {
  const earned = new Set<string>()
  const director = state.director
  const history = director.careerHistory
  const club = state.clubs[state.playerClubId] ?? null

  if (history.length > 0) earned.add('first-job')

  const seasonsServed = history.reduce(
    (total, entry) => total + ((entry.toSeason ?? state.date.season) - entry.fromSeason),
    0,
  )
  if (seasonsServed >= 1) earned.add('first-season')
  if (seasonsServed >= 10) earned.add('ten-years')

  const trophies = history.flatMap((entry) => entry.trophies)
  if (trophies.length >= 1) earned.add('trophy')
  if (trophies.length >= 5) earned.add('trophy-five')

  if (history.some((entry) => entry.bestFinish === 1)) earned.add('league-title')

  // Promotion is read off the club's own season history rather than the
  // director's, because a club records where it finished and what division it
  // was in — which is what promotion actually means.
  if (club) {
    const league = state.leagues[club.leagueId]
    if (league?.tier === 1) earned.add('top-flight')

    const tenure = history.find((entry) => entry.clubId === club.id && entry.toSeason === null)
    const seasonsHere = club.history.filter(
      (h) => !tenure || h.season >= tenure.fromSeason,
    )

    let promotions = 0
    let consecutive = 0
    let bestConsecutive = 0
    for (let i = 1; i < seasonsHere.length; i++) {
      const before = state.leagues[seasonsHere[i - 1].leagueId]?.tier
      const after = state.leagues[seasonsHere[i].leagueId]?.tier
      if (before === undefined || after === undefined) continue
      if (after < before) {
        promotions += 1
        consecutive += 1
        bestConsecutive = Math.max(bestConsecutive, consecutive)
      } else {
        consecutive = 0
      }
    }
    if (promotions > 0) earned.add('promotion')
    if (bestConsecutive >= 2) earned.add('promotion-double')

    // The long climb: arrived below the top flight, currently in it.
    const arrivedTier = seasonsHere.length > 0
      ? state.leagues[seasonsHere[0].leagueId]?.tier
      : undefined
    if (league?.tier === 1 && arrivedTier !== undefined && arrivedTier > 1) {
      earned.add('climb')
    }

    if (club.finances.debt === 0 && club.finances.balance > 0) earned.add('debt-free')

    // Either a new ground, or a stand that was not there when you arrived.
    const arrivedSeason = tenure?.fromSeason ?? state.date.season
    const built = club.facilities.stadium.stands.some((stand) => stand.builtYear >= arrivedSeason)
    if (club.facilities.stadium.relocatedSeason !== null || built) earned.add('stadium-built')

    const registration = squadRegistration(state, club)
    if (registration.homegrown >= 15) earned.add('homegrown-squad')

    // A fee worth more than a year of turnover. Scales with the pyramid, so it
    // means the same thing to a non-league club as to a champion.
    const annualRevenue = weeklyRevenue(state, club) * 52
    const bigSale = state.completedTransfers.some(
      (t) => t.fromClubId === club.id && t.fee > annualRevenue && annualRevenue > 0,
    )
    if (bigSale) earned.add('big-sale')

    if (tenure && state.date.season - tenure.fromSeason >= 5) earned.add('five-years')

    const graduates = club.squad
      .map((id) => state.players[id])
      .filter((p) => p && !p.isAcademy && p.joinedSeason >= 0 && p.purchaseFee === 0
        && p.age <= 23 && p.stats.appearances > 3)
    if (graduates.length >= 3) earned.add('academy-graduate')
  }

  return earned
}
