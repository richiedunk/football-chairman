import { clamp, Rng } from '../rng'
import { philosophyAppeal } from './recruitment'
import { aiWantsBuyBack, buyBackConcession, createClause } from './buyBack'
import { IdFactory, ID_PREFIX } from '../ids'
import { computeAskingPrice, computeValue, computeWageDemand, squadImportance, totalWageBill } from './valuation'
import { canAfford, facilityUpkeep } from './finance'
import { reactToDeparture, reactToSigning, refreshSquadStatuses } from './morale'
import { ratingForPositionCached } from '../world/attributes'
import { isTransferWindowOpen } from '../sim/schedule'
import {
  adjustForPlayer, agentFee as computeAgentFee, agentFor, agentWillingness,
} from './agents'
import { addInboxItem } from './inbox'
import { playerClub } from '../playerClub'
import {
  NON_HOMEGROWN_LIMIT, releaseRegistration, settleArrival, SQUAD_LIMIT, U21_AGE,
} from './registration'
import type {
  Agent, Club, CompletedTransfer, Contract, GameState, ID, NegotiationLogEntry, Player,
  Position, TransferKind, TransferNegotiation, TransferTerms,
} from '../types'

/**
 * Transfers.
 *
 * Modelled as a negotiation with three separate parties who each want
 * different things: the selling club wants money, the player wants status and
 * playing time, and the agent wants his cut and will happily blow up a deal
 * that does not pay him. A transfer can fail at any of the three, and failing
 * at each one feels different.
 *
 * Deals resolve over weeks rather than instantly. That delay is what makes the
 * transfer window a planning problem instead of a shopping trip.
 */

export const DEFAULT_TERMS: TransferTerms = {
  upfrontPercentage: 1,
  instalments: 1,
  sellOnPercentage: 0,
  buyBackPrice: 0,
  appearanceBonus: 0,
  promotionBonus: 0,
  wageContribution: 0,
}

export interface TransferContext {
  rng: Rng
  ids: IdFactory
}

// ---------------------------------------------------------------------------
// Opening a negotiation
// ---------------------------------------------------------------------------

export function openNegotiation(
  state: GameState,
  ctx: TransferContext,
  playerId: ID,
  buyingClubId: ID,
  kind: TransferKind,
  offeredFee: number,
  terms: TransferTerms = DEFAULT_TERMS,
): { negotiation: TransferNegotiation } | { error: string } {
  const player = state.players[playerId]
  const buyer = state.clubs[buyingClubId]
  if (!player || !buyer) return { error: 'Unknown player or club.' }

  if (!isTransferWindowOpen(state.date.week)) {
    return { error: 'The transfer window is closed.' }
  }
  if (player.clubId === buyingClubId) {
    return { error: 'That player is already at the club.' }
  }
  if (state.negotiations.some((n) => n.playerId === playerId && n.buyingClubId === buyingClubId && isLive(n))) {
    return { error: 'There is already an active negotiation for this player.' }
  }
  if (buyer.finances.inCrisis) {
    return { error: 'The club is under a transfer embargo.' }
  }

  const seller = player.clubId ? state.clubs[player.clubId] : null
  const askingPrice = seller ? computeAskingPrice(state, player, seller, buyer) : 0

  const negotiation: TransferNegotiation = {
    id: ctx.ids.next(ID_PREFIX.negotiation),
    playerId,
    buyingClubId,
    sellingClubId: seller?.id ?? null,
    kind,
    stage: seller ? 'enquiry' : 'playerTalks',
    offeredFee: seller ? offeredFee : 0,
    askingPrice,
    terms,
    playerTerms: null,
    agentFee: 0,
    rounds: 0,
    // Clubs take a few days to come back, which is what stops the window
    // being resolved in a single click.
    respondsOnWeek: state.date.week + 1,
    competingClubIds: [],
    log: [],
    playerInitiated: buyingClubId === state.playerClubId,
    deadlineWeek: windowCloseWeek(state.date.week),
  }

  addLog(state, negotiation, 'you', seller
    ? `Enquiry made to ${seller.name} regarding ${player.knownAs}.`
    : `Approach made to ${player.knownAs}, a free agent.`)

  state.negotiations.push(negotiation)
  return { negotiation }
}

function isLive(n: TransferNegotiation): boolean {
  return !['completed', 'rejected', 'withdrawn', 'hijacked'].includes(n.stage)
}

function windowCloseWeek(week: number): number {
  if (week >= 48) return 57 // wraps into week 5 of the next season
  if (week <= 5) return 5
  return 30
}

function addLog(
  state: GameState,
  negotiation: TransferNegotiation,
  speaker: NegotiationLogEntry['speaker'],
  text: string,
): void {
  negotiation.log.push({ week: state.date.week, season: state.date.season, speaker, text })
}

// ---------------------------------------------------------------------------
// Advancing a negotiation
// ---------------------------------------------------------------------------

/**
 * Weekly pass over every live negotiation. Each side responds when its clock
 * comes round, which is what produces the back-and-forth rhythm of a window.
 */
export function processNegotiations(state: GameState, ctx: TransferContext): string[] {
  const notices: string[] = []

  for (const negotiation of state.negotiations) {
    if (!isLive(negotiation)) continue
    if (state.date.week < negotiation.respondsOnWeek) continue

    // Window closing kills anything unresolved.
    if (!isTransferWindowOpen(state.date.week)) {
      negotiation.stage = 'withdrawn'
      addLog(state, negotiation, 'club', 'The window closed before the deal could be completed.')
      if (negotiation.buyingClubId === state.playerClubId) {
        const player = state.players[negotiation.playerId]
        notices.push(`The window closed before a deal for ${player?.knownAs ?? 'a target'} could be agreed.`)
      }
      continue
    }

    const notice = advanceNegotiation(state, negotiation, ctx)
    if (notice && negotiation.buyingClubId === state.playerClubId) notices.push(notice)
  }

  // Prune resolved negotiations so the list does not grow forever, keeping
  // recent ones so the UI can show what happened.
  state.negotiations = state.negotiations.filter(
    (n) => isLive(n) || n.rounds > 0 || state.date.week - n.respondsOnWeek < 6,
  )

  return notices
}

