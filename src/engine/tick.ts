import { clamp, Rng } from './rng'
import { IdFactory } from './ids'
import { NameGenerator } from './names/generator'
import { quickSimulate, simulateMatch } from './sim/match'
import { applyMatchFatigue } from './systems/injuries'
import { phaseForWeek, SEASON_WEEKS } from './sim/schedule'
import { processInjuries } from './systems/injuries'
import { processMorale, refreshSquadStatuses } from './systems/morale'
import { developPlayer } from './systems/development'
import { processFinances } from './systems/finance'
import { progressProjects, decayStadium } from './systems/facilities'
import { processContracts } from './systems/contracts'
import { processScouting } from './systems/scouting'
import { generateIncomingOffers, processAiTransfers, processNegotiations } from './systems/transfers'
import { checkForExposure, generateOrganicStories } from './systems/media'
import { processBoard, processCoachRelations, sortTable, updateFanMood } from './systems/board'
import { addInboxItem, addNews, expireItems } from './systems/inbox'
import { computeValue } from './systems/valuation'
import { runSeasonRollover } from './season'
import { produceIntake, INTAKE_WEEK } from './systems/academy'
import { drawNextRoundIfDue, settleRound } from './sim/cups'
import type {
  Club, Fixture, GameState, ID, MatchResult, Player, SeasonPhase,
} from './types'

/**
 * The weekly tick.
 *
 * One call advances the world by a week: matches are played, players develop
 * and get injured, money moves, the press writes, the board judges, and the
 * inbox fills with things that need answering. Everything is orchestrated from
 * here so the order of operations is explicit and auditable — subtle bugs in a
 * simulation of this shape almost always turn out to be ordering bugs.
 */

export interface TickResult {
  /** Matches involving the player's club, for the results screen. */
  playerFixtures: { fixture: Fixture; result: MatchResult }[]
  /** True when the season rolled over during this tick. */
  seasonEnded: boolean
  /** True when the director was dismissed. */
  sacked: boolean
  sackMessage?: string
}

export interface TickDeps {
  ids: IdFactory
  names: NameGenerator
}

