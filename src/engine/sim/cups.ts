import { Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { CUP_ROUND_NAMES, DOMESTIC_CUP_WEEKS } from './schedule'
import type { CupCompetition, CupRound, Fixture, GameState, ID } from '../types'

/**
 * Domestic cup competitions.
 *
 * A knockout run is the one route by which a club at the bottom of the pyramid
 * gets a windfall and a story in the same season, so it matters far more at the
 * level a career starts at than at the top. It is also the only competition
 * where a director of football's squad depth is tested directly: cup rounds sit
 * between league fixtures rather than replacing them.
 *
 * Draws are open — no seeding, no protection for bigger clubs — because the
 * possibility of drawing a top-flight side is most of the appeal.
 */

/** Rounds needed to get from `entrants` to a single winner. */
export function roundsRequired(entrants: number): number {
  if (entrants < 2) return 0
  return Math.ceil(Math.log2(entrants))
}

/**
 * Cup weeks used by a competition of this size, taken from the *end* of the
 * calendar so every final lands on the same week regardless of field size.
 */
export function cupWeeksFor(entrants: number): number[] {
  const rounds = Math.min(roundsRequired(entrants), DOMESTIC_CUP_WEEKS.length)
  return DOMESTIC_CUP_WEEKS.slice(DOMESTIC_CUP_WEEKS.length - rounds)
}

/** Name a round by how far from the final it is, so "Semi-final" always fits. */
export function roundName(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundIndex - 1
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semi-final'
  if (fromEnd === 2) return 'Quarter-final'
  return CUP_ROUND_NAMES[Math.min(roundIndex, CUP_ROUND_NAMES.length - 1)]
}

/**
 * Prepare a cup for a new season: reset entrants, plan the round calendar.
 * Called at the season roll and at world creation.
 */
export function resetCup(state: GameState, cup: CupCompetition): void {
  const entrants = cup.nationId
    ? Object.values(state.clubs)
        .filter((club) => club.nationId === cup.nationId)
        .map((club) => club.id)
    : cup.entrantIds

  cup.entrantIds = entrants
  cup.rounds = []
  cup.currentRound = 0
  cup.winnerId = null
}

/**
 * Draw the next round if this is one of the cup's weeks and it has not been
 * drawn yet. Returns the fixtures created, which the caller adds to the
 * world's fixture list so they are simulated exactly like league matches.
 */
export function drawNextRoundIfDue(
  state: GameState,
  cup: CupCompetition,
  ids: IdFactory,
  rng: Rng,
): Fixture[] {
  if (cup.winnerId) return []

  const weeks = cupWeeksFor(cup.entrantIds.length || 2)
  const totalRounds = weeks.length
  if (cup.currentRound >= totalRounds) return []

  const dueWeek = weeks[cup.currentRound]
  if (state.date.week !== dueWeek) return []
  if (cup.rounds.some((r) => r.round === cup.currentRound)) return []

  // Clubs still involved: everyone who has not been knocked out.
  const surviving = survivorsOf(state, cup)
  if (surviving.length <= 1) {
    cup.winnerId = surviving[0] ?? null
    return []
  }

  // Byes.
  //
  // The field must come *out* of this round at a power of two, not go into it
  // at one. Reducing to the power of two below — 114 down to 64 — leaves 50
  // clubs sitting out and 82 survivors, and the competition never converges.
  // The correct target is the power of two at or above the field: 114 clubs
  // means 14 byes and 50 ties, leaving exactly 64.
  //
  // Byes go to the strongest clubs, which is how a real cup lets the lower
  // divisions knock each other out before the big sides enter.
  const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(surviving.length)))
  const byeCount = nextPowerOfTwo - surviving.length

  let playing = surviving
  let byes: ID[] = []
  if (byeCount > 0) {
    const ranked = surviving
      .slice()
      .sort((a, b) => (state.clubs[b]?.reputation ?? 0) - (state.clubs[a]?.reputation ?? 0))
    byes = ranked.slice(0, byeCount)
    const byeSet = new Set(byes)
    playing = surviving.filter((id) => !byeSet.has(id))
  }

  const shuffled = rng.shuffle(playing)
  const fixtures: Fixture[] = []
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    fixtures.push({
      id: ids.next(ID_PREFIX.fixture),
      competitionId: cup.id,
      competitionType: 'cup',
      round: cup.currentRound,
      week: dueWeek,
      season: state.date.season,
      homeClubId: shuffled[i],
      awayClubId: shuffled[i + 1],
    })
  }

  const round: CupRound = {
    round: cup.currentRound,
    name: roundName(cup.currentRound, totalRounds),
    week: dueWeek,
    fixtureIds: fixtures.map((f) => f.id),
    twoLegged: false,
  }
  // Clubs with a bye are recorded as surviving by simply not appearing in any
  // fixture this round; survivorsOf reads the fixture history, so nothing else
  // is needed.
  cup.rounds.push(round)

  return fixtures
}