function advanceNegotiation(
  state: GameState,
  negotiation: TransferNegotiation,
  ctx: TransferContext,
): string | null {
  const player = state.players[negotiation.playerId]
  const buyer = state.clubs[negotiation.buyingClubId]
  if (!player || !buyer) {
    negotiation.stage = 'withdrawn'
    return null
  }
  const seller = negotiation.sellingClubId ? state.clubs[negotiation.sellingClubId] : null

  switch (negotiation.stage) {
    case 'enquiry':
      return respondToEnquiry(state, negotiation, player, buyer, seller, ctx)
    case 'clubTalks':
      return respondToOffer(state, negotiation, player, buyer, seller, ctx)
    case 'clubAgreed':
      negotiation.stage = 'playerTalks'
      negotiation.respondsOnWeek = state.date.week + 1
      addLog(state, negotiation, 'club', `${seller?.name ?? 'The club'} has accepted the offer. Personal terms remain.`)
      return `${seller?.name ?? 'The selling club'} has accepted your offer for ${player.knownAs}. You now need to agree personal terms.`
    case 'playerTalks':
      return respondToPlayerTerms(state, negotiation, player, buyer, ctx)
    case 'agreed':
      return completeTransfer(state, negotiation, ctx)
    default:
      return null
  }
}

/** The selling club's answer to a first approach: a price, or a refusal. */
function respondToEnquiry(
  state: GameState,
  negotiation: TransferNegotiation,
  player: Player,
  buyer: Club,
  seller: Club | null,
  ctx: TransferContext,
): string | null {
  if (!seller) {
    negotiation.stage = 'playerTalks'
    negotiation.respondsOnWeek = state.date.week + 1
    return null
  }

  const importance = squadImportance(state, player, seller)
  const asking = computeAskingPrice(state, player, seller, buyer)
  negotiation.askingPrice = asking

  // A club will refuse outright to discuss a player it considers untouchable,
  // unless the player himself wants out.
  const untouchable =
    importance > 0.85
    && !player.transferRequested
    && !player.listedForTransfer
    && seller.strategy.sellingClubStance < 40
    && !seller.finances.inCrisis

  if (untouchable && ctx.rng.chance(0.7)) {
    negotiation.stage = 'rejected'
    addLog(state, negotiation, 'club', `${seller.name} will not enter negotiations. He is not for sale.`)
    return `${seller.name} say ${player.knownAs} is not for sale at any price.`
  }

  negotiation.stage = 'clubTalks'
  negotiation.respondsOnWeek = state.date.week + 1
  addLog(state, negotiation, 'club',
    `${seller.name} will listen to offers around ${formatShort(asking)} for ${player.knownAs}.`)

  // Rival interest is generated at the point a player becomes visibly
  // available, which is what creates the pressure to move quickly.
  seedCompetition(state, negotiation, player, buyer, ctx)

  return `${seller.name} value ${player.knownAs} at around ${formatShort(asking)}.`
}

/** The selling club's answer to a concrete offer. */
function respondToOffer(
  state: GameState,
  negotiation: TransferNegotiation,
  player: Player,
  buyer: Club,
  seller: Club | null,
  ctx: TransferContext,
): string | null {
  if (!seller) {
    negotiation.stage = 'playerTalks'
    return null
  }

  negotiation.rounds += 1
  const effective = effectiveOfferValue(negotiation)
  const asking = negotiation.askingPrice

  // Structure matters as much as headline value. A club needing cash now will
  // take less up front than one happy to be paid over four years.
  const cashPressure = seller.finances.inCrisis ? 1.3 : seller.finances.balance < 0 ? 1.12 : 1
  const structureAdjusted = effective * (0.75 + negotiation.terms.upfrontPercentage * 0.25 * cashPressure)

  // A club negotiating with a wealthy buyer holds out longer, knowing the
  // money is there; one dealing with a club at its budget ceiling knows this
  // is probably the best it will get.
  const buyerLeverage = clamp(1 + (buyer.reputation - seller.reputation) / 400, 0.94, 1.08)
  // A little day-to-day variance, so reloading a week does not always produce
  // the same answer to the same offer.
  const threshold = 0.97 * buyerLeverage * ctx.rng.float(0.97, 1.03)

  const ratio = asking > 0 ? structureAdjusted / asking : 2

  if (ratio >= threshold) {
    negotiation.stage = 'clubAgreed'
    negotiation.respondsOnWeek = state.date.week
    addLog(state, negotiation, 'club', 'Offer accepted.')
    return null
  }

  // Patience runs out. After several rounds a club stops haggling and walks.
  if (negotiation.rounds >= 5 && ratio < 0.85) {
    negotiation.stage = 'rejected'
    addLog(state, negotiation, 'club', 'Talks have broken down. The club has ended negotiations.')
    return `${seller.name} have walked away from talks over ${player.knownAs}.`
  }

  if (ratio < 0.55) {
    negotiation.stage = 'rejected'
    addLog(state, negotiation, 'club', 'The offer was dismissed as derisory.')
    return `${seller.name} have dismissed your offer for ${player.knownAs} out of hand.`
  }

  // Counter-offer, converging on a number between the two positions.
  // Converge toward the buyer's position, but more slowly when rivals are
  // circling — competition is the seller's only real leverage.
  const convergence = negotiation.competingClubIds.length > 0 ? 0.82 : 0.72
  const counter =
    Math.round((asking * convergence + structureAdjusted * (1 - convergence)) / 10_000) * 10_000
  negotiation.askingPrice = Math.max(counter, Math.round(structureAdjusted * 1.05))
  negotiation.respondsOnWeek = state.date.week + 1
  addLog(state, negotiation, 'club',
    `Not enough. ${seller.name} have come back at ${formatShort(negotiation.askingPrice)}.`)

  return `${seller.name} have rejected your offer for ${player.knownAs} and countered at ${formatShort(negotiation.askingPrice)}.`
}

