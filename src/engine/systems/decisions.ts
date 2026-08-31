import { Rng } from '../rng'
import { IdFactory } from '../ids'
import { computeAskingPrice, computeWageDemand, formatMoney } from './valuation'
import { executeTransfer } from './transfers'
import { respondToRequest } from './board'
import { acceptJobOffer } from '../season'
import { addNews } from './inbox'
import { clamp } from '../rng'
import type { Club, GameState, InboxItem, Player } from '../types'
import { resolveOwnerPitch, type PitchId } from './takeovers'
import { playerClub } from '../playerClub'
import { buyBackAskingPrice, buyBackDiscountedFee } from './buyBack'

/**
 * Resolving inbox decisions.
 *
 * Every decision the player is asked to make funnels through here, so that a
 * choice made by tapping a button and a choice made by letting an item expire
 * take exactly the same path. Divergence between those two is a classic source
 * of state bugs — the auto-resolved case is the one nobody tests.
 */

export interface DecisionContext {
  rng: Rng
  ids: IdFactory
}

export function resolveDecision(
  state: GameState,
  item: InboxItem,
  optionId: string,
  ctx: DecisionContext,
): string {
  if (!item.decision) return ''
  item.decision.chosenId = optionId
  item.read = true

  const kind = String(item.payload?.kind ?? '')
  let outcome = ''

  switch (kind) {
    case 'transferOffer':
      outcome = resolveTransferOffer(state, item, optionId, ctx)
      break
    case 'coachRequest':
      outcome = resolveCoachRequest(state, item, optionId)
      break
    case 'jobOffer':
      outcome = resolveJobOffer(state, item, optionId)
      break
    case 'ownerPitch': {
      const club = playerClub(state)
      outcome = club ? resolveOwnerPitch(club, optionId as PitchId) : 'The meeting never happened.'
      break
    }
    default:
      outcome = 'Noted.'
      break
  }

  item.decision.outcomeText = outcome
  return outcome
}

function resolveTransferOffer(
  state: GameState,
  item: InboxItem,
  optionId: string,
  ctx: DecisionContext,
): string {
  const playerId = String(item.payload?.playerId ?? '')
  const buyerId = String(item.payload?.buyerId ?? '')
  const fee = Number(item.payload?.fee ?? 0)

  const player = state.players[playerId]
  const buyer = state.clubs[buyerId]
  const seller = playerClub(state)
  if (!player || !buyer || !seller) return 'The offer has lapsed.'

  if (optionId === 'reject') {
    // Rejecting an offer a player wanted costs you morale with him — he knows
    // what he was worth to someone else.
    if (player.transferRequested || player.morale < 40) {
      player.morale = clamp(player.morale - 8, 1, 100)
      return `You reject the offer. ${player.knownAs} is not happy about it.`
    }
    return `You reject ${buyer.name}'s offer for ${player.knownAs}.`
  }

  if (optionId === 'buyBack') {
    // Less money now, and the right to bring him back at a fixed price. The
    // buying club takes the discount because it is being asked to develop a
    // player it may not get to keep.
    const price = buyBackAskingPrice(fee)
    const discounted = buyBackDiscountedFee(fee)
    completeSale(state, player, buyer, discounted, ctx, price)
    return `${player.knownAs} joins ${buyer.name} for ${discounted.toLocaleString()}. `
      + `We can buy him back for ${price.toLocaleString()} from next season.`
  }

  if (optionId === 'negotiate') {
    const asking = computeAskingPrice(state, player, seller, buyer)
    const willingness = buyer.finances.transferBudget / Math.max(1, asking)
    // A club already at its ceiling walks; one with room usually improves.
    if (willingness > 1.05 && ctx.rng.chance(0.62)) {
      const improved = Math.round((fee + (asking - fee) * ctx.rng.float(0.5, 0.95)) / 10_000) * 10_000
      completeSale(state, player, buyer, improved, ctx)
      return `${buyer.name} improved to ${formatMoney(improved, state.settings.currency)} and the deal is done.`
    }
    addNews(state, ctx.ids, 'transfer', `${buyer.name} withdrew their interest in ${player.knownAs}.`)
    return `${buyer.name} refused to improve and have withdrawn.`
  }

  completeSale(state, player, buyer, fee, ctx)
  return `${player.knownAs} sold to ${buyer.name} for ${formatMoney(fee, state.settings.currency)}.`
}

function completeSale(
  state: GameState,
  player: Player,
  buyer: Club,
  fee: number,
  ctx: DecisionContext,
  buyBackPrice = 0,
): void {
  const seller = playerClub(state)
  const league = state.leagues[buyer.leagueId]
  const nation = state.nations[buyer.nationId]
  const wage = computeWageDemand(player, league, nation)

  executeTransfer(state, ctx, {
    player,
    buyer,
    seller: seller ?? null,
    fee,
    kind: 'permanent',
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
    agentFee: 0,
    sellOnPercentage: 0,
    buyBackPrice,
    wageContribution: 0,
    loanUntilSeason: null,
  })
}

function resolveCoachRequest(state: GameState, item: InboxItem, optionId: string): string {
  const club = playerClub(state)
  const requestId = String(item.payload?.requestId ?? '')
  if (!club) return ''
  return respondToRequest(state, club, requestId, optionId === 'accept')
}

function resolveJobOffer(state: GameState, item: InboxItem, optionId: string): string {
  if (optionId !== 'accept') {
    state.director.jobOffers = state.director.jobOffers.filter(
      (o) => o.id !== String(item.payload?.offerId ?? ''),
    )
    return 'You turn the approach down and stay where you are.'
  }
  const result = acceptJobOffer(state, String(item.payload?.offerId ?? ''))
  return result.message
}