export function advanceWeek(state: GameState, deps: TickDeps): TickResult {
  const { ids, names } = deps
  const week = state.date.week
  const rng = new Rng(`${state.seed}:${state.date.season}:${week}`)

  const result: TickResult = { playerFixtures: [], seasonEnded: false, sacked: false }

  state.phase = phaseForWeek(week) as SeasonPhase

  // --- 1. Academy intake ----------------------------------------------------
  if (week === INTAKE_WEEK) {
    runAcademyIntake(state, ids, names, rng)
  }

  // --- 1b. Cup draws --------------------------------------------------------
  // Drawn before matches are simulated so this week's cup ties are played in
  // the same pass as the league programme — which is what makes a cup run cost
  // squad depth rather than simply adding money.
  for (const cup of Object.values(state.cups)) {
    const drawn = drawNextRoundIfDue(state, cup, ids, rng.fork(`cupdraw:${cup.id}`))
    if (drawn.length === 0) continue
    state.fixtures.push(...drawn)

    const involvesPlayer = drawn.some(
      (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
    )
    if (involvesPlayer) {
      const tie = drawn.find(
        (f) => f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId,
      )!
      const home = tie.homeClubId === state.playerClubId
      const opponent = state.clubs[home ? tie.awayClubId : tie.homeClubId]
      const round = cup.rounds[cup.rounds.length - 1]
      addInboxItem(state, ids, {
        category: 'match',
        subject: `${cup.name}: ${round?.name ?? 'draw'}`,
        from: 'Competition Secretary',
        body: `You have been drawn ${home ? 'at home to' : 'away to'} ${opponent?.name ?? 'an opponent'} in the ${round?.name.toLowerCase() ?? 'next round'}.`,
        link: { view: 'league' },
      })
    }
  }

  // --- 2. Matches -----------------------------------------------------------
  const playedClubs = new Set<ID>()
  const homeClubs = new Map<ID, number>()
  const weekFixtures = state.fixtures.filter(
    (f) => f.week === week && f.season === state.date.season && !f.result,
  )

  // Suspensions are computed once for the week from accumulated cards.
  const suspendedIds = collectSuspensions(state)

  for (const fixture of weekFixtures) {
    const home = state.clubs[fixture.homeClubId]
    const away = state.clubs[fixture.awayClubId]
    if (!home || !away) continue

    // Full simulation only where the player might actually look. Everything
    // else uses the same strength model with event generation switched off.
    const detailed =
      home.id === state.playerClubId
      || away.id === state.playerClubId
      || involvesTrackedPlayer(state, home, away)

    const matchRng = rng.fork(fixture.id)
    // A knockout tie has to produce a winner, or nobody is eliminated and the
    // competition never reaches a final.
    const matchCtx = {
      suspendedIds,
      mustHaveWinner: fixture.competitionType !== 'league',
    }
    const matchResult = detailed
      ? simulateMatch(state, home, away, matchRng, matchCtx, true)
      : quickSimulate(state, home, away, matchRng, matchCtx)

    fixture.result = matchResult
    applyMatchOutcome(state, fixture, matchResult, matchRng)

    // Full results are only worth keeping for matches the player can look at.
    // A season is ~9,000 fixtures worldwide, and storing 22 lineup ids and 22
    // ratings for each of them was several megabytes of save file describing
    // matches nobody will ever open. Everything the simulation needs from a
    // result has already been applied to tables, stats and form by this point.
    if (!detailed) slimResult(matchResult)

    playedClubs.add(home.id)
    playedClubs.add(away.id)
    homeClubs.set(home.id, matchResult.attendance)

    if (home.id === state.playerClubId || away.id === state.playerClubId) {
      result.playerFixtures.push({ fixture, result: matchResult })
    }
  }

  // --- 2b. Settle cup rounds ------------------------------------------------
  for (const cup of Object.values(state.cups)) {
    const round = cup.rounds[cup.rounds.length - 1]
    if (!round || round.week !== week) continue
    const settled = settleRound(state, cup, round)
    if (settled.winnerId === state.playerClubId) {
      addInboxItem(state, ids, {
        category: 'match',
        subject: `You have won the ${cup.name}`,
        from: 'Chairman',
        body: `${state.clubs[state.playerClubId]?.name} are ${cup.name} winners. Nobody will forget this season.`,
        link: { view: 'club' },
      })
    } else if (settled.eliminated.includes(state.playerClubId)) {
      addNews(state, ids, 'match', `Knocked out of the ${cup.name} in the ${round.name.toLowerCase()}.`)
    }
  }

  // --- 3. Per-club weekly processing ---------------------------------------
  // Several passes below run over the whole world. Everything the player can
  // see happens every week; everything they cannot is staggered across a
  // rotation, which keeps the tick responsive on a phone without the world
  // visibly freezing in place. `clubIndex` gives each club a stable slot.
  const allClubs = Object.values(state.clubs)
  const clubIndex = new Map<ID, number>()
  allClubs.forEach((club, index) => clubIndex.set(club.id, index))
  const inRotation = (club: Club, period: number): boolean =>
    club.id === state.playerClubId || (clubIndex.get(club.id) ?? 0) % period === week % period

  for (const club of allClubs) {
    const played = playedClubs.has(club.id)
    const clubRng = rng.fork(club.id)

    updateFanMood(state, club)
    const { newInjuries } = processInjuries(state, club, clubRng, played)
    processFinances(state, club, clubRng, homeClubs.has(club.id)
      ? { attendance: homeClubs.get(club.id) ?? 0 }
      : null)
    progressProjects(club)
    decayStadium(club, clubRng)

    if (club.id === state.playerClubId) {
      reportInjuries(state, ids, newInjuries)
    }
  }

  // --- 4. Player development ------------------------------------------------
  // Development runs for every player in the world, because a world where only
  // your players improve would have a broken transfer market within two years.
  const devRng = rng.fork('development')
  for (const player of Object.values(state.players)) {
    if (!player.clubId) continue
    const club = state.clubs[player.clubId]
    // Development for other clubs is applied fortnightly at double weight —
    // identical over a season, half the work.
    if (!club || !inRotation(club, 2)) continue
    const note = developPlayer(state, player, { rng: devRng, week })
    if (note && player.clubId === state.playerClubId) {
      addNews(state, ids, 'player', note, { view: 'player', id: player.id })
    }
  }

  // --- 5. Morale and squad state -------------------------------------------
  const playerClub = state.clubs[state.playerClubId]
  for (const club of allClubs) {
    // Squad harmony at clubs the player never looks at only needs to be
    // roughly right, so it is refreshed monthly rather than weekly.
    if (!inRotation(club, 4)) continue
    const grievances = processMorale(state, club, rng.fork(`morale:${club.id}`))
    if (club.id === state.playerClubId) {
      for (const grievance of grievances) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `${grievance.player.knownAs} — ${grievance.severity === 'high' ? 'serious concern' : 'unhappy'}`,
          from: 'Player Liaison',
          body: grievance.reason,
          urgent: grievance.severity === 'high',
          link: { view: 'player', id: grievance.player.id },
        })
      }
    }
  }

  // --- 6. Valuations --------------------------------------------------------
  // Anything the player can see a price for is revalued every week, so the
  // squad screen, a scout report and a negotiation never quote three different
  // numbers for the same player. The rest of the world is revalued on an
  // eight-week rotation, which is well inside the rate at which values
  // actually move.
  const priceCritical = new Set<ID>(state.shortlist)
  for (const negotiation of state.negotiations) priceCritical.add(negotiation.playerId)
  for (const id of Object.keys(state.scoutReports)) priceCritical.add(id)
  if (playerClubForPricing(state)) {
    for (const id of playerClubForPricing(state)!.squad) priceCritical.add(id)
  }

  for (const player of Object.values(state.players)) {
    const club = player.clubId ? state.clubs[player.clubId] : null
    if (!priceCritical.has(player.id) && (!club || !inRotation(club, 8))) continue
    const league = club ? state.leagues[club.leagueId] : null
    const nation = club ? state.nations[club.nationId] : state.nations[player.nationalityId]
    player.value = computeValue(player, league, nation ?? null, state.date.season)
  }

  // --- 7. Transfers ---------------------------------------------------------
  const transferCtx = { rng: rng.fork('transfers'), ids }
  const negotiationNotices = processNegotiations(state, transferCtx)
  for (const notice of negotiationNotices) {
    addInboxItem(state, ids, {
      category: 'transfer',
      subject: 'Transfer update',
      from: 'Recruitment',
      body: notice,
      link: { view: 'transfers' },
    })
  }
  processAiTransfers(state, transferCtx)
  reportIncomingOffers(state, ids, transferCtx)

  // --- 8. Scouting ----------------------------------------------------------
  if (playerClub) {
    const scoutingCtx = { rng: rng.fork('scouting'), week, season: state.date.season }
    const { discovered } = processScouting(state, playerClub, scoutingCtx)
    for (const player of discovered.slice(0, 3)) {
      const report = state.scoutReports[player.id]
      if (!report || report.recommendation < 62) continue
      addInboxItem(state, ids, {
        category: 'scouting',
        subject: `Scout report: ${player.knownAs}`,
        from: state.staff[report.scoutId]?.knownAs ?? 'Scouting Department',
        body: report.verdict,
        link: { view: 'player', id: player.id },
      })
    }
  }

  // --- 9. Contracts ---------------------------------------------------------
  if (playerClub) {
    const alerts = processContracts(state, playerClub, rng.fork('contracts'))
    for (const alert of alerts) {
      addInboxItem(state, ids, {
        category: 'player',
        subject: `Contract: ${alert.player.knownAs}`,
        from: 'Club Secretary',
        body: alert.message,
        urgent: alert.urgent,
        link: { view: 'player', id: alert.player.id },
      })
    }
  }

  // --- 10. Media ------------------------------------------------------------
  const mediaCtx = { rng: rng.fork('media'), ids }
  const stories = generateOrganicStories(state, mediaCtx)
  for (const story of stories) {
    addInboxItem(state, ids, {
      category: 'media',
      subject: story.headline,
      from: state.outlets[story.outletId]?.name ?? 'The press',
      body: story.body,
      link: { view: 'media', id: story.id },
    })
  }
  for (const notice of checkForExposure(state, mediaCtx)) {
    addInboxItem(state, ids, {
      category: 'media',
      subject: 'Your briefing has been exposed',
      from: 'Communications',
      body: notice,
      urgent: true,
      link: { view: 'media' },
    })
  }

  // --- 11. Board and coach --------------------------------------------------
  if (playerClub) {
    const boardResult = processBoard(state, playerClub, rng.fork('board'))
    for (const message of boardResult.messages) {
      addInboxItem(state, ids, {
        category: 'board',
        subject: 'Message from the board',
        from: 'Chairman',
        body: message,
        urgent: true,
        link: { view: 'board' },
      })
    }
    if (boardResult.sacked) {
      result.sacked = true
      result.sackMessage = boardResult.messages[boardResult.messages.length - 1]
    }

    const coachResult = processCoachRelations(state, playerClub, ids, rng.fork('coach'))
    for (const message of coachResult.messages) {
      addInboxItem(state, ids, {
        category: 'coach',
        subject: 'From the head coach',
        from: playerClub.headCoachId
          ? state.staff[playerClub.headCoachId]?.knownAs ?? 'Head Coach'
          : 'Head Coach',
        body: message,
        link: { view: 'staff' },
      })
    }
  }

  // Board confidence and coach relations move for AI clubs too, but cheaply —
  // they only need to be roughly right so that AI coaches get sacked and AI
  // clubs change direction.
  for (const club of allClubs) {
    if (club.id === state.playerClubId) continue
    if (!inRotation(club, 4)) continue
    processBoard(state, club, rng.fork(`aiboard:${club.id}`))
  }

  // --- 12. Housekeeping -----------------------------------------------------
  for (const item of expireItems(state)) {
    addNews(state, ids, item.category, `Auto-resolved: ${item.subject}`, item.link)
  }
  if (playerClub) refreshSquadStatuses(state, playerClub)

  // --- 13. Advance the clock ------------------------------------------------
  state.date.week += 1
  if (state.date.week > SEASON_WEEKS) {
    runSeasonRollover(state, { ids, names, rng: rng.fork('rollover') })
    result.seasonEnded = true
  }
  state.phase = phaseForWeek(state.date.week) as SeasonPhase
  state.savedAt = Date.now()
  state.nextId = ids.value

  return result
}