/** The player's and agent's answer to a contract offer. */
function respondToPlayerTerms(
  state: GameState,
  negotiation: TransferNegotiation,
  player: Player,
  buyer: Club,
  ctx: TransferContext,
): string | null {
  if (!negotiation.playerTerms) {
    // Waiting on the human to make an offer; nothing to do.
    negotiation.respondsOnWeek = state.date.week + 1
    return null
  }

  negotiation.rounds += 1
  const league = state.leagues[buyer.leagueId]
  const nation = state.nations[buyer.nationId]
  const demand = computeWageDemand(player, league, nation)

  const offered = negotiation.playerTerms.wage
  const wageRatio = demand > 0 ? offered / demand : 2

  // A move is not only about money. Standing, playing time and ambition all
  // count, weighted by the player's own personality.
  const appeal = moveAppeal(state, player, buyer)
  const moneyWeight = 0.45 + (player.ambitionVsMoney > 50 ? 0.2 : -0.1)
  // An agent who does not rate you makes his client harder to sign without
  // making the terms look any worse, which is exactly how it feels from the
  // outside: the numbers are fine and the deal keeps not happening.
  const satisfaction =
    (wageRatio * moneyWeight + appeal * (1 - moneyWeight))
    * agentWillingness(agentFor(state, player))

  const agent: Agent | null = agentFor(state, player)
  // The agent's cut. An aggressive agent representing a good player can make a
  // deal collapse over his own fee, which is exactly what happens in reality —
  // and what he asks depends on how you have treated his clients before now.
  const agentDemand = computeAgentFee(agent, offered * 52)
  negotiation.agentFee = agentDemand

  if (satisfaction >= 0.95) {
    negotiation.stage = 'agreed'
    negotiation.respondsOnWeek = state.date.week
    addLog(state, negotiation, 'player', `${player.knownAs} has agreed personal terms.`)
    if (agent) {
      addLog(state, negotiation, 'agent',
        `${agent.name} requires ${formatShort(agentDemand)} to complete the deal.`)
    }
    return null
  }

  if (negotiation.rounds >= 6 || satisfaction < 0.6) {
    negotiation.stage = 'rejected'
    const reason = wageRatio < 0.75
      ? 'the wages are nowhere near what he expects'
      : 'he is not convinced by the move'
    addLog(state, negotiation, 'player', `${player.knownAs} has turned the move down — ${reason}.`)
    return `${player.knownAs} has rejected personal terms: ${reason}.`
  }

  negotiation.respondsOnWeek = state.date.week + 1
  const counterWage = Math.round((demand * ctx.rng.float(1.0, 1.12)) / 50) * 50
  addLog(state, negotiation, agent ? 'agent' : 'player',
    `${agent ? agent.name : player.knownAs} is looking for ${formatShort(counterWage)} a week.`)
  return `${player.knownAs}'s camp are holding out for around ${formatShort(counterWage)} a week.`
}

/**
 * How attractive a move is, ignoring wages. 0-1.5. This is what lets a
 * well-run smaller club sign a player a richer one wanted.
 */
export function moveAppeal(state: GameState, player: Player, buyer: Club): number {
  const currentClub = player.clubId ? state.clubs[player.clubId] : null
  let appeal = 0.5

  // Standing of the buying club relative to where he is now.
  const repGap = buyer.reputation - (currentClub?.reputation ?? 20)
  appeal += clamp(repGap / 60, -0.45, 0.55)

  // Would he play? A player joining a club where he would be third choice
  // knows it, and a director of football who ignores this signs unhappy people.
  const rivals = buyer.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.position === player.position)
  const better = rivals.filter(
    (p) =>
      ratingForPositionCached(p.attributes, p.position)
      > ratingForPositionCached(player.attributes, player.position),
  ).length
  appeal += better === 0 ? 0.25 : better === 1 ? 0.05 : -0.18 * better

  // Ambition: is the club going anywhere?
  if (buyer.fanMood > 70) appeal += 0.08
  if (buyer.finances.inCrisis) appeal -= 0.3

  // Personality and circumstance.
  if (player.transferRequested) appeal += 0.25
  if (player.morale < 35) appeal += 0.15
  if (player.traits.includes('loyal') && currentClub) appeal -= 0.2
  if (player.traits.includes('ambitious') && repGap > 10) appeal += 0.15
  if (player.traits.includes('homesick') && buyer.nationId !== player.nationalityId) appeal -= 0.25
  if (player.nationalityId === buyer.nationId) appeal += 0.06

  // What kind of club this is, and whether it is the kind that would play him.
  // A twenty-year-old knows a develop-and-sell club will; a twenty-nine-year-
  // old knows it will not sign him at all.
  appeal += philosophyAppeal(buyer, player)

  // The director's own standing opens doors that a club's reputation alone
  // would not — the reason career progression matters beyond job offers.
  if (buyer.id === state.playerClubId) {
    appeal += clamp((state.director.reputation - 30) / 300, -0.05, 0.2)
  }

  return clamp(appeal, 0, 1.5)
}

/** Rival clubs who might gatecrash a deal. */
function seedCompetition(
  state: GameState,
  negotiation: TransferNegotiation,
  player: Player,
  buyer: Club,
  ctx: TransferContext,
): void {
  const candidates = Object.values(state.clubs).filter((club) => {
    if (club.id === buyer.id || club.id === player.clubId) return false
    if (club.finances.inCrisis) return false
    if (Math.abs(club.reputation - buyer.reputation) > 18) return false
    return club.finances.transferBudget >= negotiation.askingPrice * 0.9
  })

  const rivalCount = ctx.rng.weightedPairs([[0, 55], [1, 28], [2, 12], [3, 5]])
  negotiation.competingClubIds = ctx.rng.sample(candidates, rivalCount).map((c) => c.id)

  if (negotiation.competingClubIds.length > 0) {
    const names = negotiation.competingClubIds
      .map((id) => state.clubs[id]?.name)
      .filter(Boolean)
      .join(', ')
    addLog(state, negotiation, 'media', `Reports suggest ${names} are also interested.`)
  }
}

/** Value of an offer accounting for structure, sell-ons, bonuses and clauses. */
export function effectiveOfferValue(negotiation: TransferNegotiation): number {
  const t = negotiation.terms
  // Instalments are discounted; a sell-on clause has real but uncertain value.
  const instalmentDiscount = 1 - (1 - t.upfrontPercentage) * 0.12 * Math.max(0, t.instalments - 1)
  const sellOnValue = negotiation.offeredFee * t.sellOnPercentage * 0.35
  const bonusValue = (t.appearanceBonus + t.promotionBonus) * 0.4
  // A buy-back runs the other way to every other term: it is worth something
  // to whoever is *selling*, and it costs the buyer the upside on a player he
  // is about to develop. The cheaper the clause, the more it costs him, which
  // is why a selling club has to give money back to get one.
  const buyBackCost = negotiation.offeredFee
    * buyBackConcession(negotiation.offeredFee, t.buyBackPrice)
  return negotiation.offeredFee * instalmentDiscount + sellOnValue + bonusValue - buyBackCost
}

// ---------------------------------------------------------------------------
// Completing a transfer
// ---------------------------------------------------------------------------

