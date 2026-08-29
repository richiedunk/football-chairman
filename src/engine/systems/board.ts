import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { ledgerBalance } from './finance'
import { positionalCompetence, ratingForPositionCached } from '../world/attributes'
import { auditSquadDepth } from '../sim/selection'
import { ordinal } from './career'
import type {
  BoardMandate, Club, GameState, League, LeagueTableRow, Player, SquadRequest, Staff,
} from '../types'

/**
 * The board, and your relationship with the head coach.
 *
 * Both are bosses of a kind. The board judges you on results against their
 * expectation, on the books, and on whether you did what they asked. The coach
 * judges you on whether you got him the players he wanted — and he is the one
 * who decides whether your signings play, which gives him leverage the board
 * does not have.
 */

export const MANDATE_LABELS: Record<BoardMandate, string> = {
  reduceWageBill: 'Reduce the wage bill',
  balanceBooks: 'Balance the books',
  developYouth: 'Develop and promote youth',
  winPromotion: 'Win promotion',
  avoidRelegation: 'Avoid relegation',
  winTrophy: 'Win a trophy',
  sellStarPlayer: 'Sell a star player to raise funds',
  improveFacilities: 'Improve the club\'s facilities',
  qualifyContinental: 'Qualify for continental football',
}

/**
 * Weekly board assessment. Confidence moves gradually, so a single bad result
 * never gets you sacked but a bad month does — which is the pressure the whole
 * job is meant to sit under.
 */
export function processBoard(
  state: GameState,
  club: Club,
  rng: Rng,
): { messages: string[]; sacked: boolean } {
  const messages: string[] = []
  const league = state.leagues[club.leagueId]
  const table = state.tables[club.leagueId]
  if (!league || !table) return { messages, sacked: false }

  const position = leaguePosition(table, club.id)
  const expected = club.board.expectation.leaguePosition
  const clubCount = table.length

  let drift = 0

  // League position against expectation, weighted by how far into the season
  // we are — a board does not panic in September.
  const seasonProgress = clamp((state.date.week - 6) / 38, 0, 1)
  const positionDelta = expected - position
  drift += positionDelta * 0.18 * seasonProgress

  // A board is not indifferent to its own supporters. Without this a director
  // could beat a low expectation while the crowd turned completely, and the
  // board would read as delighted.
  drift += (club.fanMood - 50) / 320

  // Financial health, weighted by how much this board cares about it.
  const financeWeight = club.board.expectation.financialImportance / 100
  const ledger = club.finances.season
  if (club.finances.inCrisis) drift -= 1.2 * financeWeight
  else if (ledgerBalance(ledger) > 0) drift += 0.12 * financeWeight

  // Mandates. Each one the board set is checked against reality.
  for (const mandate of club.board.mandates) {
    drift += mandateProgress(state, club, mandate, position, clubCount) * 0.15
  }

  // Youth, if they asked for it.
  const youthWeight = club.board.expectation.youthImportance / 100
  const graduates = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.age <= 21 && p.stats.appearances > 3)
  drift += clamp(graduates.length * 0.06, 0, 0.3) * youthWeight

  club.board.confidence = clamp(club.board.confidence + drift, 0, 100)

  // Warnings and the sack. Only ever fires for the human club, and only
  // after a formal warning — being dismissed without notice would be unfair
  // in a game where the board's expectations are visible.
  if (club.id === state.playerClubId) {
    if (club.board.confidence < 18 && seasonProgress > 0.2) {
      if (rng.chance(0.25)) {
        club.board.warnings += 1
        if (club.board.warnings >= 3) {
          messages.push(
            `The board have terminated your contract. ${club.name} sit ${position}${ordinal(position)} against a target of ${expected}${ordinal(expected)}, and they have run out of patience.`,
          )
          return { messages, sacked: true }
        }
        messages.push(
          `Formal warning from the board (${club.board.warnings} of 3). They expected ${expected}${ordinal(expected)} and the club is ${position}${ordinal(position)}. Results must improve.`,
        )
      }
    } else if (club.board.confidence > 60 && club.board.warnings > 0 && rng.chance(0.2)) {
      club.board.warnings -= 1
      messages.push('The board have withdrawn a previous warning. Your position is more secure.')
    }
  }

  return { messages, sacked: false }
}

