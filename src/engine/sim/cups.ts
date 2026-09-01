import { Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { CONTINENTAL_WEEKS, CUP_ROUND_NAMES, DOMESTIC_CUP_WEEKS } from './schedule'
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

/**
 * Which rounds are played over two legs.
 *
 * The semi-final only, and never the final — that is the shape of most
 * domestic cups, and it is the round where two legs matter most: it turns the
 * tie into a two-week problem where a first-leg lead has to be defended by a
 * squad that also has league fixtures in between.
 */
export function isTwoLegged(
  roundIndex: number,
  totalRounds: number,
  type: CupCompetition['type'] = 'domestic',
): boolean {
  // Continental football is two legs from the first round to the semi-final,
  // and one match for the final. That is not decoration: it doubles the
  // fixtures a European run costs, which is the whole reason a squad that can
  // win a league cannot always survive a campaign as well. The domestic cup
  // keeps its single two-legged semi-final.
  if (type === 'continental') return totalRounds - roundIndex - 1 > 0
  return totalRounds - roundIndex - 1 === 1
}

/** Weeks after the first leg that the second is played. */
const SECOND_LEG_GAP = 3

/** Rounds needed to get from `entrants` to a single winner. */
export function roundsRequired(entrants: number): number {
  if (entrants < 2) return 0
  return Math.ceil(Math.log2(entrants))
}

/**
 * Cup weeks used by a competition of this size, taken from the *end* of the
 * calendar so every final lands on the same week regardless of field size.
 */
export function cupWeeksFor(
  entrants: number,
  type: CupCompetition['type'] = 'domestic',
): number[] {
  const calendar = type === 'continental' ? CONTINENTAL_WEEKS : DOMESTIC_CUP_WEEKS
  const rounds = Math.min(roundsRequired(entrants), calendar.length)
  return calendar.slice(calendar.length - rounds)
}

/** Name a round by how far from the final it is, so "Semi-final" always fits. */
function roundName(roundIndex: number, totalRounds: number): string {
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

  const weeks = cupWeeksFor(cup.entrantIds.length || 2, cup.type)
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

  const twoLegged = isTwoLegged(cup.currentRound, totalRounds, cup.type)
  const shuffled = rng.shuffle(playing)
  const fixtures: Fixture[] = []

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const first = shuffled[i]
    const second = shuffled[i + 1]
    // A tie id links the legs; the aggregate is resolved against it rather
    // than against either fixture on its own.
    const tieId = `${cup.id}:r${cup.currentRound}:${first}:${second}`

    fixtures.push({
      id: ids.next(ID_PREFIX.fixture),
      competitionId: cup.id,
      competitionType: 'cup',
      round: cup.currentRound,
      week: dueWeek,
      season: state.date.season,
      homeClubId: first,
      awayClubId: second,
      ...(twoLegged ? { legOf: { tieId, leg: 1 as const } } : {}),
    })

    if (twoLegged) {
      // The return leg reverses the venue, as it must for the tie to be fair.
      fixtures.push({
        id: ids.next(ID_PREFIX.fixture),
        competitionId: cup.id,
        competitionType: 'cup',
        round: cup.currentRound,
        week: dueWeek + SECOND_LEG_GAP,
        season: state.date.season,
        homeClubId: second,
        awayClubId: first,
        legOf: { tieId, leg: 2 as const },
      })
    }
  }

  const round: CupRound = {
    round: cup.currentRound,
    name: roundName(cup.currentRound, totalRounds),
    // A two-legged round is not settled until the second leg has been played.
    week: twoLegged ? dueWeek + SECOND_LEG_GAP : dueWeek,
    fixtureIds: fixtures.map((f) => f.id),
    twoLegged,
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
  const participants = new Set<ID>()

  const fixtures = round.fixtureIds
    .map((id) => state.fixtures.find((f) => f.id === id))
    .filter((f): f is Fixture => Boolean(f))

  for (const fixture of fixtures) {
    participants.add(fixture.homeClubId)
    participants.add(fixture.awayClubId)
  }

  if (round.twoLegged) {
    // Group the legs by tie and settle on aggregate. Resolving each leg on its
    // own would eliminate a club that lost the first leg 1-0 and won the
    // second 3-0.
    const ties = new Map<string, Fixture[]>()
    for (const fixture of fixtures) {
      const tieId = fixture.legOf?.tieId
      if (!tieId) continue
      const legs = ties.get(tieId) ?? []
      legs.push(fixture)
      ties.set(tieId, legs)
    }
    for (const [tieId, legs] of ties) {
      const loser = loserOfTie(tieId, legs)
      if (loser) eliminated.push(loser)
    }
  } else {
    for (const fixture of fixtures) {
      const loser = loserOf(fixture)
      if (loser) eliminated.push(loser)
    }
  }

  // Prize money to everyone who survived the round.
  const prize = cup.prizeMoneyPerRound[Math.min(round.round, cup.prizeMoneyPerRound.length - 1)] ?? 0
  const eliminatedSet = new Set(eliminated)
  for (const clubId of participants) {
    if (eliminatedSet.has(clubId)) continue
    const club = state.clubs[clubId]
    if (!club) continue
    club.finances.balance += prize
    club.finances.season.prizeMoney += prize
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
    const fixtures = round.fixtureIds
      .map((id) => state.fixtures.find((f) => f.id === id))
      .filter((f): f is Fixture => Boolean(f))

    if (round.twoLegged) {
      const ties = new Map<string, Fixture[]>()
      for (const fixture of fixtures) {
        const tieId = fixture.legOf?.tieId
        if (!tieId) continue
        ties.get(tieId)?.push(fixture) ?? ties.set(tieId, [fixture])
      }
      for (const [tieId, legs] of ties) {
        const loser = loserOfTie(tieId, legs)
        if (loser) out.delete(loser)
      }
      continue
    }

    for (const fixture of fixtures) {
      if (!fixture.result) continue
      const loser = loserOf(fixture)
      if (loser) out.delete(loser)
    }
  }
  return Array.from(out)
}

/**
 * Resolve a two-legged tie on aggregate.
 *
 * Returns null while the tie is unfinished, so a club is never eliminated
 * halfway through. A level aggregate is settled by a shootout seeded from the
 * tie id, which keeps the outcome stable across recomputation — the same tie
 * must not resolve differently each time a screen asks who went through.
 */
export function loserOfTie(tieId: string, legs: Fixture[]): ID | null {
  const played = legs.filter((l) => l.result)
  if (played.length < 2) return null

  const first = legs.find((l) => l.legOf?.leg === 1)
  const second = legs.find((l) => l.legOf?.leg === 2)
  if (!first?.result || !second?.result) return null

  // The first leg's home club is the reference side throughout.
  const clubA = first.homeClubId
  const clubB = first.awayClubId

  const aggregateA = first.result.homeGoals + second.result.awayGoals
  const aggregateB = first.result.awayGoals + second.result.homeGoals

  if (aggregateA > aggregateB) return clubB
  if (aggregateB > aggregateA) return clubA

  // Level on aggregate. A shootout, decided deterministically from the tie.
  const rng = new Rng(`shootout:${tieId}`)
  return rng.chance(0.5) ? clubB : clubA
}

/** Aggregate score of a two-legged tie, for display. */
export function tieAggregate(
  legs: Fixture[],
): { clubA: ID; clubB: ID; goalsA: number; goalsB: number; complete: boolean } | null {
  const first = legs.find((l) => l.legOf?.leg === 1)
  const second = legs.find((l) => l.legOf?.leg === 2)
  if (!first) return null

  const clubA = first.homeClubId
  const clubB = first.awayClubId
  const goalsA = (first.result?.homeGoals ?? 0) + (second?.result?.awayGoals ?? 0)
  const goalsB = (first.result?.awayGoals ?? 0) + (second?.result?.homeGoals ?? 0)

  return {
    clubA,
    clubB,
    goalsA,
    goalsB,
    complete: Boolean(first.result && second?.result),
  }
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
  const stillIn = survivorsOf(state, cup).includes(clubId)

  // Walk the rounds the club actually appeared in and find where it went out.
  let lastRoundPlayed: CupRound | null = null
  for (const round of cup.rounds) {
    const fixtures = round.fixtureIds
      .map((id) => state.fixtures.find((f) => f.id === id))
      .filter((f): f is Fixture => Boolean(f))
      .filter((f) => f.homeClubId === clubId || f.awayClubId === clubId)
    if (fixtures.length === 0) continue
    lastRoundPlayed = round

    if (round.twoLegged) {
      const tieId = fixtures[0].legOf?.tieId
      if (!tieId) continue
      const legs = round.fixtureIds
        .map((id) => state.fixtures.find((f) => f.id === id))
        .filter((f): f is Fixture => Boolean(f) && f?.legOf?.tieId === tieId)
      if (loserOfTie(tieId, legs) === clubId) {
        return `Lost in the ${round.name.toLowerCase()}`
      }
      continue
    }

    if (fixtures.some((f) => f.result && loserOf(f) === clubId)) {
      return `Lost in the ${round.name.toLowerCase()}`
    }
  }

  if (!lastRoundPlayed) return stillIn ? 'Awaiting a tie' : 'Did not play'
  if (stillIn) {
    return `Reached the ${roundName(Math.min(cup.currentRound, totalRounds - 1), totalRounds).toLowerCase()}`
  }
  return `Out in the ${lastRoundPlayed.name.toLowerCase()}`
}