function completeTransfer(
  state: GameState,
  negotiation: TransferNegotiation,
  ctx: TransferContext,
): string | null {
  const player = state.players[negotiation.playerId]
  const buyer = state.clubs[negotiation.buyingClubId]
  if (!player || !buyer || !negotiation.playerTerms) {
    negotiation.stage = 'withdrawn'
    return null
  }
  const seller = negotiation.sellingClubId ? state.clubs[negotiation.sellingClubId] : null

  const fee = seller ? negotiation.offeredFee : 0
  const upfront = Math.round(fee * negotiation.terms.upfrontPercentage)

  // Final affordability check — circumstances may have changed since the
  // offer was made, and a club should not complete a deal it can no longer pay.
  const affordability = canAfford(state, buyer, upfront, negotiation.playerTerms.wage)
  if (!affordability.ok) {
    negotiation.stage = 'withdrawn'
    addLog(state, negotiation, 'club', `The deal collapsed: ${affordability.reason}`)
    return `The move for ${player.knownAs} collapsed — ${affordability.reason?.toLowerCase()}`
  }

  executeTransfer(state, ctx, {
    player,
    buyer,
    seller,
    fee,
    kind: negotiation.kind,
    contract: negotiation.playerTerms,
    agentFee: negotiation.agentFee,
    sellOnPercentage: negotiation.terms.sellOnPercentage,
    buyBackPrice: negotiation.terms.buyBackPrice,
    wageContribution: negotiation.terms.wageContribution,
    loanUntilSeason: negotiation.kind === 'loan' || negotiation.kind === 'loanWithOption'
      ? state.date.season
      : null,
  })

  negotiation.stage = 'completed'
  addLog(state, negotiation, 'club', `${player.knownAs} has signed for ${buyer.name}.`)

  return `${player.knownAs} has completed his move to ${buyer.name}${fee > 0 ? ` for ${formatShort(fee)}` : ' on a free transfer'}.`
}

export interface ExecuteTransferArgs {
  player: Player
  buyer: Club
  seller: Club | null
  fee: number
  kind: TransferKind
  contract: Contract
  agentFee: number
  sellOnPercentage: number
  /** Selling club's right to buy him back at this fixed price. 0 for none. */
  buyBackPrice?: number
  wageContribution: number
  loanUntilSeason: number | null
}

/**
 * Move a player between clubs and settle the money. Shared by human deals,
 * AI-to-AI deals and free transfers so the books always balance the same way.
 */
/**
 * Give an arriving player a squad place, or explain why he has not got one.
 *
 * The two clubs behave differently on purpose. An AI club will push its worst
 * registered player out to fit a signing in, because that is what clubs do.
 * The human's club will not: a director of football who has just spent eight
 * million and cannot register the player has a problem to solve, and quietly
 * solving it for him would remove the only teeth the rule has.
 */
function settleArrivalRegistration(
  state: GameState,
  ctx: TransferContext,
  buyer: Club,
  player: Player,
): void {
  const outcome = settleArrival(state, buyer, player)
  if (outcome.registered || buyer.id !== state.playerClubId) return

  const reason = outcome.blocked === 'noHomegrownPlaces'
    ? `The squad list already carries ${NON_HOMEGROWN_LIMIT} players trained abroad, which is the maximum. `
      + 'To register him you will have to leave one of them out, or free a place with a homegrown player.'
    : `All ${SQUAD_LIMIT} places on the squad list are taken. Someone has to be left out.`

  addInboxItem(state, ctx.ids, {
    category: 'player',
    subject: `${player.knownAs} cannot be registered`,
    from: 'Club Secretary',
    body: `${player.knownAs} has signed, but there is no place for him on the squad list. ${reason} `
      + 'Until then he cannot be selected.',
    urgent: true,
    link: { view: 'squad' },
  })
}