/**
 * Resolve a completed round: pay prize money, advance the winners, and declare
 * a champion when only one club is left.
 */
export function settleRound(
  state: GameState,
  cup: CupCompetition,
  round: CupRound,
): { eliminated: ID[]; winnerId: ID | null } {
  const eliminated: ID[] = []

  for (const fixtureId of round.fixtureIds) {
    const fixture = state.fixtures.find((f) => f.id === fixtureId)
    if (!fixture?.result) continue
    const loser = loserOf(fixture)
    if (loser) eliminated.push(loser)
  }

  // Prize money to everyone who survived the round.
  const prize = cup.prizeMoneyPerRound[Math.min(round.round, cup.prizeMoneyPerRound.length - 1)] ?? 0
  const eliminatedSet = new Set(eliminated)
  for (const fixtureId of round.fixtureIds) {
    const fixture = state.fixtures.find((f) => f.id === fixtureId)
    if (!fixture?.result) continue
    for (const clubId of [fixture.homeClubId, fixture.awayClubId]) {
      if (eliminatedSet.has(clubId)) continue
      const club = state.clubs[clubId]
      if (!club) continue
      club.finances.balance += prize
      club.finances.season.prizeMoney += prize
    }
  }

  cup.currentRound += 1

  const remaining = survivorsOf(state, cup)
  if (remaining.length === 1) {
    cup.winnerId = remaining[0]
    const winner = state.clubs[cup.winnerId]
    if (winner) {
      // Winning a cup is worth reputation as well as money.
      winner.reputation = Math.min(99, winner.reputation + 2)
      winner.fanMood = Math.min(100, winner.fanMood + 12)
      winner.board.confidence = Math.min(100, winner.board.confidence + 10)
    }
  }

  return { eliminated, winnerId: cup.winnerId }
}

/** Clubs still in the competition, derived from played rounds. */
export function survivorsOf(state: GameState, cup: CupCompetition): ID[] {
  const out = new Set(cup.entrantIds)
  for (const round of cup.rounds) {
    for (const fixtureId of round.fixtureIds) {
      const fixture = state.fixtures.find((f) => f.id === fixtureId)
      if (!fixture?.result) continue
      const loser = loserOf(fixture)
      if (loser) out.delete(loser)
    }
  }
  return Array.from(out)
}

function loserOf(fixture: Fixture): ID | null {
  const result = fixture.result
  if (!result) return null
  if (result.penalties) {
    return result.penalties.home > result.penalties.away ? fixture.awayClubId : fixture.homeClubId
  }
  if (result.homeGoals === result.awayGoals) return null
  return result.homeGoals > result.awayGoals ? fixture.awayClubId : fixture.homeClubId
}

/** How far a club got, for the season history and the board's view. */
export function cupResultFor(state: GameState, cup: CupCompetition, clubId: ID): string {
  if (cup.winnerId === clubId) return `Won ${cup.name}`
  if (!cup.entrantIds.includes(clubId)) return '—'

  const totalRounds = cupWeeksFor(cup.entrantIds.length || 2).length
  let lastRound: CupRound | null = null

  for (const round of cup.rounds) {
    for (const fixtureId of round.fixtureIds) {
      const fixture = state.fixtures.find((f) => f.id === fixtureId)
      if (!fixture) continue
      if (fixture.homeClubId !== clubId && fixture.awayClubId !== clubId) continue
      lastRound = round
      if (fixture.result && loserOf(fixture) === clubId) {
        return `Lost in the ${round.name.toLowerCase()}`
      }
    }
  }

  if (!lastRound) return 'Did not play'
  return `Reached the ${roundName(Math.min(cup.currentRound, totalRounds - 1), totalRounds).toLowerCase()}`
}
