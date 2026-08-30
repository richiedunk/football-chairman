import { clamp, Rng } from './rng'
import { IdFactory, ID_PREFIX } from './ids'
import { NameGenerator } from './names/generator'
import { scheduleLeague } from './sim/schedule'
import { emptyTableRow } from './world/worldGen'
import { ageOneYear } from './systems/development'
import { mustRetire } from './systems/directorCareer'
import { awardSeasonPrizeMoney, negotiateSponsorship, recalculateBudgets, rollOverLedger } from './systems/finance'
import { setSeasonExpectation, setSeasonMandates, sortTable } from './systems/board'
import { awardXp, closeCareerEntry, eligibleClubs, levelFor, ordinal, seasonEndXp } from './systems/career'
import { computeValue, computeWageDemand } from './systems/valuation'
import { addInboxItem, addNews } from './systems/inbox'
import { emptyStats } from './world/playerGen'
import { cupResultFor, resetCup } from './sim/cups'
import { accrueTrainingYear, autoRegister, releaseRegistration } from './systems/registration'
import { writeOffBookValue } from './systems/finance'
import { adjustForPlayer, decayRelationships } from './systems/agents'
import {
  applyPointsDeductions, assessClub, SANCTION_LABELS, SQUAD_COST_LIMIT,
  type RegulationOutcome,
} from './systems/regulation'
import { PATIENCE_WEEKS } from './systems/aiSquad'
import {
  contractTermsFor, paySeasonBonuses, signContract, type ContractOffer,
} from './systems/directorContract'
import type { Club, GameState, ID, JobOffer, League, Player, SeasonHistory } from './types'
import { playerClub as clubInCharge } from './playerClub'

/**
 * Season rollover.
 *
 * Promotion and relegation, prize money, contract expiry, ageing, retirements,
 * a new fixture list, and — the part that matters for the meta-game — the XP
 * award and the job offers it unlocks. This is the one point in the year where
 * the whole world moves at once, so it runs as a single explicit sequence.
 */

export interface RolloverDeps {
  ids: IdFactory
  names: NameGenerator
  rng: Rng
}