export function executeTransfer(
  state: GameState,
  ctx: TransferContext,
  args: ExecuteTransferArgs,
): void {
  const { player, buyer, seller, fee, kind, contract, agentFee } = args
  const isLoan = kind === 'loan' || kind === 'loanWithOption'

  if (isLoan) {
    // Ownership does not move: the parent club keeps him in its squad and gets
    // him back. What moves is availability, so the borrowing club can actually
    // pick him — previously a loaned player was selectable by nobody, which
    // made the whole mechanic inert.
    player.loanClubId = buyer.id
    player.loanUntilSeason = args.loanUntilSeason ?? state.date.season
    player.loanWageShare = clamp(args.wageContribution, 0, 1)
    player.listedForLoan = false
    if (!buyer.loanedIn.includes(player.id)) buyer.loanedIn.push(player.id)

    // A loanee takes a place on the borrowing club's squad list and gives one
    // back at the parent — the reason a deadline-day loan is a real cost.
    if (seller) releaseRegistration(seller, player.id)
    settleArrivalRegistration(state, ctx, buyer, player)

    // A loan move is usually good news for a player who was not playing.
    player.morale = clamp(player.morale + 8, 1, 100)

    const record: CompletedTransfer = {
      id: ctx.ids.next(ID_PREFIX.transfer),
      season: state.date.season,
      week: state.date.week,
      playerId: player.id,
      playerName: player.knownAs,
      fromClubId: seller?.id ?? null,
      fromClubName: seller?.name ?? 'Free agent',
      toClubId: buyer.id,
      toClubName: buyer.name,
      fee: 0,
      kind,
    }
    state.completedTransfers.unshift(record)
    if (state.completedTransfers.length > 400) state.completedTransfers.length = 400
    return
  }

  const upfront = Math.round(fee)

  // Money out of the buying club.
  buyer.finances.balance -= upfront + agentFee
  buyer.finances.transferBudget = Math.max(0, buyer.finances.transferBudget - upfront)
  buyer.finances.season.transfersIn += upfront
  buyer.finances.season.agentFees += agentFee

  // Money into the selling club, less anything owed to previous clubs.
  if (seller) {
    let net = upfront
    for (const clause of player.sellOnClauseOwed) {
      const owed = Math.round(upfront * clause.percentage)
      const owedClub = state.clubs[clause.clubId]
      if (owedClub) {
        owedClub.finances.balance += owed
        owedClub.finances.season.transfersOut += owed
      }
      net -= owed
    }
    seller.finances.balance += net
    seller.finances.season.transfersOut += net

    // Profit on disposal is the fee less what the player is still carried at.
    // An academy graduate has a book value of zero, so his whole fee is
    // profit; a signing sold below what is left of his fee is a loss the
    // books have to swallow. This is the single most important number in
    // squad-cost compliance, and the reason a club in trouble sells its own
    // young players rather than its expensive ones.
    seller.finances.season.playerTradingProfit += net - player.bookValue
    seller.squad = seller.squad.filter((id) => id !== player.id)
    releaseRegistration(seller, player.id)
    reactToDeparture(state, seller, player)
    refreshSquadStatuses(state, seller)
  }

  // A new sell-on obligation for the selling club's benefit.
  // A buy-back replaces any the player was already carrying: the club that
  // held one and has now sold him on has given the right up, and it cannot be
  // passed along to somebody who never agreed to it.
  if (seller) {
    player.buyBack = createClause(seller, fee, args.buyBackPrice ?? 0, state.date.season)
  }

  if (args.sellOnPercentage > 0 && seller) {
    player.sellOnClauseOwed = [
      ...player.sellOnClauseOwed.filter((c) => c.clubId !== seller.id),
      { clubId: seller.id, percentage: args.sellOnPercentage },
    ]
  }

  // A player being sold while out on loan is recalled by the transfer.
  if (player.loanClubId) {
    const borrower = state.clubs[player.loanClubId]
    if (borrower) {
      borrower.loanedIn = borrower.loanedIn.filter((id) => id !== player.id)
      releaseRegistration(borrower, player.id)
    }
  }

  // Attach the player to his new club.
  player.clubId = buyer.id
  player.contract = contract
  player.weeksUnattached = 0
  player.purchaseFee = upfront
  // The fee is written down over the contract signed with it, which is what
  // makes a long contract a financial instrument rather than just a longer
  // commitment: the same fee costs less per season on a five-year deal.
  const amortisationSeasons = Math.max(1, contract.expiresSeason - state.date.season)
  player.bookValue = upfront
  player.amortisationCharge = Math.round(upfront / amortisationSeasons)
  player.joinedSeason = state.date.season
  player.transferRequested = false
  player.listedForTransfer = false
  player.listedForLoan = false
  player.loanClubId = null
  player.loanUntilSeason = null
  player.loanWageShare = 0
  player.morale = clamp(player.morale + 12, 1, 100)
  buyer.squad.push(player.id)
  settleArrivalRegistration(state, ctx, buyer, player)

  reactToSigning(state, buyer, player, ctx.rng)
  adjustForPlayer(state, buyer.id, player, 'signedClient')
  if (agentFee > 0) adjustForPlayer(state, buyer.id, player, 'paidFeeWithoutArgument')
  if (seller) adjustForPlayer(state, seller.id, player, 'soldClient')
  refreshSquadStatuses(state, buyer)

  // Revalue in the new context.
  const league = state.leagues[buyer.leagueId]
  const nation = state.nations[buyer.nationId]
  player.value = computeValue(player, league, nation, state.date.season)
  player.wageDemand = computeWageDemand(player, league, nation)

  const record: CompletedTransfer = {
    id: ctx.ids.next(ID_PREFIX.transfer),
    season: state.date.season,
    week: state.date.week,
    playerId: player.id,
    playerName: player.knownAs,
    fromClubId: seller?.id ?? null,
    fromClubName: seller?.name ?? 'Free agent',
    toClubId: buyer.id,
    toClubName: buyer.name,
    fee: upfront,
    kind,
  }
  state.completedTransfers.unshift(record)
  if (state.completedTransfers.length > 400) state.completedTransfers.length = 400
}

// ---------------------------------------------------------------------------
// AI transfer activity
// ---------------------------------------------------------------------------

/**
 * Background transfer market.
 *
 * AI clubs identify their weakest position, look for an affordable upgrade and
 * occasionally act. Kept deliberately cheap — this runs for every club in the
 * world every week of a window, and the player only ever sees the results.
 */
/**
 * Where the AI's transfer attempts go, for calibration.
 *
 * Counting is off by default and costs nothing when it is: guessing which of
 * five conditions is binding has been wrong twice, and a counter settles it in
 * one run.
 */
export interface TransferAttemptStats {
  buyAttempts: number
  noTargetPosition: number
  squadFull: number
  noCandidates: number
  dealRefused: number
  bought: number
  sellAttempts: number
  noChurnCandidate: number
  noBuyerForSale: number
  sold: number
}

let stats: TransferAttemptStats | null = null

export function collectTransferStats(): TransferAttemptStats {
  stats = {
    buyAttempts: 0, noTargetPosition: 0, squadFull: 0, noCandidates: 0,
    dealRefused: 0, bought: 0, sellAttempts: 0, noChurnCandidate: 0,
    noBuyerForSale: 0, sold: 0,
  }
  return stats
}

export function stopCollectingTransferStats(): void {
  stats = null
}

