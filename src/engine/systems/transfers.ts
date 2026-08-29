import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { computeAskingPrice, computeValue, computeWageDemand, squadImportance, totalWageBill } from './valuation'
import { canAfford } from './finance'
import { reactToDeparture, reactToSigning, refreshSquadStatuses } from './morale'
import { ratingForPositionCached } from '../world/attributes'
import { isTransferWindowOpen } from '../sim/schedule'
import { addInboxItem } from './inbox'
import {
  NON_HOMEGROWN_LIMIT, releaseRegistration, settleArrival, SQUAD_LIMIT,
} from './registration'
import type {
  Agent, Club, CompletedTransfer, Contract, GameState, ID, NegotiationLogEntry, Player,
  TransferKind, TransferNegotiation, TransferTerms,
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
  const satisfaction = wageRatio * moneyWeight + appeal * (1 - moneyWeight)

  const agent: Agent | null = player.agentId ? state.agents[player.agentId] ?? null : null
  // The agent's cut. An aggressive agent representing a good player can make a
  // deal collapse over his own fee, which is exactly what happens in reality.
  const agentDemand = agent
    ? Math.round(offered * 52 * (0.06 + (agent.aggression / 100) * 0.12))
    : 0
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
      ratingForPositionCached(p.id, p.attributes, p.position)
      > ratingForPositionCached(player.id, player.attributes, player.position),
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

/** Value of an offer accounting for structure, sell-ons and bonuses. */
export function effectiveOfferValue(negotiation: TransferNegotiation): number {
  const t = negotiation.terms
  // Instalments are discounted; a sell-on clause has real but uncertain value.
  const instalmentDiscount = 1 - (1 - t.upfrontPercentage) * 0.12 * Math.max(0, t.instalments - 1)
  const sellOnValue = negotiation.offeredFee * t.sellOnPercentage * 0.35
  const bonusValue = (t.appearanceBonus + t.promotionBonus) * 0.4
  return negotiation.offeredFee * instalmentDiscount + sellOnValue + bonusValue
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
    seller.squad = seller.squad.filter((id) => id !== player.id)
    releaseRegistration(seller, player.id)
    reactToDeparture(state, seller, player)
    refreshSquadStatuses(state, seller)
  }

  // A new sell-on obligation for the selling club's benefit.
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
  player.purchaseFee = upfront
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
export function processAiTransfers(state: GameState, ctx: TransferContext): void {
  if (!isTransferWindowOpen(state.date.week)) return
  const { rng } = ctx

  for (const club of Object.values(state.clubs)) {
    if (club.id === state.playerClubId) continue
    if (club.finances.inCrisis) continue
    // Clubs do not act every week; the window would empty in a fortnight.
    if (!rng.chance(0.1)) continue

    const squad = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && !p.isAcademy)

    // Sell first: surplus players, and anyone who has asked to leave.
    const sellable = squad.filter(
      (p) => p.listedForTransfer || p.transferRequested || (squad.length > 26 && p.squadStatus === 'backup'),
    )
    if (sellable.length > 0 && rng.chance(0.4)) {
      const player = rng.pick(sellable)
      const buyerPool = Object.values(state.clubs).filter(
        (c) => c.id !== club.id && !c.finances.inCrisis && c.finances.transferBudget >= player.value,
      )
      if (buyerPool.length > 0) {
        const buyer = rng.pick(buyerPool)
        if (buyer.id !== state.playerClubId) {
          aiCompleteDeal(state, ctx, player, club, buyer)
          continue
        }
      }
    }

    // Loan out a young player who is not getting a game. This is the single
    // most common piece of business in football and without it the loan market
    // is empty except for whatever the human club does.
    if (rng.chance(0.25)) {
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
          continue
        }
      }
    }

    // Buy: find the position where the club is weakest relative to its league.
    if (squad.length >= 28) continue
    const targetPosition = weakestPosition(state, club, squad)
    if (!targetPosition) continue

    const candidates = Object.values(state.players).filter((p) => {
      if (p.clubId === club.id || p.isAcademy || p.loanClubId) return false
      if (p.position !== targetPosition) return false
      if (p.currentAbility < club.reputation * 1.1) return false
      const price = p.clubId ? p.value * 1.3 : 0
      if (price > club.finances.transferBudget) return false
      const wage = computeWageDemand(p, state.leagues[club.leagueId], state.nations[club.nationId])
      return totalWageBill(state, club) + wage <= club.finances.wageBudget
    })

    if (candidates.length === 0) continue
    const target = rng.weighted(candidates, candidates.map((p) => p.currentAbility))
    const sellerClub = target.clubId ? state.clubs[target.clubId] : null

    // The human club's players are never sold out from under them — an
    // approach becomes an offer the director gets to answer.
    if (sellerClub?.id === state.playerClubId) continue

    if (rng.chance(0.55)) aiCompleteDeal(state, ctx, target, sellerClub, club)
  }
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
    wageContribution: 0,
    loanUntilSeason: null,
  })
}

/** The position where a club is furthest below the standard of its division. */
function weakestPosition(state: GameState, club: Club, squad: Player[]): Player['position'] | null {
  const league = state.leagues[club.leagueId]
  if (!league) return null
  const standard = 45 + league.reputation * 1.3

  const positions: Player['position'][] = ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST']
  let worst: Player['position'] | null = null
  let worstGap = 0

  for (const position of positions) {
    const inPosition = squad.filter((p) => p.position === position)
    const best = inPosition.length
      ? Math.max(...inPosition.map((p) => p.currentAbility))
      : 0
    const gap = standard - best
    if (gap > worstGap) {
      worstGap = gap
      worst = position
    }
  }
  return worstGap > 12 ? worst : null
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
  const club = state.clubs[state.playerClubId]
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