export function runSeasonRollover(state: GameState, deps: RolloverDeps): void {
  const { ids, rng } = deps
  const season = state.date.season

  // --- 1. Final tables, prize money, history --------------------------------
  const finalPositions = new Map<ID, number>()

  for (const league of Object.values(state.leagues)) {
    const table = sortTable(state.tables[league.id] ?? [])
    table.forEach((row, index) => {
      const position = index + 1
      finalPositions.set(row.clubId, position)
      const club = state.clubs[row.clubId]
      if (!club) return

      const prize = awardSeasonPrizeMoney(club, league, position)
      const closed = rollOverLedger(club)

      // Judged on the books just closed, not on live figures — a rule
      // assessed against a moving number is one nobody can plan against.
      const verdict = assessClub(state, club, closed, ids)
      if (club.id === state.playerClubId) reportRegulation(state, ids, verdict)

      const domesticCup = Object.values(state.cups).find((c) => c.nationId === club.nationId)

      const history: SeasonHistory = {
        season,
        leagueId: league.id,
        leagueName: league.name,
        position,
        played: row.played,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        cupResult: domesticCup ? cupResultFor(state, domesticCup, club.id) : '—',
        continentalResult: '—',
        netSpend: closed.transfersIn - closed.transfersOut,
        finalBalance: club.finances.balance,
        headCoachName: club.headCoachId
          ? state.staff[club.headCoachId]?.knownAs ?? 'Vacant'
          : 'Vacant',
      }
      club.history.push(history)
      if (club.history.length > 40) club.history.shift()

      if (club.id === state.playerClubId) {
        addNews(state, ids, 'league',
          `Season ${season}/${(season + 1) % 100} finished ${position}${ordinal(position)} in ${league.name}. Prize money: ${prize.toLocaleString()}.`,
          null, club.id)
      }
    })
  }

  // --- 2. Director XP -------------------------------------------------------
  // Awarded before promotion is applied, so the XP reflects the division the
  // work was actually done in.
  const playerClub = clubInCharge(state)
  if (playerClub) {
    const league = state.leagues[playerClub.leagueId]
    const position = finalPositions.get(playerClub.id) ?? 20
    if (league) {
      for (const award of seasonEndXp(state, playerClub, league, position)) {
        awardXp(state.director, award.amount, award.reason, award.category, season, state.date.week)
      }
    }
    const entry = state.director.careerHistory.find(
      (e) => e.clubId === playerClub.id && e.toSeason === null,
    )
    if (entry) {
      entry.bestFinish = Math.min(entry.bestFinish, position)
      entry.xpEarned += state.director.xpThisSeason
      const trophiesWon: string[] = []
      for (const cup of Object.values(state.cups)) {
        if (cup.winnerId === playerClub.id) {
          trophiesWon.push(cup.name)
          entry.trophies.push(`${cup.name} ${season}`)
          awardXp(
            state.director, Math.round(500 * (0.5 + (league?.reputation ?? 40) / 100 * 1.5)),
            `Won the ${cup.name}`, 'trophies', season, state.date.week,
          )
        }
      }

      // Contract bonuses are paid before promotion is applied, so "promoted"
      // means promoted this season rather than "is now in a higher division".
      const promoted = league ? position <= league.promotionPlaces && league.promotionPlaces > 0 : false
      const bonuses = paySeasonBonuses(state, playerClub, position, promoted, trophiesWon)
      if (bonuses > 0) {
        addInboxItem(state, ids, {
          category: 'finance',
          subject: `Contract bonuses: ${bonuses.toLocaleString()}`,
          from: 'Your representative',
          body: 'Your performance bonuses for the season have been settled.',
          link: { view: 'career' },
        })
      }
    }
    playerClub.board.tenureSeasons += 1
  }

  // --- 3. Promotion and relegation ------------------------------------------
  applyPromotionAndRelegation(state, finalPositions)

  // --- 4. Contracts, ageing, retirement -------------------------------------
  processPlayerYearEnd(state, deps)

  // --- 4b. Academy churn ----------------------------------------------------
  releaseUnpromotedYouth(state, deps)

  // Agents drift back towards indifference between seasons. Without it a
  // single bad window follows a director for a whole career.
  decayRelationships(state)

  // --- 4c. Squad registration ----------------------------------------------
  // Lists are rebuilt from scratch each summer. Promotion, relegation, expiry
  // and retirement have all just torn through the squads, and last season's
  // list would be half made of players who no longer exist.
  for (const club of Object.values(state.clubs)) autoRegister(state, club)

  // --- 5. Club housekeeping -------------------------------------------------
  for (const club of Object.values(state.clubs)) {
    const league = state.leagues[club.leagueId]
    if (!league) continue

    // Reputation tracks results over time, so a promoted club genuinely grows
    // and a relegated one genuinely shrinks — the reason a long project pays.
    const position = finalPositions.get(club.id) ?? 10
    const clubCount = Math.max(1, league.clubIds.length)
    const performance = 1 - (position - 1) / clubCount
    const target = league.reputation * (0.75 + performance * 0.5)
    club.reputation = Math.round(clamp(club.reputation + (target - club.reputation) * 0.22, 3, 99))
    club.continentalReputation = Math.round(
      clamp(club.continentalReputation + (club.reputation - club.continentalReputation) * 0.3, 3, 99),
    )

    if (club.finances.sponsorship.expiresSeason <= season) {
      negotiateSponsorship(state, club, deps.rng.fork(`sponsor:${club.id}`))
    }

    // A new season, a fresh hearing: boards stop counting last year's asks.
    club.board.requestsThisSeason = 0
    setSeasonExpectation(state, club, league)
    setSeasonMandates(state, club)
    recalculateBudgets(state, club)
    club.board.confidence = clamp(club.board.confidence * 0.85 + 40 * 0.15, 0, 100)
  }

  // League reputation follows its member clubs, so a division that keeps
  // producing strong sides slowly becomes a stronger division.
  for (const league of Object.values(state.leagues)) {
    const clubs = league.clubIds.map((id) => state.clubs[id]).filter(Boolean) as Club[]
    if (clubs.length === 0) continue
    const avg = clubs.reduce((sum, c) => sum + c.reputation, 0) / clubs.length
    league.reputation = Math.round(clamp(league.reputation + (avg - league.reputation) * 0.15, 3, 99))
  }

  // --- 6. New season --------------------------------------------------------
  state.date.season += 1
  state.date.week = 1
  state.phase = 'preseason'

  state.fixtures = []
  for (const cup of Object.values(state.cups)) resetCup(state, cup)
  for (const league of Object.values(state.leagues)) {
    state.fixtures.push(
      ...scheduleLeague(rng.fork(`fixtures:${league.id}`), ids, league.id, league.clubIds, state.date.season),
    )
    state.tables[league.id] = league.clubIds.map((clubId) => emptyTableRow(clubId))
  }

  // Points deductions land on the fresh tables, so every screen that reads a
  // table sees them without knowing regulation exists.
  for (const { club, points } of applyPointsDeductions(state)) {
    if (club.id === state.playerClubId) {
      addInboxItem(state, ids, {
        category: 'board',
        subject: `${points}-point deduction`,
        from: 'The League',
        body: `The club begins the season on minus ${points} points following repeated breaches of the squad-cost rules. `
          + 'The board have made their view of this known.',
        urgent: true,
        link: { view: 'finance' },
      })
      club.board.confidence = clamp(club.board.confidence - 14, 0, 100)
    }
  }

  // Reset seasonal player statistics after they have been archived.
  for (const player of Object.values(state.players)) {
    player.stats = emptyStats()
    player.suspendedWeeks = 0
  }

  // --- 7. Job offers --------------------------------------------------------
  state.director.jobOffers = generateJobOffers(state, deps)
  if (state.director.jobOffers.length > 0) {
    addInboxItem(state, ids, {
      category: 'board',
      subject: `${state.director.jobOffers.length} club${state.director.jobOffers.length === 1 ? ' has' : 's have'} approached you`,
      from: 'Your representative',
      body: state.director.jobOffers
        .map((o) => `${o.clubName} (${o.leagueName}) — ${o.pitch}`)
        .join('\n\n'),
      link: { view: 'career' },
      expiresInWeeks: 4,
    })
  }

  const level = levelFor(state.director.xp)
  addInboxItem(state, ids, {
    category: 'board',
    subject: `Season review — ${state.director.xpThisSeason.toLocaleString()} XP earned`,
    from: 'Your representative',
    body: `You finished the season on ${state.director.xp.toLocaleString()} career XP, which puts you at ${level.title}. ${level.description}`,
    link: { view: 'career' },
  })

  state.director.xpThisSeason = 0
  state.director.xpLog = []
  state.director.earningsThisSeason = 0

  // --- 8. A year older -----------------------------------------------------
  //
  // After the review, so the season just finished is counted as worked at the
  // age it was worked at. The last season anyone works is the one during which
  // they turn sixty-five: they see it out, then they go.
  state.director.age += 1
  if (mustRetire(state.director)) {
    state.director.retiredAtSeason = state.date.season
    state.director.retiredBecause = 'age'
    // No offers for a man who has finished. Leaving them on the table would
    // dangle a career the rules have already ended.
    state.director.jobOffers = []
    addInboxItem(state, ids, {
      category: 'board',
      subject: `That is the end of it — you are ${state.director.age}`,
      from: 'Your representative',
      body:
        'Nobody works past sixty-five in this game, and there are no exceptions '
        + 'made — not for you and not for anyone.\n\n'
        + 'Your record is on the career screen. It is the only part of the job '
        + 'that outlasts it.',
      link: { view: 'career' },
    })
  }
}