export function processAiTransfers(state: GameState, ctx: TransferContext): void {
  if (!isTransferWindowOpen(state.date.week)) return
  const { rng } = ctx

  // Everyone who could move, indexed by position and sorted by ability.
  //
  // Built once a week and shared. The old code scanned all ten thousand
  // players in the world for every club that fancied a signing, which is what
  // kept the activity rate pinned so low: raising it was unaffordable. With an
  // index a club looks at a few dozen players in its own bracket instead.
  const market = buildMarketIndex(state)

  for (const club of Object.values(state.clubs)) {
    if (club.id === state.playerClubId) continue

    // A club in crisis was skipped entirely, which meant it could not sell —
    // the one thing it most needs to do. It could only sit there paying wages
    // it could not afford while the interest compounded, and the lower
    // divisions filled up with clubs that could never trade their way out.
    // It may now sell and loan out; it still may not buy.
    const inCrisis = club.finances.inCrisis

    const squad = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && !p.isAcademy)

    // Recruitment is churn, not accumulation.
    //
    // A wage budget leaves room for one or two additions a season and no more,
    // so a club that only ever buys stops buying in August and the market
    // seizes up — which is exactly what was happening at half a signing per
    // club per season. Real clubs replace roughly a quarter of the squad a
    // year, and they do it by deciding who is leaving first. Selling is what
    // pays for buying, in wages as much as in cash.
    const moveOn = churnCandidates(state, club, squad, inCrisis)
    const sellAttempts = inCrisis ? SELL_ATTEMPTS + 1 : SELL_ATTEMPTS
    for (let attempt = 0; attempt < sellAttempts; attempt++) {
      if (stats) stats.sellAttempts += 1
      if (moveOn.length === 0) { if (stats) stats.noChurnCandidate += 1; break }
      if (!rng.chance(inCrisis ? 0.55 : SELL_CHANCE)) continue
      const player = moveOn.shift()
      if (!player) break
      // A buyer who actually wants him, not simply one who could pay.
      //
      // Picking at random from everyone with the money meant the deal was then
      // refused almost every time — on the player's willingness, or on the
      // buyer's wage bill, or on the real asking price. Twenty-seven sale
      // attempts a season produced under three sales. Filtering for a club
      // that has room, has the wages, and whom the player would actually join
      // turns the same attempts into deals.
      const buyerPool = suitableBuyers(state, player, club)
      if (buyerPool.length === 0) { if (stats) stats.noBuyerForSale += 1; continue }
      const buyer = rng.pick(buyerPool)
      if (buyer.id !== state.playerClubId) {
        const before = club.squad.length
        aiCompleteDeal(state, ctx, player, club, buyer)
        if (stats && club.squad.length < before) stats.sold += 1
      }
    }

    // Loan out a young player who is not getting a game. This is the single
    // most common piece of business in football and without it the loan market
    // is empty except for whatever the human club does.
    if (rng.chance(LOAN_CHANCE)) {
      const stuck = squad.filter(
        (p) => p.age <= 22 && !p.loanClubId && p.stats.appearances < 3 && !p.injury,
      )
      if (stuck.length > 0) {
        const player = rng.pick(stuck)
        const takers = Object.values(state.clubs).filter(
          (c) =>
            c.id !== club.id
            && c.id !== state.playerClubId
            && !c.finances.inCrisis
            && c.loanedIn.length < 5
            && c.reputation < club.reputation
            && c.reputation > club.reputation - 40,
        )
        if (takers.length > 0 && player.contract) {
          const borrower = rng.pick(takers)
          executeTransfer(state, ctx, {
            player,
            buyer: borrower,
            seller: club,
            fee: 0,
            kind: 'loan',
            contract: player.contract,
            agentFee: 0,
            sellOnPercentage: 0,
            wageContribution: rng.float(0.3, 0.8),
            loanUntilSeason: state.date.season,
          })
        }
      }
    }

    // Buy. Two attempts a week, because a club that has just freed up wages
    // and a squad place is in the market immediately, not next week.
    if (inCrisis) continue
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]

    for (let attempt = 0; attempt < BUY_ATTEMPTS; attempt++) {
      // Players actually available to the club, so a squad full of loanees
      // out on loan does not read as full.
      const current = club.squad
        .map((id) => state.players[id])
        .filter((p): p is Player => Boolean(p) && !p.isAcademy && !p.loanClubId)

      // The brake that holds is the squad list, not a number picked to make
      // the volume come out right. A club may register 25 seniors; a 26th
      // cannot be named and therefore cannot be picked, so there is no point
      // signing him. Under-21s sit outside the list and outside this count,
      // which is exactly why clubs keep buying young players when they are
      // otherwise full.
      //
      // It also holds as the world gets richer. Every rate in this file drifts
      // upward over a long save as budgets grow; a limit made of places rather
      // than money does not.
      const seniors = current.filter((p) => p.age >= U21_AGE).length
      if (seniors >= SQUAD_LIMIT || current.length >= SQUAD_CEILING) {
        if (stats) stats.squadFull += 1
        break
      }
      if (!rng.chance(BUY_CHANCE)) continue
      if (stats) stats.buyAttempts += 1

      const targetPosition = weakestPosition(state, club, current)
      if (!targetPosition) { if (stats) stats.noTargetPosition += 1; break }

      const wageRoom = club.finances.wageBudget - totalWageBill(state, club)
      const candidates: Player[] = []
      for (const p of market.get(targetPosition) ?? []) {
        // The list is sorted by ability, so once it drops below the club's
        // standard there is nothing further down worth looking at.
        if (p.currentAbility < club.reputation * 1.1) break
        if (p.clubId === club.id) continue

        // Priced at what the seller would actually take, not at a flat markup
        // on the valuation. The two are not the same — the asking price
        // carries the seller's stance, the player's importance to them and the
        // tax everybody charges a rich buyer — so a filter using the flat
        // figure waved through candidates the club then could not afford, and
        // roughly a third of all attempts died at the final step.
        // Wages before price, because the wage is the cheaper question.
        //
        // Both filters have to pass and neither depends on the other, so the
        // order changes nothing about who ends up a candidate — only how much
        // work is done finding out. An asking price runs the seller's stance,
        // the player's importance to them and the buyer's wealth through
        // `computeAskingPrice`; a wage demand is arithmetic on the player. It
        // was paying for the expensive one first and then discarding the
        // candidate on the cheap one.
        if (computeWageDemand(p, league, nation) > wageRoom) continue
        const seller = p.clubId ? state.clubs[p.clubId] ?? null : null
        const price = seller ? Math.round(computeAskingPrice(state, p, seller, club) * 0.95) : 0
        if (price > club.finances.transferBudget) continue
        candidates.push(p)
        if (candidates.length >= 40) break
      }

      if (candidates.length === 0) { if (stats) stats.noCandidates += 1; break }

      // Where this club looks. `domesticBias` had reached free agents and the
      // human's scouting shortlist but never the AI's own buying, which is
      // the channel that actually rebuilds a squad — so every club in the
      // world bought nationality-blind and every stated policy converged on
      // the same squad. Measured over four seasons, all six policies landed
      // between 44% and 49% foreign, homegrown included.
      //
      // A weight rather than a filter: a homegrown club will still sign the
      // foreign player who is plainly better, which is what clubs do. It just
      // has to be plainly better.
      const bias = ((club.strategy.domesticBias ?? 50) - 50) / 50
      const target = rng.weighted(candidates, candidates.map((p) => {
        const home = p.nationalityId === club.nationId
        return p.currentAbility * Math.pow(2.4, home ? bias : -bias)
      }))
      const sellerClub = target.clubId ? state.clubs[target.clubId] : null

      // The human club's players are never sold out from under them — an
      // approach becomes an offer the director gets to answer.
      if (sellerClub?.id === state.playerClubId) continue

      const squadBefore = club.squad.length
      aiCompleteDeal(state, ctx, target, sellerClub, club)
      if (stats) {
        if (club.squad.length > squadBefore) stats.bought += 1
        else stats.dealRefused += 1
      }
    }
  }
}

