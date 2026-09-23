
import { IdFactory } from '../../ids'
import { Rng } from '../../rng'
import { buyBackAskingPrice, buyBackDiscountedFee } from '../../systems/buyBack'
import { computeValue } from '../../systems/valuation'
import {
  generateIncomingOffers, processAiTransfers, processNegotiations,
} from '../../systems/transfers'
import { runAiSquadManagement } from '../../systems/aiSquad'
import { processScouting } from '../../systems/scouting'
import { scoutPitch } from '../../systems/scoutVoice'
import { processTakeovers } from '../../systems/takeovers'
import {
  generateDeadlineBids, isDeadlineWeek, runWorldDeadline,
} from '../../systems/deadlineDay'
import {
  reconcileRegistration, squadRegistration, SQUAD_LIMIT, U21_AGE,
} from '../../systems/registration'
import { adjustForPlayer } from '../../systems/agents'
import { addInboxItem, addNews } from '../../systems/inbox'
import { contact, phrase } from '../../systems/voice'
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

    const revalue = (player: Player): void => {
      const club = player.clubId ? state.clubs[player.clubId] : null
      const league = club ? state.leagues[club.leagueId] : null
      const nation = club ? state.nations[club.nationId] : state.nations[player.nationalityId]
      player.value = computeValue(player, league, nation ?? null, state.date.season)
    }

    // The price-critical set first, because it is the one that can contain a
    // player with no club — a shortlisted free agent still needs a price — and
    // so cannot be reached through any club's squad.
    for (const id of priceCritical) {
      const player = state.players[id]
      if (player) revalue(player)
    }

    // Then the rotation, through `club.squad` rather than by scanning every
    // player in the world to skip seven eighths of them. Measured on a standard
    // world: 10.28ms to find 2,829 players by scanning, 0.46ms this way, for
    // the same 2,829. `computeValue` draws no randomness, so this changes the
    // order things are computed in and nothing about what they come to.
    for (const club of Object.values(state.clubs)) {
      if (!inRotation(club, 8)) continue
      for (const id of club.squad) {
        if (priceCritical.has(id)) continue // already done above
        const player = state.players[id]
        if (player) revalue(player)
      }
    }
  },
})

export const transfers = phase({
  name: 'transfers',
  run({ state, ids, rng, transferStats, recruitStats }) {
    const transferCtx = { rng: rng.fork('transfers'), ids, stats: transferStats }
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
    runAiSquadManagement(state, { rng: rng.fork('aisquad'), ids, recruitStats })
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
          body: phrase(`deadline:${state.date.season}:${state.date.week}`, [
            `Window shuts Friday. Anyone still on that list gets signed today or not at all — `
              + `and the clubs who wouldn't take our calls in the summer are suddenly picking up.`,
            `Today's the day. Whatever's still outstanding is done by tonight or it isn't done, `
              + `and everyone's phone is on. Including the ones who ignored us in July.`,
            `Last chance. The list is what it is and the window shuts at the end of the week — `
              + `though you'd be amazed who answers the phone on deadline day.`,
          ]),
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
        const scout = state.staff[report.scoutId]
        addInboxItem(state, ids, {
          category: 'scouting',
          subject: `Scout report: ${player.knownAs}`,
          from: contact(scout?.knownAs, 'Scout'),
          body: scout
            ? scoutPitch(player, player.clubId ? state.clubs[player.clubId]?.name ?? null : null, report.verdict, scout, week)
            : report.verdict,
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
    const fee = formatMoneyShort(offer.fee)
    const value = formatMoneyShort(offer.player.value)
    addInboxItem(state, ids, {
      category: 'transfer',
      subject: `Offer received for ${offer.player.knownAs}`,
      from: 'Recruitment',
      // Recruitment ringing you about it, with the valuation as the aside it
      // would be on a phone rather than a second sentence of the same weight.
      body: phrase(`offer:${offer.player.id}:${offer.buyer.id}:${state.date.week}`, [
        `${offer.buyer.name} have come in for ${offer.player.knownAs}. ${fee}. We have him at ${value}.`,
        `Offer in from ${offer.buyer.name} for ${offer.player.knownAs} — ${fee}. For what it's worth we value him at ${value}.`,
        `${offer.buyer.name} want ${offer.player.knownAs} and they're offering ${fee}. He's worth ${value} on our books.`,
        `Just had ${offer.buyer.name} on about ${offer.player.knownAs}. ${fee} on the table, ${value} is what we'd say he's worth.`,
      ]),
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
    body: phrase(`agents:${club.id}:${state.date.season}:${state.date.week}`, [
      `Three or four agents have been on this week about lads who aren't playing — ${names}`
        + `${frozen.length > 4 ? ', and others' : ''}. Nobody's threatening anything. `
        + `They just want you to know they've noticed, and it'll be in the price next time.`,
      `Quiet word: the agents have clocked who isn't getting on the pitch. `
        + `${names}${frozen.length > 4 ? ' among others' : ''}. No drama, but they'll remember it `
        + `when we next sit down with them.`,
      `Phone's been going — agents asking why their lads aren't featuring. `
        + `${names}${frozen.length > 4 ? ', to name a few' : ''}. It's not a complaint yet. `
        + `It will be priced into the next deal we do with any of them.`,
    ]),
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

    const used = `${view.placesUsed} of ${SQUAD_LIMIT}`
    const left = barred.map((player) => `${player.knownAs} (${player.position}, ${player.age})`).join(', ')
    const key = `squadlist:${club.id}:${state.date.season}:${state.date.week}`

    // The club secretary, who has just come back from filing it. Warm where
    // there is nothing to report and apologetic where there is, because she is
    // the one who had to leave somebody out.
    const body = barred.length === 0
      ? phrase(key, [
        `Filed. ${used} places used, ${view.homegrown} homegrown. Everybody who needed a place has one.`,
        `That's the list in — ${used}, ${view.homegrown} homegrown. Nobody left out this time.`,
        `Squad list lodged. ${used} used, ${view.homegrown} homegrown, and no casualties.`,
      ])
      : phrase(key, [
        `That's the list filed — ${used} places, ${view.homegrown} homegrown. `
          + `I couldn't fit everyone: ${left} can't play until the window opens again. Sorry.`,
        `List is in. ${used} used, ${view.homegrown} homegrown. `
          + `The ones who missed out are ${left} — they're unavailable now until January.`,
        `Lodged with the league: ${used}, ${view.homegrown} homegrown. `
          + `You should know ${left} didn't make it, so they can't be picked until the window reopens.`,
      ])

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