// ---------------------------------------------------------------------------

/** Apply a match result to tables, stats, form and fatigue. */
function applyMatchOutcome(
  state: GameState,
  fixture: Fixture,
  result: MatchResult,
  rng: Rng,
): void {
  const home = state.clubs[fixture.homeClubId]
  const away = state.clubs[fixture.awayClubId]
  if (!home || !away) return

  // League table.
  if (fixture.competitionType === 'league') {
    const table = state.tables[fixture.competitionId]
    if (table) {
      const homeRow = table.find((r) => r.clubId === home.id)
      const awayRow = table.find((r) => r.clubId === away.id)
      if (homeRow && awayRow) {
        homeRow.played++
        awayRow.played++
        homeRow.goalsFor += result.homeGoals
        homeRow.goalsAgainst += result.awayGoals
        awayRow.goalsFor += result.awayGoals
        awayRow.goalsAgainst += result.homeGoals

        if (result.homeGoals > result.awayGoals) {
          homeRow.won++; homeRow.points += 3; awayRow.lost++
          pushForm(homeRow.form, 'W'); pushForm(awayRow.form, 'L')
        } else if (result.homeGoals < result.awayGoals) {
          awayRow.won++; awayRow.points += 3; homeRow.lost++
          pushForm(homeRow.form, 'L'); pushForm(awayRow.form, 'W')
        } else {
          homeRow.drawn++; awayRow.drawn++
          homeRow.points++; awayRow.points++
          pushForm(homeRow.form, 'D'); pushForm(awayRow.form, 'D')
        }
      }
    }
  }

  // Fan mood is deliberately NOT adjusted here. Nudging it per result, with a
  // defeat costing more than a win paid, is what made it decay on its own; the
  // weekly assessment reads recent form directly from the table instead.

  // Player stats, ratings, fatigue.
  const allLineups = [
    { ids: result.homeLineup, club: home, conceded: result.awayGoals },
    { ids: result.awayLineup, club: away, conceded: result.homeGoals },
  ]

  for (const { ids: lineup, conceded } of allLineups) {
    for (const playerId of lineup) {
      const player = state.players[playerId]
      if (!player) continue
      player.stats.appearances++
      player.stats.starts++
      player.stats.minutes += 90
      const rating = result.ratings[playerId] ?? 6.5
      player.stats.ratingSum += rating
      if (conceded === 0 && isDefensivePosition(player)) player.stats.cleanSheets++
      applyMatchFatigue(player, 90, rng)
      // Form tracks recent ratings directly, so a run of good performances is
      // visible before it shows up in results.
      player.form = clamp(player.form + (rating - 6.5) * 4, 1, 100)
      player.morale = clamp(player.morale + (rating - 6.4) * 1.2, 1, 100)
    }
  }

  // Event-derived stats.
  for (const event of result.events) {
    const player = state.players[event.playerId]
    if (!player) continue
    switch (event.type) {
      case 'goal':
      case 'penaltyScored':
        player.stats.goals++
        if (event.secondaryPlayerId) {
          const assister = state.players[event.secondaryPlayerId]
          if (assister) assister.stats.assists++
        }
        break
      case 'yellowCard':
        player.stats.yellowCards++
        // Every fifth booking in a season earns a one-match ban.
        if (player.stats.yellowCards % 5 === 0) player.suspendedWeeks = 1
        break
      case 'redCard':
        player.stats.redCards++
        // A straight red is a longer ban than a second yellow, but the event
        // does not distinguish them, so this takes the middle ground.
        player.suspendedWeeks = Math.max(player.suspendedWeeks, rng.int(1, 3))
        break
      case 'injury': {
        const club = state.clubs[event.clubId]
        if (club && !player.injury) {
          const medical = club.facilities.medicalCentre
          player.injury = {
            type: 'Match injury',
            weeksRemaining: Math.max(1, Math.round(rng.int(1, 8) * (1.2 - medical / 40))),
            severity: 'minor',
            lingeringEffect: 0,
          }
        }
        break
      }
      case 'substitution': {
        const off = event.secondaryPlayerId ? state.players[event.secondaryPlayerId] : null
        if (off) off.stats.minutes -= Math.max(0, 90 - event.minute)
        const on = state.players[event.playerId]
        if (on && !result.homeLineup.includes(on.id) && !result.awayLineup.includes(on.id)) {
          on.stats.appearances++
          on.stats.minutes += Math.max(0, 90 - event.minute)
        }
        break
      }
      default:
        break
    }
  }

  // Man of the match.
  const best = Object.entries(result.ratings).sort((a, b) => b[1] - a[1])[0]
  if (best) {
    const player = state.players[best[0]]
    if (player) player.stats.motmAwards++
  }
}