/**
 * Who a club would move on, worst first.
 *
 * Ranked by what a recruitment department actually weighs: how far the player
 * is below the division's standard, how much of a future he has, and whether
 * his deal is running down anyway. A club always has candidates — every squad
 * has a bottom — but it only acts on them when it has a reason to.
 */
/** Test seam: the churn list a club would draw up right now. */
export function churnCandidatesForTest(state: GameState, club: Club): Player[] {
  const squad = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)
  return churnCandidates(state, club, squad, club.finances.inCrisis)
}

function churnCandidates(
  state: GameState,
  club: Club,
  squad: Player[],
  inCrisis: boolean,
): Player[] {
  const league = state.leagues[club.leagueId]
  const standard = 45 + (league?.reputation ?? 40) * 1.3

  const scored = squad
    .filter((p) => !p.loanClubId)
    .map((player) => {
      // Below the standard is the main reason to move somebody on.
      let keep = player.currentAbility - standard
      // A young player with room to grow is worth keeping even when he is not
      // good enough yet; that is what a squad place is for.
      if (player.age <= 22) keep += (player.potentialAbility - player.currentAbility) * 0.5
      // An ageing player on the way down is the obvious one to replace.
      if (player.age >= 31) keep -= (player.age - 30) * 7
      // A deal running down is worth cashing in before it is worth nothing.
      const seasonsLeft = player.contract
        ? player.contract.expiresSeason - state.date.season
        : 0
      if (seasonsLeft <= 1) keep -= 14
      if (player.squadStatus === 'surplus') keep -= 40
      if (player.listedForTransfer || player.transferRequested) keep -= 30
      return { player, keep }
    })
    .sort((a, b) => a.keep - b.keep)

  // How many the club is actually looking to replace.
  //
  // A club only sheds what it can replace. Letting every squad churn its
  // bottom regardless of size stripped the lower divisions — non-league squads
  // fell to fourteen players with no professional over 31 in them — because
  // small clubs could always find someone to sell and never anyone to buy.
  // Above the target size a club sheds freely; at or below it, only genuine
  // surplus, and never below the floor needed to field a side with cover.
  const available = squad.filter((p) => !p.loanClubId).length
  const surplusSize = Math.max(0, available - 23)
  const weak = scored.filter((e) => e.keep < 0).length
  const headroom = Math.max(0, available - CHURN_FLOOR)

  const appetite = inCrisis
    ? Math.min(6, headroom)
    : clamp(Math.round(surplusSize + weak * 0.35), 0, Math.min(6, headroom))

  return scored.slice(0, appetite).map((e) => e.player)
}

/**
 * How often a club does each kind of business, per week of an open window.
 *
 * Set from the real rate rather than from feel. A Premier League club makes
 * something like six to eight permanent signings across a season's two
 * windows, and the same is true further down; the old rates produced half a
 * signing per club per season across the entire world, which left the transfer
 * market inert and clubs sitting on money they had no way to spend.
 */
// Selling and buying feed each other: every sale puts a squad place and some
// wages back into the market, which makes the next club's sale easier to
// place. Cutting the number of attempts a week barely touched the total
// because the loop simply converted a higher share of what was left — the
// brake that works is on how often a club goes looking at all.
const SELL_CHANCE = 0.3
const LOAN_CHANCE = 0.14
const BUY_CHANCE = 0.45

/**
 * Pieces of business a club will attempt in a week of an open window.
 *
 * Tuned to land permanent transfers at six to eight a club a season, which is
 * roughly what a real club does across two windows. Four attempts overshot to
 * ten; three sits in the band.
 */
const SELL_ATTEMPTS = 3
const BUY_ATTEMPTS = 3

/** A club will not sell its way below this many available seniors. */
const CHURN_FLOOR = 21

/** Weeks of running costs a club keeps in the bank when it buys. */
const TRANSFER_CASH_BUFFER_WEEKS = 6

/** Wages plus upkeep for a week — what the club has to find whatever it does. */
function weeklyRunningCost(state: GameState, club: Club): number {
  return totalWageBill(state, club) + facilityUpkeep(state, club)
}

/**
 * Where a club stops adding.
 *
 * Above the 25 a squad list can carry, plus room for the under-21s who sit
 * outside it. The old figure of 27 was the single largest reason a buy attempt
 * came to nothing — more than the wage budget and the transfer budget put
 * together — because it broke the whole week's business rather than skipping
 * one signing.
 */
const SQUAD_CEILING = 30

/**
 * Clubs that would take this player off his club's hands.
 *
 * The same conditions the deal itself will be judged against, applied before
 * choosing rather than after, so a sale attempt is aimed rather than sprayed.
 */
function suitableBuyers(state: GameState, player: Player, seller: Club): Club[] {
  const out: Club[] = []
  for (const club of Object.values(state.clubs)) {
    if (club.id === seller.id || club.id === state.playerClubId) continue
    if (club.finances.inCrisis) continue

    // Counted, not collected.
    //
    // This ran for every club in the world for every player being shopped, and
    // built three arrays each time to answer two questions about size. One
    // pass, no allocation, and the cheap test now happens before any of the
    // expensive ones below it.
    let available = 0
    let seniors = 0
    for (const id of club.squad) {
      const p = state.players[id]
      if (!p || p.isAcademy || p.loanClubId) continue
      available += 1
      if (p.age >= U21_AGE) seniors += 1
    }
    if (available >= SQUAD_CEILING) continue
    if (seniors >= SQUAD_LIMIT) continue

    // How hard this club competes. `wageAggression` was generated for every
    // club in the world and read by nothing, so a club that would break its
    // structure for a signing and one that would not behaved identically.
    // High aggression means bidding above the asking price and stretching the
    // wage bill; low means walking away from the same player.
    const aggression = (club.strategy.wageAggression ?? 50) / 100
    const fee = Math.round(
      computeAskingPrice(state, player, seller, club) * (0.86 + aggression * 0.24),
    )
    if (fee > club.finances.transferBudget) continue

    const wage = computeWageDemand(player, state.leagues[club.leagueId], state.nations[club.nationId])
    // A club that pays over the odds will run its wage bill closer to the
    // line, and past it by a little when it wants somebody badly.
    const wageRoom = club.finances.wageBudget * (0.94 + aggression * 0.14)
    if (totalWageBill(state, club) + wage > wageRoom) continue
    if (moveAppeal(state, player, club) < 0.45) continue

    out.push(club)
    if (out.length >= 12) break
  }
  return out
}