// ---------------------------------------------------------------------------

function applyPromotionAndRelegation(state: GameState, positions: Map<ID, number>): void {
  const byNation = new Map<ID, League[]>()
  for (const league of Object.values(state.leagues)) {
    const list = byNation.get(league.nationId) ?? []
    list.push(league)
    byNation.set(league.nationId, list)
  }

  for (const leagues of byNation.values()) {
    leagues.sort((a, b) => a.tier - b.tier)

    for (let i = 0; i < leagues.length - 1; i++) {
      const upper = leagues[i]
      const lower = leagues[i + 1]

      const upperTable = sortTable(state.tables[upper.id] ?? [])
      const lowerTable = sortTable(state.tables[lower.id] ?? [])
      if (upperTable.length === 0 || lowerTable.length === 0) continue

      const relegated = upperTable.slice(-upper.relegationPlaces).map((r) => r.clubId)

      // Automatic promotion, then the play-off places. The play-off is
      // resolved as a weighted draw rather than simulated, since a full
      // play-off bracket for every division in the world is a lot of matches
      // nobody watches — but it is weighted by finishing position, so the
      // team that finished third usually goes up.
      const autoPromoted = lowerTable.slice(0, lower.promotionPlaces).map((r) => r.clubId)
      const playoffContenders = lowerTable
        .slice(lower.promotionPlaces, lower.promotionPlaces + lower.playoffPlaces)
        .map((r) => r.clubId)

      const promoted = [...autoPromoted]
      if (playoffContenders.length > 0 && relegated.length > autoPromoted.length) {
        const seed = playoffContenders.join(':')
        const playoffRng = new Rng(`playoff:${upper.id}:${seed}`)
        const winner = playoffRng.weighted(
          playoffContenders,
          playoffContenders.map((_, index) => playoffContenders.length - index),
        )
        promoted.push(winner)
      }

      const swapCount = Math.min(relegated.length, promoted.length)
      for (let s = 0; s < swapCount; s++) {
        moveClub(state, relegated[s], lower)
        moveClub(state, promoted[s], upper)
      }
    }
  }

  // Rebuild league membership from the clubs themselves so the two never drift.
  for (const league of Object.values(state.leagues)) league.clubIds = []
  for (const club of Object.values(state.clubs)) {
    const league = state.leagues[club.leagueId]
    if (league) league.clubIds.push(club.id)
  }

  void positions
}