/** -1 to +1: how well the club is doing against a mandate. */
function mandateProgress(
  state: GameState,
  club: Club,
  mandate: BoardMandate,
  position: number,
  clubCount: number,
): number {
  const league = state.leagues[club.leagueId]
  switch (mandate) {
    case 'reduceWageBill': {
      const bill = club.squad.reduce((sum, id) => {
        const p = state.players[id]
        return sum + (p?.contract?.wage ?? 0)
      }, 0)
      return clamp((club.finances.wageBudget - bill) / Math.max(1, club.finances.wageBudget), -1, 1)
    }
    case 'balanceBooks':
      return club.finances.inCrisis ? -1 : ledgerBalance(club.finances.season) > 0 ? 0.7 : -0.3
    case 'developYouth': {
      const graduates = club.squad
        .map((id) => state.players[id])
        .filter((p) => p && !p.isAcademy && p.age <= 21 && p.stats.appearances > 3).length
      return clamp(graduates / 3 - 0.4, -1, 1)
    }
    case 'winPromotion':
      return clamp((((league?.promotionPlaces ?? 2) + 2) - position) / 6, -1, 1)
    case 'avoidRelegation':
      return clamp((clubCount - (league?.relegationPlaces ?? 3) - position) / 6, -1, 1)
    case 'improveFacilities':
      return club.facilities.projects.length > 0 ? 0.6 : -0.2
    case 'qualifyContinental':
      return clamp((6 - position) / 5, -1, 1)
    default:
      return 0
  }
}

/**
 * Pull fan mood toward what the club's league position deserves.
 *
 * Match results alone move mood asymmetrically — a defeat hurts more than a
 * win pleases, which is true of real supporters but, applied every week with
 * no counterweight, drove every club in the world to single-figure mood inside
 * two seasons and dragged squad morale down with it. Supporters recalibrate to
 * where their club actually is; that reversion is what this restores.
 */
export function updateFanMood(state: GameState, club: Club): void {
  const table = state.tables[club.leagueId]
  const league = state.leagues[club.leagueId]
  if (!table || !league || table.length === 0) return

  const position = leaguePosition(table, club.id)
  const expected = club.board.expectation.leaguePosition
  const clubCount = table.length

  // Where mood settles: neutral when the club is exactly where it should be,
  // rising or falling by how far off that it is.
  let target = 52 + (expected - position) * 3.2

  // Absolute position matters too — bottom of the table is grim even for a
  // club that was expected to struggle.
  if (position > clubCount - league.relegationPlaces) target -= 14
  if (position === 1) target += 8

  // Money troubles sour a crowd independently of results.
  if (club.finances.inCrisis) target -= 18

  club.fanMood = clamp(club.fanMood + (clamp(target, 5, 95) - club.fanMood) * 0.1, 1, 100)
}

export function leaguePosition(table: LeagueTableRow[], clubId: string): number {
  const sorted = sortTable(table)
  return sorted.findIndex((r) => r.clubId === clubId) + 1
}

/** Standard sort: points, goal difference, goals scored. */
export function sortTable(table: LeagueTableRow[]): LeagueTableRow[] {
  return table.slice().sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst
    const gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.clubId.localeCompare(b.clubId)
  })
}

// ---------------------------------------------------------------------------
// The head coach
// ---------------------------------------------------------------------------

/**
 * The coach's weekly read on the squad. He raises requests when he can see a
 * hole, and his relationship with you moves depending on whether you fill it.
 */
