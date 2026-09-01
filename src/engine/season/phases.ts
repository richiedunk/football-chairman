import { clamp } from '../rng'
import { scheduleLeague } from '../sim/schedule'
import { emptyTableRow } from '../world/worldGen'
import { mustRetire } from '../systems/directorCareer'
import { awardSeasonPrizeMoney, negotiateSponsorship, recalculateBudgets, rollOverLedger } from '../systems/finance'
import { setSeasonExpectation, setSeasonMandates, sortTable } from '../systems/board'
import { awardXp, levelFor, ordinal, seasonEndXp } from '../systems/career'
import { addInboxItem, addNews } from '../systems/inbox'
import { emptyStats } from '../world/playerGen'
import { cupResultFor, resetCup } from '../sim/cups'
import { continentalResultFor, refreshContinentalEntrants } from '../systems/continental'
import { clauseUpside, clausesHeldBy } from '../systems/buyBack'
import { TOURNAMENT_STOCK_DECAY } from '../systems/international'
import { autoRegister } from '../systems/registration'
import { decayRelationships } from '../systems/agents'
import { applyPointsDeductions, assessClub } from '../systems/regulation'
import { paySeasonBonuses } from '../systems/directorContract'
import { playerClub as clubInCharge } from '../playerClub'
import { phase } from './context'
import { applyPromotionAndRelegation, generateJobOffers, processPlayerYearEnd, releaseUnpromotedYouth, reportRegulation } from './work'
import type { Club, ID, SeasonHistory } from '../types'

/**
 * The season roll, phase by phase.
 *
 * The one point in the year where the whole world moves at once, and the
 * ordering carries more weight than anywhere else in the engine: prize money
 * is judged on a ledger that is about to close, XP on a division a club is
 * about to leave, and continental places on tables that are about to be wiped.
 * All of that used to be comments in one two-hundred-and-ninety-line
 * procedure. It is a manifest and a set of declared reads now, for the same
 * reasons set out in `../phases.ts`.
 */

/**
 * The two things the rest of the roll asks about.
 *
 * `playerClub` is read at three points below and was three separate lookups.
 * Nothing dismisses a director inside the roll, so unlike the weekly tick this
 * one genuinely cannot change — but reading it once and declaring it says that,
 * where three identical calls said nothing either way.
 */
export const openTheRoll = phase({
  name: 'openTheRoll',
  writes: ['playerClub'],
  run({ state, facts }) {
    facts.playerClub = clubInCharge(state)
  },
})

/**
 * Close the books: final tables, prize money, the regulator's verdict, and a
 * season written into every club's history.
 *
 * First, and it has to be. Prize money is judged on the ledger this closes, the
 * regulator is judged on the books just shut rather than on live figures — a
 * rule assessed against a moving number is one nobody can plan against — and the
 * continental line of the history is read before the entrants are re-drawn for
 * next season, which happens in `newSeason` below.
 */
export const finalTables = phase({
  name: 'finalTables',
  // Reads as well as writes: it builds the map, then fills it as it goes.
  reads: ['finalPositions'],
  writes: ['finalPositions'],
  run({ state, ids, season, facts }) {
    facts.finalPositions = new Map<ID, number>()
    const finalPositions = facts.finalPositions

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
          // Read before the entrants are re-drawn for next season, which is why
          // the history is written in step 1 and the refresh happens in step 6.
          continentalResult: continentalResultFor(state, club.id),
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
  },
})

/**
 * What the season was worth to the director.
 *
 * Before promotion is applied, deliberately: the XP and the bonuses should
 * reflect the division the work was actually done in, and "promoted" should mean
 * promoted this season rather than "is now in a higher division". That ordering
 * was a comment; it is a declared read of `finalPositions` and a position in the
 * manifest now.
 */
export const directorXp = phase({
  name: 'directorXp',
  reads: ['finalPositions', 'playerClub'],
  run({ state, ids, season, facts }) {
    const { finalPositions, playerClub } = facts
    // Awarded before promotion is applied, so the XP reflects the division the
    // work was actually done in.

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
  },
})

export const promotionAndRelegation = phase({
  name: 'promotionAndRelegation',
  reads: ['finalPositions'],
  run({ state, facts }) {
    const { finalPositions } = facts
    applyPromotionAndRelegation(state, finalPositions)
  },
})

export const playerYearEnd = phase({
  name: 'playerYearEnd',
  run({ state, deps }) {
    processPlayerYearEnd(state, deps)
  },
})

export const academyChurn = phase({
  name: 'academyChurn',
  run({ state, deps }) {
    releaseUnpromotedYouth(state, deps)

    // Agents drift back towards indifference between seasons. Without it a
    // single bad window follows a director for a whole career.
    decayRelationships(state)
  },
})

export const squadRegistration = phase({
  name: 'squadRegistration',
  run({ state }) {
    // Lists are rebuilt from scratch each summer. Promotion, relegation, expiry
    // and retirement have all just torn through the squads, and last season's
    // list would be half made of players who no longer exist.
    for (const club of Object.values(state.clubs)) autoRegister(state, club)
  },
})