/** Transferable players by position, best first. */
function buildMarketIndex(state: GameState): Map<Position, Player[]> {
  const index = new Map<Position, Player[]>()
  for (const player of Object.values(state.players)) {
    if (player.isAcademy || player.loanClubId) continue
    const list = index.get(player.position)
    if (list) list.push(player)
    else index.set(player.position, [player])
  }
  for (const list of index.values()) list.sort((a, b) => b.currentAbility - a.currentAbility)
  return index
}

function aiCompleteDeal(
  state: GameState,
  ctx: TransferContext,
  player: Player,
  seller: Club | null,
  buyer: Club,
): void {
  const fee = seller ? Math.round(computeAskingPrice(state, player, seller, buyer) * 0.95) : 0
  const league = state.leagues[buyer.leagueId]
  const nation = state.nations[buyer.nationId]
  const wage = computeWageDemand(player, league, nation)

  if (fee > buyer.finances.transferBudget) return
  if (totalWageBill(state, buyer) + wage > buyer.finances.wageBudget) return
  if (moveAppeal(state, player, buyer) < 0.45) return

  // A club does not sign its way into the red. The transfer budget already
  // draws on the reserves, so spending it to the last penny leaves nothing to
  // pay the wages with, and a fortnight later the shortfall is debt. Boards do
  // not sanction that, and clubs kept walking into financial crisis a window
  // after a busy one because nothing here stopped them.
  const reserve = weeklyRunningCost(state, buyer) * TRANSFER_CASH_BUFFER_WEEKS
  if (buyer.finances.balance - fee < reserve) return

  executeTransfer(state, ctx, {
    player,
    buyer,
    seller,
    fee,
    kind: seller ? 'permanent' : 'free',
    contract: {
      wage: Math.round(wage),
      expiresSeason: state.date.season + ctx.rng.int(2, 5),
      signingBonus: 0,
      releaseClause: null,
      appearanceFee: 0,
      goalBonus: 0,
      loyaltyBonus: 0,
      inNegotiation: false,
      weeksSinceRenewalRequest: 0,
    },
    agentFee: Math.round(wage * 52 * 0.08),
    sellOnPercentage: 0,
    // AI clubs ask for buy-backs on the players they did not want to lose,
    // which in practice means the young and the promising. Without this the
    // mechanic would exist only for the human, and a clause nobody else uses
    // is a cheat code rather than a market instrument.
    buyBackPrice: seller
      ? Math.round(fee * aiWantsBuyBack(ctx.rng, seller, player))
      : 0,
    wageContribution: 0,
    loanUntilSeason: null,
  })
}

/** The position where a club is furthest below the standard of its division. */
/**
 * Where a club would most like to strengthen.
 *
 * This used to return nothing at all unless some position was more than
 * twelve points below the division's standard, which meant a well-run club
 * was never in the market: it had no weakness, so it never signed anybody.
 * Clubs do not only sign players to patch holes — most transfers are an
 * attempt to be better in a position that was already adequate.
 *
 * So there is always a target. Quality gaps come first, and where the squad
 * is uniformly decent the thinnest position wins, because depth is the other
 * reason clubs buy.
 */
function weakestPosition(state: GameState, club: Club, squad: Player[]): Player['position'] | null {
  const league = state.leagues[club.leagueId]
  if (!league) return null
  const standard = 45 + league.reputation * 1.3

  const positions: Player['position'][] = ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST']
  let worst: Player['position'] | null = null
  let worstScore = -Infinity

  // One pass for all ten positions.
  //
  // This filtered the squad once per position, mapped each result and spread it
  // into Math.max — thirty allocations and ten scans to answer a question about
  // one squad, on every buy attempt by every club. The spread was also a
  // standing hazard: Math.max(...xs) on a long enough array overflows the call
  // stack, and nothing here bounded the squad.
  const bestAt = new Map<Player['position'], number>()
  const countAt = new Map<Player['position'], number>()
  for (const p of squad) {
    countAt.set(p.position, (countAt.get(p.position) ?? 0) + 1)
    const best = bestAt.get(p.position) ?? 0
    if (p.currentAbility > best) bestAt.set(p.position, p.currentAbility)
  }

  for (const position of positions) {
    const inPositionCount = countAt.get(position) ?? 0
    const best = bestAt.get(position) ?? 0
    // A quality shortfall counts for more than a depth one, but a position
    // with a single body in it is a problem whatever his rating.
    const quality = standard - best
    const thinness = Math.max(0, 2 - inPositionCount) * 9
    const score = quality + thinness
    if (score > worstScore) {
      worstScore = score
      worst = position
    }
  }
  return worst
}

/**
 * Rival clubs approaching the human club's players. Produces the offers the
 * director has to answer, which is the other half of the transfer game.
 */
export function generateIncomingOffers(
  state: GameState,
  ctx: TransferContext,
): { player: Player; buyer: Club; fee: number }[] {
  if (!isTransferWindowOpen(state.date.week)) return []
  const club = playerClub(state)
  if (!club) return []

  const offers: { player: Player; buyer: Club; fee: number }[] = []
  const squad = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)

  for (const player of squad) {
    // Interest is driven by how good he is relative to his current level, and
    // by whether he is visibly available.
    let interestChance = 0.006
    if (player.listedForTransfer) interestChance += 0.09
    if (player.transferRequested) interestChance += 0.05
    if (player.contract && player.contract.expiresSeason - state.date.season <= 1) interestChance += 0.03
    interestChance += clamp((player.currentAbility - club.reputation * 1.6) / 400, 0, 0.05)
    if (player.form > 78) interestChance += 0.015

    if (!ctx.rng.chance(interestChance)) continue

    const suitors = Object.values(state.clubs).filter((c) => {
      if (c.id === club.id || c.finances.inCrisis) return false
      const price = computeAskingPrice(state, player, club, c)
      return c.finances.transferBudget >= price * 0.8
        && moveAppeal(state, player, c) > 0.5
    })
    if (suitors.length === 0) continue

    const buyer = ctx.rng.weighted(suitors, suitors.map((c) => c.reputation))
    const asking = computeAskingPrice(state, player, club, buyer)
    // Opening bids come in below the asking price, as they do in reality.
    const fee = Math.round((asking * ctx.rng.float(0.6, 1.05)) / 10_000) * 10_000
    offers.push({ player, buyer, fee })
  }

  return offers
}

function formatShort(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`
  return `£${Math.round(amount)}`
}