function moveClub(state: GameState, clubId: ID, toLeague: League): void {
  const club = state.clubs[clubId]
  if (!club) return
  const fromLeague = state.leagues[club.leagueId]
  club.leagueId = toLeague.id

  if (club.id === state.playerClubId && fromLeague) {
    const direction = toLeague.tier < fromLeague.tier ? 'promoted to' : 'relegated to'
    // Filed under the division they are joining: that is where a reader
    // looking at next season's table wants to find it.
    addNews(state, new IdFactory(state.nextId), 'league',
      `${club.name} have been ${direction} ${toLeague.name}.`, null, club.id)
  }
}

/** Contract expiry, ageing, development recalibration and retirement. */
function processPlayerYearEnd(state: GameState, deps: RolloverDeps): void {
  const { rng, ids } = deps
  const season = state.date.season
  const retiring: Player[] = []

  for (const player of Object.values(state.players)) {
    // Self-healing invariant: an academy player always belongs to a club.
    // Anything else is invisible to every system that manages players, so it
    // is cleaned up here rather than left to accumulate — this also repairs
    // saves made before the expiry path was fixed.
    if (player.isAcademy && !player.clubId) {
      delete state.players[player.id]
      continue
    }

    // Contracts that ran out. The player leaves for nothing, which is the
    // whole reason the renewals screen exists.
    if (player.contract && player.contract.expiresSeason <= season) {
      const club = player.clubId ? state.clubs[player.clubId] : null
      const borrower = player.loanClubId ? state.clubs[player.loanClubId] : null
      if (borrower) borrower.loanedIn = borrower.loanedIn.filter((id) => id !== player.id)

      // An academy player whose deal runs out is released, not turned into a
      // free agent who happens to still be marked as somebody's youth player.
      //
      // Leaving him marked academy with no club made him invisible to every
      // system in the game: the academy churn pass only looks inside squads,
      // the free-agent pass skips anyone marked academy so his weeks-without-a-
      // club never ticked up, and retirement never reached him because it is
      // driven by that counter. They accumulated for ever — 2,378 of them by
      // season twelve, more than a fifth of the world's players, none of whom
      // could be signed, released or retired by anything.
      if (player.isAcademy) {
        if (club) club.squad = club.squad.filter((id) => id !== player.id)
        if (rng.chance(0.25)) {
          // A handful drop into the free-agent pool and go on to have careers
          // lower down, which is also true to life.
          player.isAcademy = false
          player.clubId = null
          player.contract = null
          player.value = 0
        } else {
          delete state.players[player.id]
        }
        continue
      }

      if (club) {
        club.squad = club.squad.filter((id) => id !== player.id)
        if (club.id === state.playerClubId) {
          addInboxItem(state, ids, {
            category: 'player',
            subject: `${player.knownAs} has left`,
            from: 'Club Secretary',
            body: `${player.knownAs}'s contract expired and he has left the club on a free transfer.`,
            link: { view: 'squad' },
          })
        }
      }
      // Anything left of his fee is written off. A player allowed to run his
      // contract down has usually been fully written down by then, which is
      // exactly why letting one go for nothing costs nothing in the books
      // even though it costs everything on the pitch.
      writeOffBookValue(state, player)
      // His agent notices, and remembers. Letting a client walk for nothing is
      // the cheapest thing a director can do at the time and one of the
      // dearest afterwards.
      if (club) adjustForPlayer(state, club.id, player, 'clientRanDownContract')
      player.clubId = null
      player.contract = null
      player.loanClubId = null
      player.value = 0
    }

    // Loans expire and the player goes back. The borrowing club must be told
    // to release him, or he stays on their team sheet for ever.
    if (player.loanUntilSeason !== null && player.loanUntilSeason <= season) {
      const borrower = player.loanClubId ? state.clubs[player.loanClubId] : null
      if (borrower) {
        borrower.loanedIn = borrower.loanedIn.filter((id) => id !== player.id)
        if (borrower.id === state.playerClubId) {
          addInboxItem(state, ids, {
            category: 'player',
            subject: `${player.knownAs} returns to his parent club`,
            from: 'Club Secretary',
            body: `${player.knownAs}'s loan has ended and he has gone back to ${state.clubs[player.clubId ?? '']?.name ?? 'his club'}.`,
            link: { view: 'squad' },
          })
        }
      }
      player.loanClubId = null
      player.loanUntilSeason = null
      player.loanWageShare = 0
    }

    // Credited before the birthday, so a season played at twenty counts as a
    // year under 21 — which is how the association actually counts it.
    accrueTrainingYear(state, player)

    ageOneYear(player)

    // Retirement. Driven by age and by how far a player has fallen — a
    // 34-year-old still playing at a high level carries on; one who has
    // dropped out of the side does not.
    const retirementChance = retirementProbability(player)
    if (rng.chance(retirementChance)) {
      retiring.push(player)
      continue
    }

    // Career stats archive.
    if (player.stats.appearances > 0) {
      const club = player.clubId ? state.clubs[player.clubId] : null
      player.careerStats.push({
        ...player.stats,
        season,
        clubId: club?.id ?? '',
        clubName: club?.name ?? 'Free agent',
        leagueName: club ? state.leagues[club.leagueId]?.name ?? '' : '',
      })
      if (player.careerStats.length > 25) player.careerStats.shift()
    }

    // Revalue in the new season's context.
    const club = player.clubId ? state.clubs[player.clubId] : null
    const league = club ? state.leagues[club.leagueId] : null
    const nation = club ? state.nations[club.nationId] : state.nations[player.nationalityId]
    player.value = computeValue(player, league, nation ?? null, season + 1)
    player.wageDemand = computeWageDemand(player, league, nation ?? null)
  }

  for (const player of retiring) {
    writeOffBookValue(state, player)
    const club = player.clubId ? state.clubs[player.clubId] : null
    if (club) {
      club.squad = club.squad.filter((id) => id !== player.id)
      releaseRegistration(club, player.id)
      if (club.id === state.playerClubId) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `${player.knownAs} retires`,
          from: 'Club Secretary',
          body: `${player.knownAs} has announced his retirement at the age of ${player.age}. `
            + `${retirementReason(player, rng)}`,
          link: { view: 'squad' },
        })
      }
    }
    delete state.players[player.id]
  }
}

