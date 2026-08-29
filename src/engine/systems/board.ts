import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { ledgerBalance } from './finance'
import { positionalCompetence, ratingForPositionCached } from '../world/attributes'
import { auditSquadDepth } from '../sim/selection'
import { ordinal } from './career'
import { expectedWage } from '../world/staffGen'
import type {
  BoardMandate, Club, GameState, ID, League, LeagueTableRow, Player, SquadRequest, Staff, StaffRole,
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
 * Supporter mood, derived rather than drifted.
 *
 * The earlier model nudged mood on every result and let it wander, which meant
 * it decayed on its own: a defeat cost more than a win paid, so a mid-table
 * club sank to single figures over a season regardless of anything the
 * director did. Numbers that drift are also impossible to explain to a player,
 * and mood drives attendance, matchday income and board confidence.
 *
 * Mood is now *computed from its causes* every week and the stored value moves
 * toward that figure. Steady performance therefore produces a steady mood, and
 * every point of it can be attributed to something the supporters can see.
 */

export interface FanMoodFactor {
  label: string
  /** Contribution in mood points, positive or negative. */
  delta: number
}

export interface FanMoodAssessment {
  target: number
  factors: FanMoodFactor[]
}

/** Neutral mood: supporters with nothing in particular to feel either way. */
const FAN_MOOD_BASELINE = 52

export function assessFanMood(state: GameState, club: Club): FanMoodAssessment {
  const factors: FanMoodFactor[] = []
  const table = state.tables[club.leagueId]
  const league = state.leagues[club.leagueId]
  if (!table || !league || table.length === 0) {
    return { target: FAN_MOOD_BASELINE, factors }
  }

  const position = leaguePosition(table, club.id)
  const expected = club.board.expectation.leaguePosition
  const clubCount = table.length
  const row = table.find((r) => r.clubId === club.id)

  // Before a ball is kicked the table is alphabetical noise, so position-based
  // judgements are suppressed until there is a season to judge. Without this,
  // every club is assessed on a meaningless week-one position and mood swings
  // violently across the summer.
  const matchesPlayed = table.reduce((sum, r) => sum + r.played, 0)
  const tableIsMeaningful = matchesPlayed >= table.length

  // Early in a season the table is still noisy, so its weight ramps up rather
  // than arriving at full strength after one match.
  const tableConfidence = clamp((row?.played ?? 0) / 6, 0, 1)

  // 1. Where the club sits against what was expected of it. The single
  //    largest factor, because supporters judge a season relative to their own
  //    expectations rather than in the abstract.
  const versusExpectation = tableIsMeaningful
    ? clamp((expected - position) * 3.2, -22, 22) * tableConfidence
    : 0
  if (Math.abs(versusExpectation) >= 1) {
    factors.push({
      label: position < expected
        ? `${expected - position} place${expected - position === 1 ? '' : 's'} above expectation`
        : `${position - expected} place${position - expected === 1 ? '' : 's'} below expectation`,
      delta: versusExpectation,
    })
  }

  // 2. Recent form, independent of the table. A run of wins lifts a crowd even
  //    when the season is already lost, and vice versa.
  if (row && row.form.length > 0) {
    const points = row.form.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
    const perGame = points / row.form.length
    const formDelta = clamp((perGame - 1.35) * 9, -14, 14)
    if (Math.abs(formDelta) >= 1) {
      factors.push({
        label: perGame >= 1.35 ? `Good recent form (${row.form.join('')})` : `Poor recent form (${row.form.join('')})`,
        delta: formDelta,
      })
    }
  }

  // 3. Absolute position. Being in a title race or a relegation fight matters
  //    in itself, whatever the board expected.
  if (!tableIsMeaningful) {
    // Nothing to say yet.
  } else if (position === 1) factors.push({ label: 'Top of the division', delta: 9 })
  else if (league.promotionPlaces > 0 && position <= league.promotionPlaces) {
    factors.push({ label: 'In the automatic promotion places', delta: 7 })
  } else if (league.playoffPlaces > 0 && position <= league.promotionPlaces + league.playoffPlaces) {
    factors.push({ label: 'In the play-off places', delta: 4 })
  }
  if (
    tableIsMeaningful
    && league.relegationPlaces > 0
    && position > clubCount - league.relegationPlaces
  ) {
    factors.push({ label: 'In the relegation places', delta: -15 * tableConfidence })
  }

  // 4. Money. A crowd notices an embargo and it notices being charged more
  //    than the club is worth watching.
  if (club.finances.inCrisis) {
    factors.push({ label: 'Club in financial crisis', delta: -18 })
  } else if (club.finances.debt > weeklyClubRevenue(state, club) * 25) {
    factors.push({ label: 'Worrying levels of debt', delta: -6 })
  }

  const leagueAveragePrice = averageTicketPrice(state, league)
  if (leagueAveragePrice > 0) {
    const ratio = club.facilities.stadium.ticketPrice / leagueAveragePrice
    if (ratio > 1.2) factors.push({ label: 'Ticket prices well above the division average', delta: -7 })
    else if (ratio < 0.85) factors.push({ label: 'Ticket prices below the division average', delta: 4 })
  }

  // 5. Recruitment, as supporters read it: did the club sell its best players,
  //    and did it replace them?
  const recruitment = assessRecruitmentMood(state, club)
  factors.push(...recruitment)

  // 6. A cup run. Disproportionately important lower down, which is exactly
  //    where it is most likely to happen.
  const cup = Object.values(state.cups).find((c) => c.nationId === club.nationId)
  if (cup) {
    if (cup.winnerId === club.id) factors.push({ label: `Won the ${cup.name}`, delta: 16 })
    else if (cup.currentRound >= 4 && cupSurvivor(state, cup, club.id)) {
      factors.push({ label: `Still in the ${cup.name}`, delta: 8 })
    }
  }

  // 7. Last season still colours the mood at the start of this one.
  const lastSeason = club.history[club.history.length - 1]
  if (lastSeason && (!tableIsMeaningful || state.date.week <= 16)) {
    const previousLeague = state.leagues[lastSeason.leagueId]
    if (previousLeague && previousLeague.tier > league.tier) {
      factors.push({ label: 'Promoted last season', delta: 8 })
    } else if (previousLeague && previousLeague.tier < league.tier) {
      factors.push({ label: 'Relegated last season', delta: -9 })
    }
  }

  // 8. Standing. A club whose supporters have been given nothing to shout
  //    about for years is a harder crowd than a newly ambitious one.
  if (club.facilities.stadium.quality < 25) {
    factors.push({ label: 'Ground is in poor condition', delta: -4 })
  }

  const total = factors.reduce((sum, f) => sum + f.delta, 0)
  return { target: clamp(FAN_MOOD_BASELINE + total, 1, 100), factors }
}

/**
 * What supporters make of the club's transfer business this season: selling
 * the best player without replacing him is the classic way a director loses a
 * crowd, and it should cost something visible.
 */
function assessRecruitmentMood(state: GameState, club: Club): FanMoodFactor[] {
  const factors: FanMoodFactor[] = []
  const season = state.date.season

  const soldThisSeason = state.completedTransfers.filter(
    (t) => t.season === season && t.fromClubId === club.id && t.fee > 0,
  )
  const boughtThisSeason = state.completedTransfers.filter(
    (t) => t.season === season && t.toClubId === club.id,
  )

  const revenue = Math.max(1, weeklyClubRevenue(state, club) * 52)
  const salesValue = soldThisSeason.reduce((sum, t) => sum + t.fee, 0)
  const purchasesValue = boughtThisSeason.reduce((sum, t) => sum + t.fee, 0)

  // Measured against the club's own turnover, so a £2m sale means something
  // very different in the fifth tier than in the first.
  const netAsShareOfRevenue = (salesValue - purchasesValue) / revenue

  if (netAsShareOfRevenue > 0.35) {
    factors.push({ label: 'Sold more than the club replaced', delta: -10 })
  } else if (netAsShareOfRevenue < -0.35) {
    factors.push({ label: 'Backed the squad in the market', delta: 8 })
  }

  const marquee = boughtThisSeason.find((t) => t.fee > revenue * 0.25)
  if (marquee) factors.push({ label: `Signing of ${marquee.playerName}`, delta: 5 })

  return factors
}

/**
 * Move stored mood toward the assessed target.
 *
 * Smoothed rather than snapped so a single result does not swing a crowd
 * completely, but with no independent drift term — if the causes stop
 * changing, mood settles and stays there.
 */
export function updateFanMood(state: GameState, club: Club): void {
  const { target } = assessFanMood(state, club)
  club.fanMood = clamp(club.fanMood + (target - club.fanMood) * 0.16, 1, 100)
}

function averageTicketPrice(state: GameState, league: League): number {
  const clubs = league.clubIds.map((id) => state.clubs[id]).filter(Boolean) as Club[]
  if (clubs.length === 0) return 0
  return clubs.reduce((sum, c) => sum + c.facilities.stadium.ticketPrice, 0) / clubs.length
}

function cupSurvivor(state: GameState, cup: { rounds: { fixtureIds: ID[] }[] }, clubId: ID): boolean {
  for (const round of cup.rounds) {
    for (const fixtureId of round.fixtureIds) {
      const fixture = state.fixtures.find((f) => f.id === fixtureId)
      if (!fixture?.result) continue
      if (fixture.homeClubId !== clubId && fixture.awayClubId !== clubId) continue
      const result = fixture.result
      const lost = result.penalties
        ? (fixture.homeClubId === clubId
          ? result.penalties.home < result.penalties.away
          : result.penalties.away < result.penalties.home)
        : (fixture.homeClubId === clubId
          ? result.homeGoals < result.awayGoals
          : result.awayGoals < result.homeGoals)
      if (lost) return false
    }
  }
  return true
}

/**
 * Local copy of the revenue estimate, kept here to avoid a circular import
 * between the board and finance modules.
 */
function weeklyClubRevenue(state: GameState, club: Club): number {
  const league = state.leagues[club.leagueId]
  const tv = league ? league.tvRevenue / 46 : 0
  const sponsor =
    (club.finances.sponsorship.shirtValuePerSeason + club.finances.sponsorship.kitValuePerSeason) / 52
  const matchday =
    (club.facilities.stadium.capacity * (0.4 + club.fanbase / 220) * club.facilities.stadium.ticketPrice) / 2
  return Math.round(tv + sponsor + matchday)
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

/**
 * Unattached staff who would consider working for this club.
 *
 * The reputation ceiling is what stops a non-league side hiring a coach who
 * has run a top-flight club, and it is why improving the club is what unlocks
 * better staff rather than simply having money.
 */
export function availableStaff(state: GameState, club: Club, role: StaffRole): Staff[] {
  const ceiling = club.reputation + (role === 'headCoach' ? 18 : 24)
  return Object.values(state.staff)
    .filter((s) => s.role === role && s.clubId === null && s.reputation <= ceiling)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 15)
}

/** Candidates for a vacant head coach position, filtered by club standing. */
export function availableCoaches(state: GameState, club: Club): Staff[] {
  return availableStaff(state, club, 'headCoach')
}

/**
 * Hire a non-coach staff member. Separate from hireCoach because appointing a
 * head coach replaces an incumbent and changes who picks the team, whereas
 * adding a scout is simply another salary.
 */
export function hireStaff(
  state: GameState,
  club: Club,
  member: Staff,
  wage: number,
  seasons: number,
): { ok: true } | { ok: false; error: string } {
  if (member.clubId) return { ok: false, error: 'That person is already employed.' }
  if (member.role === 'headCoach') {
    return { ok: false, error: 'Use the head coach appointment for that.' }
  }
  if (member.reputation > club.reputation + 24) {
    return { ok: false, error: `${member.knownAs} would not consider a club of this size.` }
  }
  if (wage < expectedWage(member) * 0.75) {
    return { ok: false, error: `${member.knownAs} expects considerably more than that.` }
  }
  if (club.finances.inCrisis) {
    return { ok: false, error: 'The club cannot take on more wages while in crisis.' }
  }

  member.clubId = club.id
  member.contract = { wage: Math.round(wage), expiresSeason: state.date.season + seasons }
  member.joinedSeason = state.date.season
  club.staff.push(member.id)
  return { ok: true }
}

/** Dismiss a staff member, paying up the remainder of their deal. */
export function dismissStaff(
  state: GameState,
  club: Club,
  member: Staff,
): { ok: true; cost: number } | { ok: false; error: string } {
  if (member.clubId !== club.id) return { ok: false, error: 'They do not work here.' }
  if (member.id === club.headCoachId) {
    return { ok: false, error: 'Appoint a replacement head coach instead.' }
  }

  const seasonsLeft = Math.max(0, (member.contract?.expiresSeason ?? state.date.season) - state.date.season)
  const cost = Math.round((member.contract?.wage ?? 0) * (seasonsLeft * 52 + 26) * 0.5)
  if (cost > club.finances.balance) {
    return { ok: false, error: 'The club cannot afford the settlement.' }
  }

  club.finances.balance -= cost
  club.finances.season.otherCosts += cost
  club.staff = club.staff.filter((id) => id !== member.id)
  member.clubId = null
  member.contract = null
  member.assignment = null
  return { ok: true, cost }
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