/** Strip the per-player detail from a result once it has been applied. */
function slimResult(result: MatchResult): void {
  result.events = []
  result.ratings = {}
  result.homeLineup = []
  result.awayLineup = []
}

function pushForm(form: ('W' | 'D' | 'L')[], outcome: 'W' | 'D' | 'L'): void {
  form.push(outcome)
  if (form.length > 6) form.shift()
}

function isDefensivePosition(player: Player): boolean {
  return ['GK', 'DC', 'DL', 'DR'].includes(player.position)
}

/**
 * Players serving a suspension this week, and tick down everyone else's.
 *
 * Suspensions are stored as a countdown on the player rather than inferred
 * from card totals: inferring it means a player with five yellows is suspended
 * forever, and no amount of arithmetic on totals can distinguish "banned this
 * week" from "banned three weeks ago".
 */
function collectSuspensions(state: GameState): Set<ID> {
  const suspended = new Set<ID>()
  for (const player of Object.values(state.players)) {
    if (player.suspendedWeeks > 0) {
      suspended.add(player.id)
      player.suspendedWeeks -= 1
    }
  }
  return suspended
}

/** Whether either club fields a player the human is tracking. */
function involvesTrackedPlayer(state: GameState, home: Club, away: Club): boolean {
  if (state.shortlist.length === 0) return false
  const tracked = new Set(state.shortlist)
  return (
    home.squad.some((id) => tracked.has(id)) || away.squad.some((id) => tracked.has(id))
  )
}