/**
 * Why a player stopped.
 *
 * Not everyone plays until nobody will have them. Players leave for coaching
 * badges, a job at the club, a studio, an injury that never quite cleared, or
 * because they have had enough of living out of a suitcase. It is flavour, but
 * it is the flavour that makes a squad list read like people rather than rows,
 * and it is what an academy graduate's story should be able to end with.
 */
function retirementReason(player: Player, rng: Rng): string {
  const name = player.knownAs
  const options: string[] = [
    `He is taking his coaching badges and hopes to stay in the game.`,
    `He has been offered a role in the academy and intends to take it.`,
    `He says he wants to be at home while his children are still young.`,
    `He is joining a broadcaster as a pundit from next season.`,
    `His body has not been right for two years and he has stopped pretending otherwise.`,
    `He is going into business back in his home town.`,
    `He goes with no plans beyond a long holiday.`,
    `He has taken a scouting job and will be at grounds most weekends anyway.`,
  ]

  // A player still going strong who stops is doing it for a reason worth
  // reading; one whose legs went does not need explaining.
  if (player.age >= 36) {
    options.push(`Nobody expected ${name} to last this long, and he outlasted most of them.`)
  }
  if (player.currentAbility > 140) {
    options.push(`He leaves as one of the better players of his generation.`)
  }
  if (!player.clubId) {
    options.push(`He had been without a club since last season and has decided to stop waiting.`)
  }

  return rng.pick(options)
}

