import { clamp, Rng } from './rng'
import { buyBackAskingPrice, buyBackDiscountedFee } from './systems/buyBack'
import { IdFactory } from './ids'
import { NameGenerator } from './names/generator'
import { quickSimulate, simulateMatch } from './sim/match'
import { applyMatchFatigue } from './systems/injuries'
import { phaseForWeek, SEASON_WEEKS } from './sim/schedule'
import { processInjuries } from './systems/injuries'
import { processMorale, refreshSquadStatuses } from './systems/morale'
import { developPlayer } from './systems/development'
import { processFinances } from './systems/finance'
import { progressProjects } from './systems/facilities'
import { decayStadium, progressStadiumWork, releaseArchitects } from './systems/stadium'
import { processContracts } from './systems/contracts'
import { processScouting } from './systems/scouting'
import { modelDue, pruneFindings, runModel } from './systems/dataDepartment'
import {
  INTERNATIONAL_WEEKS, TOURNAMENT_WEEK, callUpsFor, clubsAffected, dutyInjury, dutyInjuryChance,
  dutyTravel,
  isAwayOnDuty, isTournamentSeason, runTournament, sendOnDuty,
} from './systems/international'
import { generateIncomingOffers, processAiTransfers, processNegotiations } from './systems/transfers'
import { runAiSquadManagement } from './systems/aiSquad'
import { ELEVEN, canFieldEleven, fieldable, fixAiSquad, warnHuman } from './systems/matchday'
import { checkForExposure, generateOrganicStories } from './systems/media'
import { boardRemark, gotAwayStory, reportOnesThatGotAway, scoredAgainstUs } from './systems/oneThatGotAway'
import { processBoard, processCoachRelations, sortTable, updateFanMood } from './systems/board'
import { addInboxItem, addNews, expireItems } from './systems/inbox'
import { computeValue } from './systems/valuation'
import { payDirectorSalary, paySeverance } from './systems/directorContract'
import { runSeasonRollover } from './season'
import { produceIntake, INTAKE_WEEK } from './systems/academy'
import {
  reconcileRegistration, squadRegistration, SQUAD_LIMIT, U21_AGE,
} from './systems/registration'
import { adjustForPlayer } from './systems/agents'
import { processTakeovers } from './systems/takeovers'
import {
  generateDeadlineBids, isDeadlineWeek, runWorldDeadline,
} from './systems/deadlineDay'
import { drawNextRoundIfDue, settleRound } from './sim/cups'
import { playerClub as clubInCharge } from './playerClub'
import { dismissDirector } from './systems/jobSearch'
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

  // --- 2a. Being able to field a side --------------------------------------
  //
  // Before a ball is kicked, every club with a fixture has to have eleven
  // players. Nothing forfeits: a league that cannot fulfil its own calendar is
  // a broken world, not a hard lesson. The two sides answer for it differently.
  //
  // An AI club fixes itself — academy, free agent, and an invented sixteen-
  // year-old as the admission of last resort. The human is not rescued: he has
  // been warned every week it was true (section 5b), and if it is still true
  // on the morning of a match he is dismissed for it. Failing to put eleven
  // players on a pitch is the one thing a director of football is
  // unambiguously employed to prevent. The club then becomes an AI club and
  // fixes the side in time to kick off, which is why the fixture still stands.
  const matchdayDeps = { ids, names, rng: rng.fork('matchday') }
  const playingThisWeek = new Set<ID>()
  for (const fixture of weekFixtures) {
    playingThisWeek.add(fixture.homeClubId)
    playingThisWeek.add(fixture.awayClubId)
  }

  const clubOnMatchday = clubInCharge(state)
  if (clubOnMatchday && playingThisWeek.has(clubOnMatchday.id)
    && !canFieldEleven(state, clubOnMatchday, week)) {
    const short = ELEVEN - fieldable(state, clubOnMatchday, week).length
    addInboxItem(state, ids, {
      category: 'board',
      subject: 'You are dismissed',
      from: 'Chairman',
      body: `We have a match this week and you have left us ${short} player`
        + `${short === 1 ? '' : 's'} short of a legal side. Whatever else this job is, `
        + 'it is putting eleven players on a pitch. Your contract is terminated with '
        + 'immediate effect and we will assemble a team ourselves.',
      urgent: true,
      link: { view: 'career' },
    })
    result.sacked = true
    result.sackMessage = 'Dismissed for failing to field a side.'
    paySeverance(state, clubOnMatchday)
    dismissDirector(state, ids, rng.fork('dismissal:squad'))
  }

  for (const clubId of playingThisWeek) {
    const club = state.clubs[clubId]
    if (!club || club.id === state.playerClubId) continue
    if (canFieldEleven(state, club, week)) continue
    fixAiSquad(state, club, matchdayDeps, week)
  }

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
    // A single-leg knockout tie has to produce a winner on the night, or
    // nobody is eliminated and the competition never reaches a final. A leg of
    // a two-legged tie must NOT: it is allowed to be drawn, because the tie is
    // settled on aggregate afterwards.
    const matchCtx = {
      suspendedIds,
      mustHaveWinner: fixture.competitionType !== 'league' && !fixture.legOf,
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
    playedClubs.add(home.id)
    playedClubs.add(away.id)
    homeClubs.set(home.id, matchResult.attendance ?? 0)

    // Trimmed after the week has taken what it needs, not before: the gate
    // receipts above are the last reader of a match nobody will open.
    if (!detailed) slimResult(matchResult)

    if (home.id === state.playerClubId || away.id === state.playerClubId) {
      result.playerFixtures.push({ fixture, result: matchResult })

      // Did one of ours score against us?
      //
      // The worst version of the whole thing, and the one the board mentions.
      // Everything else about a released boy can be read about at a distance;
      // this happened in front of everybody, and the chairman was there.
      const ours = state.clubs[state.playerClubId!]
      for (const event of matchResult.events) {
        if (event.type !== 'goal' && event.type !== 'penaltyScored') continue
        if (event.clubId === ours.id) continue
        const ghost = scoredAgainstUs(state, ours, event.playerId)
        if (!ghost) continue
        ours.fanMood = clamp(ours.fanMood - 4, 1, 100)
        addInboxItem(state, ids, {
          category: 'board',
          subject: `${ghost.knownAs} scored against us`,
          from: 'Chairman',
          body: boardRemark(ghost, state),
          urgent: false,
          link: { view: 'player', id: ghost.id },
        })
      }
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
        body: `${clubInCharge(state)?.name} are ${cup.name} winners. Nobody will forget this season.`,
        link: { view: 'club' },
      })
    } else if (state.playerClubId && settled.eliminated.includes(state.playerClubId)) {
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
    // The director is on the payroll like everyone else, so his salary leaves
    // the same balance he is judged on.
    if (club.id === state.playerClubId) payDirectorSalary(state, club)
    const { newInjuries } = processInjuries(state, club, clubRng, played)
    processFinances(state, club, clubRng, homeClubs.has(club.id)
      ? { attendance: homeClubs.get(club.id) ?? 0 }
      : null)
    progressProjects(club)

    // The ground wears out whether or not anyone is looking at it, and the
    // safety officer starts closing places long before it falls down.
    const wear = decayStadium(state, club, clubRng)
    const building = progressStadiumWork(state, club, clubRng)

    if (club.id === state.playerClubId) {
      reportInjuries(state, ids, newInjuries)
      for (const closure of wear.closures) {
        addInboxItem(state, ids, {
          category: 'facilities',
          subject: 'Safety notice served',
          from: 'Safety Officer',
          body: closure,
          urgent: true,
          link: { view: 'stadium' },
        })
      }
      for (const warning of wear.warnings) {
        addNews(state, ids, 'facilities', warning, { view: 'stadium' })
      }
      for (const notice of building.notices) {
        addInboxItem(state, ids, {
          category: 'facilities',
          subject: building.completed ? 'Building work complete' : 'Update from the architects',
          from: club.facilities.stadiumProject?.architectFirm ?? 'Project Office',
          body: notice,
          link: { view: 'stadium' },
        })
      }
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
  const playerClub = clubInCharge(state)

  // --- 5b. Can we field a side next week? -----------------------------------
  //
  // Said as early as it is true, and repeated every week it stays true. By
  // match day it is a dismissal rather than a warning, and a director sacked
  // for something nobody ever told him is a bug rather than a consequence.
  if (playerClub) {
    const nextFixture = state.fixtures.find(
      (f) => f.season === state.date.season && f.week > week && !f.result
        && (f.homeClubId === playerClub.id || f.awayClubId === playerClub.id),
    )
    // Checked against the week the match is played, not this one: a squad that
    // is whole today and loses three men to a break next Tuesday is already in
    // trouble, and that is precisely when it can still be fixed.
    const matchWeek = nextFixture?.week ?? week + 1
    if (!canFieldEleven(state, playerClub, matchWeek)) {
      warnHuman(state, playerClub, ids, matchWeek, nextFixture ? nextFixture.week - week : null)
    }
  }
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
  // Renewals, academy promotions and free-agent signings. Runs every week and
  // outside the window as well, because a club short of players in February
  // cannot wait until June and a free agent needs no window.
  runAiSquadManagement(state, { rng: rng.fork('aisquad'), ids })
  reportIncomingOffers(state, ids, transferCtx)

  // --- 7b. Squad registration lock -----------------------------------------
  // The week after a window shuts, every list in the world is tidied and then
  // frozen. Reconciling rather than rebuilding matters: the human's choices
  // survive, and only the empty places get filled.
  if (isRegistrationLockWeek(week)) lockSquadRegistrations(state, ids)

  // --- 7a2. Deadline day ---------------------------------------------------
  // The last week of a window runs at a different speed: bids arrive with an
  // answer wanted now, and the clubs that would not discuss a price in July
  // become reasonable about it.
  if (isDeadlineWeek(week)) {
    const deadlineRng = rng.fork('deadline')
    const playerClub = clubInCharge(state)
    if (playerClub) {
      for (const notice of generateDeadlineBids(state, playerClub, ids, deadlineRng)) {
        addNews(state, ids, 'transfer', notice, { view: 'transfers' })
      }
      addInboxItem(state, ids, {
        category: 'transfer',
        subject: 'Deadline day',
        from: 'Recruitment',
        body: 'The window shuts at the end of the week. Anyone still on the list is either '
          + 'signed today or not at all, and the clubs who would not talk to us in the summer '
          + 'are answering the phone.',
        link: { view: 'transfers' },
      })
    }
    runWorldDeadline(state, ids, deadlineRng)
  }

  // --- 7b2. Ownership ------------------------------------------------------
  // Approaches, due diligence and completions, everywhere in the world. A
  // rival being bought changes the division underneath a plan you made in
  // good faith, which is the point of running it worldwide.
  processTakeovers(state, ids, rng.fork('takeovers'), names)

  // --- 7c. Agents notice who is not playing --------------------------------
  // Checked once, late enough in the season for "he is not playing" to mean
  // something, and only for the human's club — nobody is keeping score of how
  // two AI clubs treat each other's clients.
  if (week === FREEZE_OUT_REVIEW_WEEK) reviewFrozenOutClients(state, ids)

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

  // --- 7b. International football -------------------------------------------
  //
  // Consequences, not management. Players leave, some come back hurt, and the
  // good ones come back more expensive. The league plays on regardless, which
  // is not a simplification — a twenty-four club division is forty-six rounds
  // in a thirty-nine week window and has no room to stop.
  //
  // **Squads are named the week before.** The first version called players up
  // and played the week in the same tick, which meant nobody was ever visibly
  // away: the flag was set and consumed before a screen could render it, and
  // the squad list's "Away" chip was dead code. A real call-up arrives days
  // ahead, and that gap is the whole point — the loss is something you see
  // coming and cannot do anything about, which is a different feeling from
  // finding out afterwards.
  if (INTERNATIONAL_WEEKS.includes(week + 1)) {
    const dutyRng = rng.fork(`callup:${state.date.season}:${week}`)
    const callUps = callUpsFor(state, dutyRng)
    for (const { player, tournament } of callUps) sendOnDuty(player, week + 1, tournament)

    if (playerClub) {
      // Keyed by the club that has to pick a side without him, so a player we
      // have borrowed counts as ours and one we have loaned out does not.
      const ours = clubsAffected(callUps).get(playerClub.id) ?? []
      if (ours.length > 0) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `${ours.length} player${ours.length === 1 ? '' : 's'} away with `
            + `${ours.length === 1 ? 'his' : 'their'} country next week`,
          from: 'Club Secretary',
          body: `${ours.map((p) => p.knownAs).join(', ')} `
            + `${ours.length === 1 ? 'has' : 'have'} been called up and will miss next week. `
            + 'We play on without them, as everybody does.',
          link: { view: 'squad' },
        })
      }
    }
  }

  // The break itself. They are already out of the side — the selection knows
  // it — so all that happens here is the part nobody chose: somebody else's
  // pitch, somebody else's meaningless friendly, and your player out until
  // March. The oldest grievance in the job.
  if (INTERNATIONAL_WEEKS.includes(week)) {
    const dutyRng = rng.fork(`duty:${state.date.season}:${week}`)
    const tournament = false
    for (const player of Object.values(state.players)) {
      if (!isAwayOnDuty(player, week)) continue
      if (!dutyRng.chance(dutyInjuryChance(state, player))) continue
      const injury = dutyInjury(dutyRng, tournament)
      player.injury = injury
      if (playerClub && (player.loanClubId ?? player.clubId) === playerClub.id) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `${player.knownAs} is hurt, and not by us`,
          from: 'Physiotherapist',
          body: `${player.knownAs} has come back from international duty injured and is out `
            + `for ${injury.weeksRemaining} week${injury.weeksRemaining === 1 ? '' : 's'}. `
            + (dutyTravel(state, player) === 'intercontinental'
              ? 'Two days of flying each way and a pitch nobody here has seen. '
              : '')
            + 'There is nothing to be done about it and no one to send the bill to.',
          urgent: true,
          link: { view: 'player', id: player.id },
        })
      }
    }
  }

  // A tournament summer. Nothing else is happening in week fifty, which is the
  // one honest thing about the international calendar: the tournament gets its
  // own space in the year and the qualifiers do not.
  if (week === TOURNAMENT_WEEK && isTournamentSeason(state.date.season)) {
    const results = runTournament(state, rng.fork(`tournament:${state.date.season}`))
    if (playerClub) {
      const ours = results.filter((r) => r.player.clubId === playerClub.id)
      if (ours.length > 0) {
        const best = ours.slice().sort((a, b) => b.boost - a.boost)[0]
        addInboxItem(state, ids, {
          category: 'transfer',
          subject: `${best.player.knownAs} had a tournament`,
          from: 'Head of Recruitment',
          body: `${ours.map((r) => r.player.knownAs).join(', ')} `
            + `${ours.length === 1 ? 'has' : 'have'} come back from the summer with the market `
            + 'looking at them differently. Expect calls. Expect the asking price to be a '
            + 'conversation rather than a number, and remember the interest fades by next '
            + 'summer whether we sell or not.',
          link: { view: 'player', id: best.player.id },
        })
      }
    }
    if (results.length > 0) {
      addNews(state, ids, 'transfer',
        `${results.length} player${results.length === 1 ? '' : 's'} left the tournament worth `
        + 'more than they arrived, and every one of them belongs to somebody who has to decide.')
    }
  }

  // --- 8b. The data department ---------------------------------------------
  //
  // Re-run on a cadence rather than every week, because a model is consulted
  // rather than watched, and because sweeping the world's players every week
  // would cost more than the rest of the tick.
  if (playerClub) {
    state.dataFindings = pruneFindings(state, playerClub)
    if (modelDue(state)) {
      const before = state.dataFindings.length
      state.dataFindings = runModel(state, playerClub, rng.fork(`data:${week}`))
      const level = playerClub.facilities.dataDepartment
      const best = state.dataFindings[0]
      if (best && (state.dataFindings.length > before || week === 1)) {
        const player = state.players[best.playerId]
        addInboxItem(state, ids, {
          category: 'scouting',
          subject: `The model has ${state.dataFindings.length} name${state.dataFindings.length === 1 ? '' : 's'}`,
          from: 'Data Department',
          body: player
            ? `This run puts ${player.knownAs} at the top: valued at `
              + `${best.marketValue.toLocaleString()}, and the model has him at `
              + `${best.modelValue.toLocaleString()}. ${best.rationale} `
              + `Confidence ${Math.round(best.confidence * 100)}%`
              + (level < 8
                ? ' — which is as much as a department this size can honestly claim.'
                : '.')
            : 'The list has been refreshed.',
          link: { view: 'data' },
        })
      }
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

  // --- 9b. The ones that got away -------------------------------------------
  //
  // Checked on a cadence, because this is a story the press finds when a boy
  // does something rather than a database the club audits every Monday. It is
  // the only moment where being wrong about a sixteen-year-old costs anything
  // a director can feel, and it arrives years after the decision, from
  // somebody else's ground.
  const mediaCtx = { rng: rng.fork('media'), ids }
  if (playerClub && week % 6 === 3) {
    const gotAway = reportOnesThatGotAway(state, playerClub, { ids, rng: rng.fork('gotaway') })
    for (const { player, sting } of gotAway) {
      const story = gotAwayStory(state, playerClub, player, sting, ids, mediaCtx.rng)
      if (!story) continue
      state.mediaStories.push(story)
      addInboxItem(state, ids, {
        category: 'media',
        subject: story.headline,
        from: state.outlets[story.outletId]?.name ?? 'The press',
        body: story.body,
        link: { view: 'media' },
      })
    }
  }

  // --- 10. Media ------------------------------------------------------------
  const stories = generateOrganicStories(state, mediaCtx)
  for (const story of stories) {
    addInboxItem(state, ids, {
      category: 'media',
      subject: story.headline,
      from: state.outlets[story.outletId]?.name ?? 'The press',
      body: story.body,
      // No id: the media screen is not addressable by story, and a link to
      // a route that does not exist falls through to the catch-all.
      link: { view: 'media' },
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
      const severance = paySeverance(state, playerClub)
      if (severance > 0) {
        addInboxItem(state, ids, {
          category: 'finance',
          subject: 'Severance settled',
          from: 'Your representative',
          body: `Your contract has been paid up. ${severance.toLocaleString()} has been settled in full.`,
          link: { view: 'career' },
        })
      }
      // And you actually leave. This used to be an announcement: the club
      // stayed yours, so the same board dismissed you again the week after,
      // and the week after that.
      dismissDirector(state, ids, rng.fork('dismissal'))
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

  // --- 11b. Architects ------------------------------------------------------
  releaseArchitects(state)

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
  // Deleted rather than emptied: a key set to zero still costs its name in the
  // save, and nine thousand fixtures a season pay it. The score and any
  // shootout stay, because tables and cup progression read them.
  delete result.possession
  delete result.shots
  delete result.shotsOnTarget
  delete result.attendance
  delete result.summary
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
          {
            id: 'buyBack',
            label: 'Accept, with a buy-back',
            // The real trade: you take less money now for the right to bring
            // him back at a fixed price later. Offered only where it is
            // credible — nobody grants a buy-back on a thirty-year-old.
            hint: `Take ${formatMoneyShort(buyBackDiscountedFee(offer.fee))} instead, and keep the `
              + `right to buy him back for ${formatMoneyShort(buyBackAskingPrice(offer.fee))}.`,
            available: offer.player.age <= 24,
            unavailableReason: 'They will only grant one on a young player.',
          },
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
  return clubInCharge(state) ?? null
}

/** Sorted league table for a competition, exported for the UI. */
/**
 * Late enough in the season that a player with almost no minutes has genuinely
 * been frozen out rather than merely started slowly.
 */
const FREEZE_OUT_REVIEW_WEEK = 36

/**
 * Agents take a view on clients who are not playing.
 *
 * A director who signs a player and then leaves him in the stands has not
 * broken any rule, and the agent who put the deal together will price that
 * into the next one. This is the quiet cost of hoarding a squad.
 */
function reviewFrozenOutClients(state: GameState, ids: IdFactory): void {
  const club = clubInCharge(state)
  if (!club) return

  const frozen: Player[] = []
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.isAcademy || player.loanClubId) continue
    if (player.age < U21_AGE) continue
    if (player.stats.appearances > 4) continue
    if (player.injury && player.injury.weeksRemaining > 0) continue
    if (!player.agentId) continue
    adjustForPlayer(state, club.id, player, 'clientFrozenOut')
    frozen.push(player)
  }

  if (frozen.length < 2) return
  const names = frozen
    .slice()
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 4)
    .map((p) => p.knownAs)
    .join(', ')

  addInboxItem(state, ids, {
    category: 'player',
    subject: 'Agents are asking about their clients',
    from: 'Your assistant',
    body: `Several agents have been in touch about players who have barely featured this season — `
      + `${names}${frozen.length > 4 ? ' among others' : ''}. `
      + 'None of them is threatening anything. They are simply letting you know they have noticed, '
      + 'and it will be priced into the next deal you do with them.',
    link: { view: 'squad' },
  })
}

/** The week each transfer window's registration deadline falls in. */
function isRegistrationLockWeek(week: number): boolean {
  return week === 6 || week === 31
}

/**
 * Freeze every squad list for the rest of the window period.
 *
 * Clubs that never touched their list get one filled in for them; the human's
 * club keeps whatever it named and has its spare places filled, because
 * throwing away a director's choices and re-picking would be worse than doing
 * nothing at all. Anyone still without a place is barred until the window
 * reopens, and the human is told exactly who.
 */
function lockSquadRegistrations(state: GameState, ids: IdFactory): void {
  for (const club of Object.values(state.clubs)) {
    const leftOut = reconcileRegistration(state, club)
    if (club.id !== state.playerClubId) continue

    const view = squadRegistration(state, club)
    const barred = leftOut
      .slice()
      .sort((a, b) => b.currentAbility - a.currentAbility)

    const body = barred.length === 0
      ? `Your squad list is lodged: ${view.placesUsed} of ${SQUAD_LIMIT} places used, `
        + `${view.homegrown} homegrown. Everyone who needed a place has one.`
      : `Your squad list is lodged: ${view.placesUsed} of ${SQUAD_LIMIT} places used, `
        + `${view.homegrown} homegrown. Left out and unavailable until the window reopens: `
        + `${barred.map((p) => `${p.knownAs} (${p.position}, ${p.age})`).join(', ')}.`

    addInboxItem(state, ids, {
      category: 'player',
      subject: 'Squad list lodged with the league',
      from: 'Club Secretary',
      body,
      urgent: barred.length > 0,
      link: { view: 'squad' },
    })
  }
}

export function getTable(state: GameState, leagueId: ID) {
  return sortTable(state.tables[leagueId] ?? [])
}