function reportInjuries(
  state: GameState,
  ids: IdFactory,
  injured: Player[],
): void {
  for (const player of injured) {
    if (!player.injury) continue
    const weeks = player.injury.weeksRemaining
    addInboxItem(state, ids, {
      category: 'player',
      subject: `${player.knownAs} injured`,
      from: 'Medical Department',
      body: `${player.knownAs} has picked up a ${player.injury.type.toLowerCase()} and will be unavailable for around ${weeks} week${weeks === 1 ? '' : 's'}.`,
      urgent: weeks >= 8,
      link: { view: 'player', id: player.id },
    })
  }
}

function reportIncomingOffers(
  state: GameState,
  ids: IdFactory,
  ctx: { rng: Rng; ids: IdFactory },
): void {
  const offers = generateIncomingOffers(state, ctx)
  for (const offer of offers) {
    addInboxItem(state, ids, {
      category: 'transfer',
      subject: `Offer received for ${offer.player.knownAs}`,
      from: 'Recruitment',
      body: `${offer.buyer.name} have made an offer of ${formatMoneyShort(offer.fee)} for ${offer.player.knownAs}. He is valued at ${formatMoneyShort(offer.player.value)}.`,
      urgent: true,
      link: { view: 'player', id: offer.player.id },
      expiresInWeeks: 2,
      payload: {
        kind: 'transferOffer',
        playerId: offer.player.id,
        buyerId: offer.buyer.id,
        fee: offer.fee,
      },
      decision: {
        prompt: `How do you want to respond to ${offer.buyer.name}?`,
        options: [
          { id: 'accept', label: 'Accept the offer', hint: 'He leaves and the money comes in.', available: true },
          { id: 'negotiate', label: 'Ask for more', hint: 'They may improve it, or walk away.', available: true },
          { id: 'reject', label: 'Reject it', hint: 'He stays. He may not be pleased.', available: true },
        ],
        defaultOptionId: 'reject',
      },
    })
  }
}

function formatMoneyShort(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`
  return `£${Math.round(amount)}`
}

function runAcademyIntake(
  state: GameState,
  ids: IdFactory,
  names: NameGenerator,
  rng: Rng,
): void {
  for (const club of Object.values(state.clubs)) {
    const ctx = { rng: rng.fork(`intake:${club.id}`), ids, names, season: state.date.season }
    const { summary } = produceIntake(state, club, ctx)
    if (club.id === state.playerClubId) {
      addInboxItem(state, ids, {
        category: 'academy',
        subject: 'Youth intake',
        from: 'Academy Director',
        body: summary,
        link: { view: 'academy' },
      })
    }
  }
}

function playerClubForPricing(state: GameState): Club | null {
  return state.clubs[state.playerClubId] ?? null
}

/** Sorted league table for a competition, exported for the UI. */
export function getTable(state: GameState, leagueId: ID) {
  return sortTable(state.tables[leagueId] ?? [])
}