export function processCoachRelations(
  state: GameState,
  club: Club,
  ids: IdFactory,
  rng: Rng,
): { requests: SquadRequest[]; messages: string[] } {
  const messages: string[] = []
  const newRequests: SquadRequest[] = []
  const coachStaff = club.headCoachId ? state.staff[club.headCoachId] : null
  const coach = coachStaff?.coachProfile
  if (!coachStaff || !coach) return { requests: [], messages: [] }

  // Expire old requests. An ignored request costs you the relationship —
  // silence is itself an answer.
  for (const request of coach.requests) {
    if (request.response !== 'pending') continue
    const age = state.date.week - request.weekRaised
    if (age > 8) {
      request.response = 'expired'
      coach.dofRelationship = clamp(
        coach.dofRelationship - (request.urgency === 'urgent' ? 9 : 4), 0, 100,
      )
      messages.push(
        `${coachStaff.knownAs} has noted that his request for a ${request.position} went unanswered.`,
      )
    }
  }

  // Check whether an outstanding request has quietly been fulfilled.
  for (const request of coach.requests) {
    if (request.response !== 'accepted' && request.response !== 'pending') continue
    const squad = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && !p.isAcademy)
    const filled = squad.some(
      (p) =>
        positionalCompetence(p.position, p.altPositions, request.position) >= 0.85
        && ratingForPositionCached(p.id, p.attributes, request.position) >= request.minAbility
        && p.joinedSeason >= state.date.season,
    )
    if (filled) {
      request.response = 'fulfilled'
      coach.dofRelationship = clamp(coach.dofRelationship + 12, 0, 100)
      messages.push(`${coachStaff.knownAs} is pleased with the new ${request.position}.`)
    }
  }

  // Raise new requests, but not constantly — a coach who asks for a player
  // every week is noise, not a relationship.
  const pending = coach.requests.filter((r) => r.response === 'pending').length
  if (pending < 2 && rng.chance(0.12)) {
    const depth = auditSquadDepth(state, club)
    const shortages = depth.filter((d) => d.shortage)
    if (shortages.length > 0) {
      const worst = shortages.sort((a, b) => a.bestRating - b.bestRating)[0]
      const league = state.leagues[club.leagueId]
      const standard = 45 + (league?.reputation ?? 40) * 1.3

      const request: SquadRequest = {
        id: ids.next(ID_PREFIX.request),
        position: worst.position,
        urgency: worst.count === 0 ? 'urgent' : worst.count === 1 ? 'wanted' : 'nice-to-have',
        minAbility: Math.round(Math.max(worst.bestRating + 6, standard * 0.9)),
        weekRaised: state.date.week,
        response: 'pending',
      }
      coach.requests.push(request)
      newRequests.push(request)
      messages.push(
        worst.count === 0
          ? `${coachStaff.knownAs} says the squad has no recognised ${request.position} and it is costing the team.`
          : `${coachStaff.knownAs} would like another ${request.position} — he does not feel he has cover.`,
      )
    }
  }

  // Relationship drift from circumstances the coach cares about.
  let drift = 0
  if (club.board.confidence < 30) drift -= 0.2
  if (club.fanMood > 70) drift += 0.15
  // A coach resents a squad stuffed with players he did not want and will not
  // pick — the clearest signal that recruitment and coaching are misaligned.
  const unusedSignings = club.squad
    .map((id) => state.players[id])
    .filter(
      (p): p is Player =>
        Boolean(p) && !p.isAcademy && p.joinedSeason === state.date.season
        && p.purchaseFee > 0 && p.stats.appearances < 2 && state.date.week > 16,
    )
  drift -= unusedSignings.length * 0.25

  coach.dofRelationship = clamp(coach.dofRelationship + drift, 0, 100)

  // The coach's own job security, which the board controls but you influence.
  const table = state.tables[club.leagueId]
  if (table) {
    const position = leaguePosition(table, club.id)
    const delta = club.board.expectation.leaguePosition - position
    coach.jobSecurity = clamp(coach.jobSecurity + delta * 0.12, 0, 100)
  }

  // A coach the board has lost faith in is sacked, and it is your problem.
  if (coach.jobSecurity < 12 && club.id === state.playerClubId && rng.chance(0.15)) {
    messages.push(
      `The board have dismissed ${coachStaff.knownAs}. Finding a replacement is now your most urgent job.`,
    )
    coachStaff.clubId = null
    club.staff = club.staff.filter((id) => id !== coachStaff.id)
    club.headCoachId = null
  }

  return { requests: newRequests, messages }
}

/** Answer a coach's request. Accepting raises expectations as well as goodwill. */
export function respondToRequest(
  state: GameState,
  club: Club,
  requestId: string,
  accept: boolean,
): string {
  const coachStaff = club.headCoachId ? state.staff[club.headCoachId] : null
  const coach = coachStaff?.coachProfile
  if (!coachStaff || !coach) return ''

  const request = coach.requests.find((r) => r.id === requestId)
  if (!request || request.response !== 'pending') return ''

  request.response = accept ? 'accepted' : 'rejected'
  if (accept) {
    coach.dofRelationship = clamp(coach.dofRelationship + 5, 0, 100)
    return `You tell ${coachStaff.knownAs} you will look for a ${request.position}. He will expect one.`
  }
  // Turning him down honestly costs less than ignoring him.
  coach.dofRelationship = clamp(coach.dofRelationship - 3, 0, 100)
  return `You tell ${coachStaff.knownAs} it is not possible. He is not happy, but he knows where he stands.`
}