/**
 * Academy players who were never promoted are released when they age out.
 *
 * Without this, every club in the world accumulates a permanent, growing pool
 * of teenagers who can never play: the world gained several thousand players
 * per season, save size ballooned, and the weekly tick got slower every year.
 * Real academies release the overwhelming majority of their intake.
 */
function releaseUnpromotedYouth(state: GameState, deps: RolloverDeps): void {
  const { rng, ids } = deps

  for (const club of Object.values(state.clubs)) {
    const academy = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && p.isAcademy)

    for (const player of academy) {
      // Under 19s stay; nobody gives up on a 17-year-old.
      if (player.age < 19) continue

      // The genuinely promising are kept on and pushed into the senior squad
      // rather than released — that is the point of running an academy.
      const promising = player.potentialAbility >= 100 + club.reputation * 0.5
      if (promising && player.age <= 20) continue

      if (promising) {
        player.isAcademy = false
        player.squadStatus = 'prospect'
        player.desiredStatus = 'prospect'
        if (club.id === state.playerClubId) {
          addInboxItem(state, ids, {
            category: 'academy',
            subject: `${player.knownAs} promoted to the senior squad`,
            from: 'Academy Director',
            body: `${player.knownAs} has aged out of the academy and been given a professional contract. He is one to watch.`,
            link: { view: 'player', id: player.id },
          })
        }
        continue
      }

      // Everyone else is released. A handful drop into the free-agent pool and
      // go on to have careers lower down, which is also true to life.
      club.squad = club.squad.filter((id) => id !== player.id)
      if (rng.chance(0.25)) {
        player.clubId = null
        player.contract = null
        player.isAcademy = false
        player.value = 0
      } else {
        delete state.players[player.id]
      }
    }
  }
}