export const internationalReset = phase({
  name: 'internationalReset',
  run({ state }) {
    // Duty flags are week numbers against a clock that has just gone back to
    // one, so a player left flagged would be away from his club for the whole of
    // next season. The tournament premium decays here too: a year is roughly how
    // long the market remembers a good summer, and a club that did not sell in
    // that window finds the number gone — which is the cruellest honest thing in
    // this market and happens every other year.
    for (const player of Object.values(state.players)) {
      player.internationalUntilWeek = null
      if (player.tournamentStock) {
        const remaining = player.tournamentStock * TOURNAMENT_STOCK_DECAY
        player.tournamentStock = remaining < 0.01 ? 0 : remaining
      }
    }
  },
})

export const clubHousekeeping = phase({
  name: 'clubHousekeeping',
  reads: ['finalPositions'],
  run({ state, deps, season, facts }) {
    const { finalPositions } = facts
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
  },
})

export const leagueReputation = phase({
  name: 'leagueReputation',
  run({ state }) {
    // League reputation follows its member clubs, so a division that keeps
    // producing strong sides slowly becomes a stronger division.
    for (const league of Object.values(state.leagues)) {
      const clubs = league.clubIds.map((id) => state.clubs[id]).filter(Boolean) as Club[]
      if (clubs.length === 0) continue
      const avg = clubs.reduce((sum, c) => sum + c.reputation, 0) / clubs.length
      league.reputation = Math.round(clamp(league.reputation + (avg - league.reputation) * 0.15, 3, 99))
    }
  },
})

/**
 * The year turns.
 *
 * The fixture list, the cups, empty tables, and the points deductions that land
 * on them. `refreshContinentalEntrants` runs here rather than earlier because it
 * is decided by the tables that have just been closed — and it has to run before
 * those tables are wiped, which is two lines below it.
 */
export const newSeason = phase({
  name: 'newSeason',
  run({ state, ids, rng }) {
    state.date.season += 1
    state.date.week = 1
    state.phase = 'preseason'

    state.fixtures = []
    // Who is in Europe next season is decided by the tables that have just been
    // closed, so this runs before `resetCup` reads the field — and before the
    // tables below are wiped for the new season.
    refreshContinentalEntrants(state)
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
  },
})

export const buyBacks = phase({
  name: 'buyBacks',
  reads: ['playerClub'],
  run({ state, ids, facts }) {
    const { playerClub } = facts
    // Buy-backs that have just opened, and ones that have just gone.
    //
    // Both are worth a message and the second one more than the first: a clause
    // that lapses unexercised is the regret the mechanism exists to create, and
    // it should not happen quietly.
    const owner = playerClub
    if (owner) {
      for (const player of clausesHeldBy(state, owner.id)) {
        const clause = player.buyBack
        if (!clause) continue
        if (clause.fromSeason === state.date.season) {
          const upside = clauseUpside(player)
          addInboxItem(state, ids, {
            category: 'transfer',
            subject: `Your buy-back on ${player.knownAs} is live`,
            from: 'Recruitment',
            body: `We sold ${player.knownAs} to ${state.clubs[player.clubId ?? '']?.name ?? 'another club'} `
              + `for ${clause.soldFor.toLocaleString()} and kept the right to bring him back for `
              + `${clause.price.toLocaleString()}. He is valued at ${player.value.toLocaleString()} now. `
              + (upside > 0
                ? `That is ${upside.toLocaleString()} of value for nothing but the fee and the squad place.`
                : 'He has not kicked on the way we hoped, so the right is not worth much today.')
              + ` It runs until the end of ${clause.untilSeason}.`,
            link: { view: 'player', id: player.id },
          })
        } else if (clause.untilSeason < state.date.season) {
          addInboxItem(state, ids, {
            category: 'transfer',
            subject: `The buy-back on ${player.knownAs} has lapsed`,
            from: 'Recruitment',
            body: `Our right to buy ${player.knownAs} back for ${clause.price.toLocaleString()} `
              + `expired at the end of last season. He is valued at ${player.value.toLocaleString()}.`,
            link: { view: 'player', id: player.id },
          })
          player.buyBack = null
        }
      }
    }

    // Everyone else's lapse quietly, but they do lapse — a clause nothing ever
    // clears is a right that lasts for ever.
    for (const player of Object.values(state.players)) {
      if (player.buyBack && player.buyBack.untilSeason < state.date.season) player.buyBack = null
    }
  },
})

export const jobOffers = phase({
  name: 'jobOffers',
  run({ state, ids, deps }) {
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
  },
})

/**
 * After the review, so the season just finished is counted as worked at the age
 * it was worked at. The last season anyone works is the one during which they
 * turn sixty-five: they see it out, then they go.
 */
export const aYearOlder = phase({
  name: 'aYearOlder',
  run({ state, ids }) {
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
  },
})
