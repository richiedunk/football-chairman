import { clamp, Rng } from '../rng'
import type { BuyBackClause, Club, GameState, ID, Player } from '../types'

/**
 * Buy-back clauses.
 *
 * The instrument that stops selling a nineteen-year-old being a pure loss. You
 * take the money, let somebody else pay his wages and give him the football you
 * could not, and you keep the right to bring him back at a price agreed before
 * anybody knew what he would become. When he turns into a player, the clause is
 * worth more than the fee ever was. When it lapses because you had no room in
 * the twenty-five, that is a real regret and one you did to yourself.
 *
 * It is squarely the director's instrument — a clause in a contract, not a
 * decision about who plays on Saturday — which is why it belongs in this game
 * and a substitution does not.
 *
 * The honest part is the price. A buy-back is agreed at the sale and never
 * moves, so a club granting one at a low price is handing over the upside on a
 * player it is about to develop. Buying clubs resist a cheap buy-back exactly
 * the way they resist a cheap fee, and this module is where that resistance
 * lives.
 */

/**
 * Seasons before the right can first be exercised.
 *
 * One full season. A club that sells a player and buys him back the same summer
 * has not sold him, and a clause that allowed it would be a loan with extra
 * steps.
 */
export const BUY_BACK_DELAY_SEASONS = 1

/** Seasons the window stays open once it has opened. */
export const BUY_BACK_WINDOW_SEASONS = 3

/**
 * The cheapest buy-back a selling club can ask for, as a multiple of the fee.
 *
 * Below this the buying club is being asked to develop somebody else's player
 * for nothing, and will say so. Real clauses cluster between two and four times
 * the fee, which is what makes them worth granting and worth holding.
 */
export const MIN_BUY_BACK_MULTIPLE = 1.4

/** The multiple above which the clause costs the buyer effectively nothing. */
export const FREE_BUY_BACK_MULTIPLE = 4

/**
 * What granting a buy-back costs the buying club, as a fraction of the fee.
 *
 * The cheaper the buy-back, the more upside is being signed away, so the more
 * the buyer wants off the price to compensate. At four times the fee the club
 * is giving up almost nothing — he would have to become a different player
 * entirely — and the discount goes to zero.
 */
export function buyBackConcession(fee: number, buyBackPrice: number): number {
  if (fee <= 0 || buyBackPrice <= 0) return 0
  const multiple = buyBackPrice / fee
  if (multiple >= FREE_BUY_BACK_MULTIPLE) return 0
  const steepness = clamp(
    (FREE_BUY_BACK_MULTIPLE - multiple) / (FREE_BUY_BACK_MULTIPLE - MIN_BUY_BACK_MULTIPLE),
    0, 1,
  )
  // Up to a third off the fee for a buy-back at the floor. A club will take
  // less money to keep the right, which is the trade the clause exists to make.
  return steepness * 0.33
}

/** Whether a buying club will entertain this price at all. */
export function buyBackAcceptable(fee: number, buyBackPrice: number): boolean {
  if (buyBackPrice <= 0) return true
  return fee > 0 && buyBackPrice / fee >= MIN_BUY_BACK_MULTIPLE
}

/** The clause a sale creates, or null when none was agreed. */
export function createClause(
  seller: Club,
  fee: number,
  buyBackPrice: number,
  season: number,
): BuyBackClause | null {
  if (buyBackPrice <= 0 || !buyBackAcceptable(fee, buyBackPrice)) return null
  return {
    clubId: seller.id,
    price: Math.round(buyBackPrice),
    fromSeason: season + BUY_BACK_DELAY_SEASONS,
    untilSeason: season + BUY_BACK_DELAY_SEASONS + BUY_BACK_WINDOW_SEASONS - 1,
    soldFor: Math.round(fee),
  }
}

export type ClauseState = 'none' | 'waiting' | 'live' | 'lapsed'

export function clauseState(clause: BuyBackClause | null, season: number): ClauseState {
  if (!clause) return 'none'
  if (season < clause.fromSeason) return 'waiting'
  if (season > clause.untilSeason) return 'lapsed'
  return 'live'
}

/** Buy-backs this club holds, in whatever state. */
export function clausesHeldBy(state: GameState, clubId: ID): Player[] {
  return Object.values(state.players).filter((p) => p.buyBack?.clubId === clubId)
}

/** The ones that can be exercised right now. */
export function liveClausesFor(state: GameState, clubId: ID): Player[] {
  return clausesHeldBy(state, clubId)
    .filter((p) => clauseState(p.buyBack, state.date.season) === 'live')
}

/**
 * What exercising it would be worth: the player's value against the price.
 *
 * Negative means the clause is under water — he has not become what you hoped,
 * and buying him back at the agreed price would be paying over the odds out of
 * sentiment. The screen says so, because a right you should not exercise is
 * still information.
 */
export function clauseUpside(player: Player): number {
  return player.buyBack ? player.value - player.buyBack.price : 0
}

export interface ExerciseOutcome {
  ok: boolean
  message: string
}

/**
 * Bring him back.
 *
 * The clause is a contractual right rather than a negotiation: the holding club
 * pays the agreed price and the selling club has no say, which is the whole
 * point of having one. What it cannot do is override the things that constrain
 * any signing — the money has to be there, and the squad has to have room.
 */
export function exerciseBuyBack(
  state: GameState,
  player: Player,
  buyer: Club,
): ExerciseOutcome {
  const clause = player.buyBack
  if (!clause) return { ok: false, message: `There is no buy-back on ${player.knownAs}.` }
  if (clause.clubId !== buyer.id) {
    return { ok: false, message: 'Another club holds that right.' }
  }
  const status = clauseState(clause, state.date.season)
  if (status === 'waiting') {
    return {
      ok: false,
      message: `The buy-back on ${player.knownAs} does not open until ${clause.fromSeason}.`,
    }
  }
  if (status === 'lapsed') {
    return { ok: false, message: `The buy-back on ${player.knownAs} has lapsed.` }
  }
  if (clause.price > buyer.finances.transferBudget) {
    return {
      ok: false,
      message: `The clause is ${clause.price.toLocaleString()} and the budget will not cover it.`,
    }
  }
  return { ok: true, message: `${player.knownAs} is coming back.` }
}

/**
 * How much of an asking price an AI club will pay for the right when selling.
 *
 * Selling clubs ask for buy-backs on the players they did not want to lose,
 * which in practice means the young and the good. A club offloading a
 * thirty-two-year-old does not ask for one and would look odd doing it.
 */
export function aiWantsBuyBack(rng: Rng, seller: Club, player: Player): number {
  if (player.age > 24) return 0
  if (player.potentialAbility - player.currentAbility < 12) return 0
  const keen = clamp((seller.strategy.youthEmphasis ?? 50) / 100, 0, 1)
  if (!rng.chance(0.25 + keen * 0.35)) return 0
  // Between the floor and comfortably above it, so AI clauses vary the way
  // real ones do rather than all sitting on the same multiple.
  return rng.float(MIN_BUY_BACK_MULTIPLE + 0.2, 3.2)
}

/**
 * The standard clause a buying club will grant, and what having it costs.
 *
 * Two and a half times the fee: comfortably above the floor a buyer will
 * entertain, and low enough that the right is worth holding if he kicks on.
 * Kept here rather than beside the inbox item that offers it, so the price the
 * option quotes and the price the sale creates cannot drift apart.
 */
export function buyBackAskingPrice(fee: number): number {
  return Math.round(fee * 2.5)
}

export function buyBackDiscountedFee(fee: number): number {
  return Math.round(fee * (1 - buyBackConcession(fee, buyBackAskingPrice(fee))))
}