/**
 * The chance a player stops playing at the end of this season.
 *
 * Exported so the rules can be checked directly: the alternative is asserting
 * on the outcome of a seeded roll, which tests the dice rather than the rule.
 */
export function retirementProbability(player: Player): number {
  // Nobody has called in two years. He is not waiting by the phone any more,
  // whatever his age — and without this the free-agent pool only ever grows.
  if (!player.clubId && player.weeksUnattached >= PATIENCE_WEEKS) return 0.7

  // Players do not only stop when their legs go. Some take a coaching job, or
  // a job at the club, or a seat in a studio; some never get right after an
  // injury; some have simply had enough of it. It is a small hazard, but
  // without it every career in the world ends the same way.
  if (player.age < 31) {
    if (player.age < 27) return 0
    let early = 0.012
    // A player who is not getting a game has less to turn down.
    if (player.stats.appearances < 6) early *= 2.4
    // A body that keeps breaking down makes the decision for him.
    if (player.injuryProneness > 65) early *= 1.8
    return early
  }

  const base = (player.age - 30) * 0.09
  // A player still good enough for his level carries on longer.
  const qualityFactor = clamp(1.4 - player.currentAbility / 140, 0.4, 1.6)
  const gameTime = player.stats.appearances >= 12 ? 0.55 : 1.3
  // An older player without a club is a season closer to stopping than one
  // still on somebody's books.
  const unattached = player.clubId ? 1 : 1.5
  return clamp(base * qualityFactor * gameTime * unattached, 0, 0.95)
}

/**
 * Job offers at the end of a season.
 *
 * Gated on career level, so the pyramid can only be climbed by earning it.
 * Offers come from clubs that are both within your band and plausibly
 * interested — a club does not approach a director whose season was a disaster.
 */
function generateJobOffers(state: GameState, deps: RolloverDeps): JobOffer[] {
  const { rng, ids } = deps
  const currentClub = clubInCharge(state)
  if (!currentClub) return []

  const level = levelFor(state.director.xp)
  const candidates = eligibleClubs(state, state.director).filter((club) => {
    if (club.id === currentClub.id) return false
    // Only clubs meaningfully bigger than your current one are worth showing —
    // a lateral move is not a career step, and the list would be enormous.
    if (club.reputation <= currentClub.reputation + 3) return false
    return true
  })

  if (candidates.length === 0) return []

  // How many clubs come calling depends on how the season went relative to
  // what was expected of you.
  const lastSeason = currentClub.history[currentClub.history.length - 1]
  const overperformance = lastSeason
    ? currentClub.board.expectation.leaguePosition - lastSeason.position
    : 0
  const offerCount = clamp(
    Math.round(rng.normal(overperformance * 0.5, 1)),
    0,
    3,
  )
  if (offerCount === 0) return []

  const chosen = rng.sample(
    candidates.sort((a, b) => b.reputation - a.reputation).slice(0, 12),
    offerCount,
  )

  return chosen.map((club) => {
    const league = state.leagues[club.leagueId]
    const offer: JobOffer = {
      id: ids.next(ID_PREFIX.inbox),
      clubId: club.id,
      clubName: club.name,
      leagueName: league?.name ?? 'Unknown',
      clubReputation: club.reputation,
      expectation: { ...club.board.expectation },
      wageOffer: Math.round(Math.pow(club.reputation / 50, 2.4) * 3_200),
      transferBudgetOffer: club.finances.transferBudget,
      expiresWeek: 6,
      expiresSeason: state.date.season,
      pitch: writePitch(club, level.title, overperformance),
    }
    return offer
  })
}

/**
 * Tell the director what the regulator decided, and why.
 *
 * The itemised breakdown matters more than the verdict. A club told only that
 * it failed learns nothing it can act on; a club shown that two thirds of the
 * problem is amortisation on three signings knows to stop signing people.
 */
