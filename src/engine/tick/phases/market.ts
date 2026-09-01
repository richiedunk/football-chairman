
import { IdFactory } from '../../ids'
import { Rng } from '../../rng'
import { buyBackAskingPrice, buyBackDiscountedFee } from '../../systems/buyBack'
import { computeValue } from '../../systems/valuation'
import {
  generateIncomingOffers, processAiTransfers, processNegotiations,
} from '../../systems/transfers'
import { runAiSquadManagement } from '../../systems/aiSquad'
import { processScouting } from '../../systems/scouting'
import { processTakeovers } from '../../systems/takeovers'
import {
  generateDeadlineBids, isDeadlineWeek, runWorldDeadline,
} from '../../systems/deadlineDay'
import {
  reconcileRegistration, squadRegistration, SQUAD_LIMIT, U21_AGE,
} from '../../systems/registration'
import { adjustForPlayer } from '../../systems/agents'
import { addInboxItem, addNews } from '../../systems/inbox'
import { playerClub as clubInCharge } from '../../playerClub'
import { phase } from '../context'
import type { Club, GameState, ID, Player } from '../../types'

/**
 * The market.
 *
 * Prices, negotiations, the window, and the paperwork that follows it.
 *
 * Valuation runs first and everything else quotes what it produced, so a
 * squad screen, a scout report and a live negotiation cannot show three
 * different numbers for the same player in the same week. As with the club
 * week, only what the player can see a price for is revalued weekly; the rest
 * of the world is on a rotation well inside the rate at which values actually
 * move.
 */

export const valuations = phase({
  name: 'valuations',
  reads: ['inRotation'],
  run({ state, facts }) {
    const { inRotation } = facts
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
  },
})

export const transfers = phase({
  name: 'transfers',
  run({ state, ids, rng }) {
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
  },
})

export const registrationLock = phase({
  name: 'registrationLock',
  run({ state, ids, week }) {
    // The week after a window shuts, every list in the world is tidied and then
    // frozen. Reconciling rather than rebuilding matters: the human's choices
    // survive, and only the empty places get filled.
    if (isRegistrationLockWeek(week)) lockSquadRegistrations(state, ids)
  },
})

export const deadlineDay = phase({
  name: 'deadlineDay',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    // The last week of a window runs at a different speed: bids arrive with an
    // answer wanted now, and the clubs that would not discuss a price in July
    // become reasonable about it.
    if (isDeadlineWeek(week)) {
      const deadlineRng = rng.fork('deadline')
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
  },
})

export const takeovers = phase({
  name: 'takeovers',
  run({ state, ids, names, rng }) {
    // Approaches, due diligence and completions, everywhere in the world. A
    // rival being bought changes the division underneath a plan you made in
    // good faith, which is the point of running it worldwide.
    processTakeovers(state, ids, rng.fork('takeovers'), names)
  },
})

export const frozenOutClients = phase({
  name: 'frozenOutClients',
  run({ state, ids, week }) {
    // Checked once, late enough in the season for "he is not playing" to mean
    // something, and only for the human's club — nobody is keeping score of how
    // two AI clubs treat each other's clients.
    if (week === FREEZE_OUT_REVIEW_WEEK) reviewFrozenOutClients(state, ids)
  },
})

export const scouting = phase({
  name: 'scouting',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
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
  },
})

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
function playerClubForPricing(state: GameState): Club | null {
  return clubInCharge(state) ?? null
}
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