/** Candidates for a vacant head coach position, filtered by club standing. */
export function availableCoaches(state: GameState, club: Club): Staff[] {
  return Object.values(state.staff)
    .filter((s) => s.role === 'headCoach' && s.clubId === null)
    .filter((s) => s.reputation <= club.reputation + 18)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 12)
}

/** Hire a coach. Returns an error if the wages cannot be met. */
export function hireCoach(
  state: GameState,
  club: Club,
  coach: Staff,
  wage: number,
  seasons: number,
): { ok: true } | { ok: false; error: string } {
  if (coach.clubId) return { ok: false, error: 'That coach is already employed.' }
  if (coach.reputation > club.reputation + 20) {
    return { ok: false, error: `${coach.knownAs} would not consider a club of this size.` }
  }
  const expected = Math.pow(coach.reputation / 50, 3) * 2_400 * 4.5
  if (wage < expected * 0.75) {
    return { ok: false, error: `${coach.knownAs} expects considerably more than that.` }
  }

  if (club.headCoachId) {
    const outgoing = state.staff[club.headCoachId]
    if (outgoing) {
      outgoing.clubId = null
      club.staff = club.staff.filter((id) => id !== outgoing.id)
    }
  }

  coach.clubId = club.id
  coach.contract = { wage: Math.round(wage), expiresSeason: state.date.season + seasons }
  coach.joinedSeason = state.date.season
  club.staff.push(coach.id)
  club.headCoachId = coach.id
  return { ok: true }
}

/** Set a new board expectation, called at the start of each season. */
export function setSeasonExpectation(state: GameState, club: Club, league: League): void {
  const clubCount = Math.max(1, league.clubIds.length)
  // The board's target is based on where the club sits in its division by
  // reputation, adjusted by last season's finish so success raises the bar.
  const byReputation = league.clubIds
    .map((id) => state.clubs[id])
    .filter(Boolean)
    .sort((a, b) => b!.reputation - a!.reputation)
  const rank = byReputation.findIndex((c) => c!.id === club.id) + 1

  const lastSeason = club.history[club.history.length - 1]
  const lastPosition = lastSeason?.position ?? rank

  const target = clamp(Math.round(rank * 0.6 + lastPosition * 0.4), 1, clubCount)

  let description: string
  if (target === 1) description = 'Win the division'
  else if (target <= league.promotionPlaces + league.playoffPlaces && league.promotionPlaces > 0) {
    description = 'Challenge for promotion'
  } else if (target <= 4) description = `Finish in the top ${target}`
  else if (target <= clubCount / 2) description = 'Finish in the top half'
  else if (target >= clubCount - (league.relegationPlaces + 2)) description = 'Stay in this division'
  else description = 'Consolidate in mid-table'

  club.board.expectation = {
    ...club.board.expectation,
    leaguePosition: target,
    description,
  }
}

/** Refresh mandates at the start of a season based on the club's situation. */
export function setSeasonMandates(state: GameState, club: Club): void {
  const mandates: BoardMandate[] = []
  const league = state.leagues[club.leagueId]

  if (club.finances.inCrisis || club.finances.debt > 0) mandates.push('balanceBooks')

  const wageBill = club.squad.reduce((sum, id) => sum + (state.players[id]?.contract?.wage ?? 0), 0)
  if (wageBill > club.finances.wageBudget * 0.95) mandates.push('reduceWageBill')

  if (club.board.expectation.youthImportance > 60) mandates.push('developYouth')
  if (league && club.board.expectation.leaguePosition <= league.promotionPlaces) {
    mandates.push('winPromotion')
  }
  if (league && club.board.expectation.leaguePosition >= league.clubIds.length - 4) {
    mandates.push('avoidRelegation')
  }
  if (club.facilities.trainingGround < 8 && club.finances.balance > 0) mandates.push('improveFacilities')

  club.board.mandates = mandates
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'Delighted'
  if (confidence >= 62) return 'Pleased'
  if (confidence >= 45) return 'Satisfied'
  if (confidence >= 30) return 'Concerned'
  if (confidence >= 18) return 'Unhappy'
  return 'Losing patience'
}

export function relationshipLabel(value: number): string {
  if (value >= 80) return 'Excellent'
  if (value >= 62) return 'Good'
  if (value >= 45) return 'Workable'
  if (value >= 28) return 'Strained'
  return 'Broken down'
}