function reportRegulation(
  state: GameState,
  ids: IdFactory,
  outcome: RegulationOutcome,
): void {
  const { assessment, imposed } = outcome
  if (!assessment.inBreach && imposed.length === 0) {
    if (assessment.ratio > SQUAD_COST_LIMIT * 0.92 && Number.isFinite(assessment.ratio)) {
      addNews(state, ids, 'finance',
        `Squad costs finished at ${Math.round(assessment.ratio * 100)}% of income — inside the limit, but not by much.`,
        { view: 'finance' })
    }
    return
  }

  const costs = assessment.components.filter((c) => !c.income && c.amount > 0)
  const breakdown = costs
    .sort((a, b) => b.amount - a.amount)
    .map((c) => `${c.label} ${Math.round(c.amount).toLocaleString()}`)
    .join(', ')

  const penalties = imposed.length > 0
    ? imposed.map((s) => (s.kind === 'fine'
      ? `${SANCTION_LABELS[s.kind]} of ${s.amount.toLocaleString()}`
      : s.kind === 'pointsDeduction'
        ? `${s.amount}-point deduction, applied next season`
        : SANCTION_LABELS[s.kind])).join('. ')
    : 'No sanction this time.'

  addInboxItem(state, ids, {
    category: 'finance',
    subject: `Squad-cost assessment: ${Math.round(assessment.ratio * 100)}% of income`,
    from: 'The League',
    body: `Squad costs of ${Math.round(assessment.squadCost).toLocaleString()} against relevant income of `
      + `${Math.round(assessment.relevantIncome).toLocaleString()}, a ratio of `
      + `${Math.round(assessment.ratio * 100)}% against a limit of ${Math.round(SQUAD_COST_LIMIT * 100)}%. `
      + `Made up of: ${breakdown}. ${penalties}`,
    urgent: true,
    link: { view: 'finance' },
  })
}

function writePitch(club: Club, levelTitle: string, overperformance: number): string {
  if (overperformance > 3) {
    return `${club.name} have been watching what you did last season and want you to do the same for them. They see a ${levelTitle.toLowerCase()} director who over-delivers.`
  }
  if (club.finances.inCrisis) {
    return `${club.name} are in trouble and need someone who can trade their way out of it. It is not a glamorous job, but it is a bigger one.`
  }
  return `${club.name} are looking for a director of football to take charge of recruitment and squad planning. They think you are ready for the step up.`
}

/** Accept a job offer: leave the current club and take over the new one. */
export function acceptJobOffer(
  state: GameState,
  offerId: ID,
  contract?: ContractOffer,
): { ok: boolean; message: string } {
  const offer = state.director.jobOffers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, message: 'That offer is no longer available.' }
  // The UI does not offer a barred post, but the rule belongs here rather than
  // in a template: a listing you cannot apply for must be un-takeable however
  // the call arrives.
  if (offer.barred) {
    return { ok: false, message: offer.barredReason ?? 'They will not consider you.' }
  }
  const newClub = state.clubs[offer.clubId]
  if (!newClub) return { ok: false, message: 'That club no longer exists.' }

  const oldClub = clubInCharge(state)
  if (oldClub) {
    oldClub.isPlayerClub = false
    closeCareerEntry(state.director, oldClub.id, state.date.season, 'Left for another club')
  }

  state.playerClubId = newClub.id
  newClub.isPlayerClub = true
  newClub.board.tenureSeasons = 0
  newClub.board.warnings = 0
  state.director.jobOffers = []
  state.director.careerHistory.push({
    clubId: newClub.id,
    clubName: newClub.name,
    fromSeason: state.date.season,
    toSeason: null,
    outcome: 'In post',
    bestFinish: 99,
    trophies: [],
    netSpend: 0,
    xpEarned: 0,
  })

  // A new club means a clean scouting slate — the reports belonged to the
  // previous employer's recruitment department, not to you.
  state.scoutReports = {}
  state.shortlist = []
  state.negotiations = []

  signContract(state, newClub, contract ?? contractTermsFor(state, newClub, state.director).opening)

  return { ok: true, message: `You are now director of football at ${newClub.name}.` }
}
