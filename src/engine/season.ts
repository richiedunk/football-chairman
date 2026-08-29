import { clamp, Rng } from './rng'
import { IdFactory, ID_PREFIX } from './ids'
import { NameGenerator } from './names/generator'
import { scheduleLeague } from './sim/schedule'
import { emptyTableRow } from './world/worldGen'
import { ageOneYear } from './systems/development'
import { awardSeasonPrizeMoney, negotiateSponsorship, recalculateBudgets, rollOverLedger } from './systems/finance'
import { setSeasonExpectation, setSeasonMandates, sortTable } from './systems/board'
import { awardXp, closeCareerEntry, eligibleClubs, levelFor, ordinal, seasonEndXp } from './systems/career'
import { computeValue, computeWageDemand } from './systems/valuation'
import { addInboxItem, addNews } from './systems/inbox'
import { emptyStats } from './world/playerGen'
import { cupResultFor, resetCup } from './sim/cups'
import { accrueTrainingYear, autoRegister } from './systems/registration'
import {
  contractTermsFor, paySeasonBonuses, signContract, type ContractOffer,
} from './systems/directorContract'
import type { Club, GameState, ID, JobOffer, League, Player, SeasonHistory } from './types'

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
          `Season ${season}/${(season + 1) % 100} finished ${position}${ordinal(position)} in ${league.name}. Prize money: ${prize.toLocaleString()}.`)
      }
    })
  }

  // --- 2. Director XP -------------------------------------------------------
  // Awarded before promotion is applied, so the XP reflects the division the
  // work was actually done in.
  const playerClub = state.clubs[state.playerClubId]
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
    addNews(state, new IdFactory(state.nextId), 'league', `${club.name} have been ${direction} ${toLeague.name}.`)
  }
}

/** Contract expiry, ageing, development recalibration and retirement. */
function processPlayerYearEnd(state: GameState, deps: RolloverDeps): void {
  const { rng, ids } = deps
  const season = state.date.season
  const retiring: Player[] = []

  for (const player of Object.values(state.players)) {
    // Contracts that ran out. The player leaves for nothing, which is the
    // whole reason the renewals screen exists.
    if (player.contract && player.contract.expiresSeason <= season) {
      const club = player.clubId ? state.clubs[player.clubId] : null
      const borrower = player.loanClubId ? state.clubs[player.loanClubId] : null
      if (borrower) borrower.loanedIn = borrower.loanedIn.filter((id) => id !== player.id)
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
    const club = player.clubId ? state.clubs[player.clubId] : null
    if (club) {
      club.squad = club.squad.filter((id) => id !== player.id)
      if (club.id === state.playerClubId) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `${player.knownAs} retires`,
          from: 'Club Secretary',
          body: `${player.knownAs} has announced his retirement at the age of ${player.age}.`,
          link: { view: 'squad' },
        })
      }
    }
    delete state.players[player.id]
  }
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

function retirementProbability(player: Player): number {
  if (player.age < 31) return 0
  const base = (player.age - 30) * 0.09
  // A player still good enough for his level carries on longer.
  const qualityFactor = clamp(1.4 - player.currentAbility / 140, 0.4, 1.6)
  const gameTime = player.stats.appearances >= 12 ? 0.55 : 1.3
  return clamp(base * qualityFactor * gameTime, 0, 0.95)
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
  const currentClub = state.clubs[state.playerClubId]
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
  const newClub = state.clubs[offer.clubId]
  if (!newClub) return { ok: false, message: 'That club no longer exists.' }

  const oldClub = state.clubs[state.playerClubId]
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
