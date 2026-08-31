import { clamp } from '../rng'
import { capsPremium } from './international'
import type { Club, GameState, League, Nation, Player } from '../types'

/**
 * Market valuation and wage demands.
 *
 * Every price in the game funnels through here — asking prices, scout fee
 * estimates, board budgets, amortisation, the "you could sell him for X" line
 * in the squad view. Keeping one implementation means a player never has two
 * different prices depending on which screen you are looking at.
 */

/**
 * How value scales with ability. Football transfer fees are viciously convex:
 * the gap between a good player and a very good one costs far more than the
 * gap between an average player and a good one, because there are so few of
 * the latter. An exponent around 5 reproduces that shape.
 */
const ABILITY_EXPONENT = 5
const ABILITY_BASE_VALUE = 2_500_000

/**
 * Value multiplier by age. Peaks at 24-26 — old enough to be proven, young
 * enough to have resale value — and falls off a cliff after 31, which is what
 * makes squad-age management an actual problem rather than a stat to admire.
 */
const AGE_VALUE_CURVE: Record<number, number> = {
  15: 0.30, 16: 0.42, 17: 0.55, 18: 0.68, 19: 0.80, 20: 0.90,
  21: 0.98, 22: 1.05, 23: 1.11, 24: 1.15, 25: 1.15, 26: 1.12,
  27: 1.05, 28: 0.95, 29: 0.84, 30: 0.72, 31: 0.58, 32: 0.45,
  33: 0.33, 34: 0.23, 35: 0.15, 36: 0.09, 37: 0.05, 38: 0.03,
  39: 0.02, 40: 0.01,
}

function ageMultiplier(age: number): number {
  if (age <= 15) return AGE_VALUE_CURVE[15]
  if (age >= 40) return AGE_VALUE_CURVE[40]
  return AGE_VALUE_CURVE[age] ?? 0.5
}

/**
 * Compute a player's market value.
 *
 * `reputationContext` is the league the player currently plays in — the same
 * player is worth more in a richer league because that is where the buyers
 * with money are, and because his output is better evidenced.
 */
export function computeValue(
  player: Player,
  league: League | null,
  nation: Nation | null,
  currentSeason: number,
): number {
  const ability = clamp(player.currentAbility, 1, 200)
  let value = Math.pow(ability / 100, ABILITY_EXPONENT) * ABILITY_BASE_VALUE
  value *= ageMultiplier(player.age)

  // Potential premium. A 19-year-old rated 110 with a ceiling of 175 is priced
  // on what he might become, not what he is — that is the whole youth market.
  if (player.age <= 25) {
    const headroom = Math.max(0, player.potentialAbility - player.currentAbility)
    const yearsToDevelop = Math.max(0, 26 - player.age)
    const premium = (headroom / 100) * (yearsToDevelop / 10) * 2.4
    value *= 1 + premium
  }

  // Caps. A player who has a good summer costs more to keep and is worth more
  // to sell, and the number never comes back down — which is the single most
  // reliably real thing about this market.
  value *= capsPremium(player.caps ?? 0)

  // And what a good tournament did on top of them, while it lasts. This one
  // decays, which is the difference: the caps are a fact about his career, the
  // summer is a mood the market is in about him.
  value *= 1 + (player.tournamentStock ?? 0)

  // Market context: rich leagues pay more for the same player.
  const leagueFactor = league ? 0.55 + (league.reputation / 100) * 0.85 : 0.7
  const economyFactor = nation ? nation.economyFactor : 1
  value *= leagueFactor * (0.7 + economyFactor * 0.3)

  // Contract situation. A player in the last year of his deal loses most of his
  // fee, and a player out of contract is free. This is the pressure that makes
  // the renewals screen matter.
  if (player.contract) {
    const seasonsLeft = player.contract.expiresSeason - currentSeason
    if (seasonsLeft <= 0) value *= 0.18
    else if (seasonsLeft === 1) value *= 0.55
    else if (seasonsLeft === 2) value *= 0.85
    else if (seasonsLeft >= 4) value *= 1.08
  } else {
    value = 0 // free agent: no fee, only wages
  }

  // Form and morale move the price at the margins, the way real interest does.
  value *= 0.9 + (player.form / 100) * 0.2
  if (player.transferRequested) value *= 0.88
  if (player.injury && player.injury.weeksRemaining > 8) value *= 0.75

  return Math.max(0, Math.round(value / 1000) * 1000)
}

/**
 * What the player would demand, per week, to sign a new contract.
 *
 * Deliberately steeper in ability than value is in *relative* terms at the top
 * end, because elite wages are set by a handful of clubs bidding against each
 * other rather than by any notion of worth.
 */
export function computeWageDemand(
  player: Player,
  league: League | null,
  nation: Nation | null,
): number {
  const ability = clamp(player.currentAbility, 1, 200)
  let wage = Math.pow(ability / 100, 4.5) * 6_000

  // Young players with big ceilings command more than their output justifies.
  if (player.age <= 23) {
    const headroom = Math.max(0, player.potentialAbility - player.currentAbility)
    wage *= 1 + (headroom / 100) * 0.5
  }
  // Veterans take a discount as options thin out, unless they are still elite.
  if (player.age >= 32) wage *= clamp(1 - (player.age - 31) * 0.07, 0.5, 1)

  // An international knows what he is, and so does his agent. The same curve
  // as the valuation, so a good summer moves the price and the wage together
  // — which is exactly what makes it expensive to keep him.
  wage *= capsPremium(player.caps ?? 0)
  // His agent read the same newspapers, and asks before the mood passes.
  wage *= 1 + (player.tournamentStock ?? 0) * 0.7

  // How much a division pays for the same player.
  //
  // Recalibrated when the squad-cost rule was built and immediately showed
  // that nobody could break it. Wages were 22% of revenue in the top flight
  // and 44% in non-league, against a real range of roughly 55-75% everywhere,
  // and clubs were sitting on hundreds of millions they had no way to spend.
  // The slope is steeper than the old one because the error was worst at the
  // top: a division's ability to pay rises far faster than its standing does.
  const leagueFactor = league ? 0.04 + (league.reputation / 100) * 4.96 : 1.3
  const economyFactor = nation ? nation.economyFactor : 1
  wage *= leagueFactor * economyFactor

  // Personality. A mercenary wants more money and cares less where; an
  // ambitious player will take less at a club going somewhere.
  if (player.traits.includes('mercenary')) wage *= 1.25
  if (player.traits.includes('loyal')) wage *= 0.9
  if (player.ambitionVsMoney > 70) wage *= 1.12
  if (player.ambitionVsMoney < 30) wage *= 0.94

  return Math.max(250, Math.round(wage / 50) * 50)
}

/**
 * The fee a selling club would actually accept, as opposed to the book value.
 * Clubs mark up above value — more so when they do not want to sell, when the
 * player is under a long contract, and when the buyer is rich.
 */
export function computeAskingPrice(
  state: GameState,
  player: Player,
  sellingClub: Club,
  buyingClub: Club | null,
): number {
  const base = player.value
  if (base <= 0) return 0

  let multiplier = 1.25

  // A club that does not need the money and rates the player highly will price
  // him out of the market rather than say no.
  const importance = squadImportance(state, player, sellingClub)
  multiplier += importance * 0.9

  // Selling-club stance: a selling club prices to move, a big club does not.
  multiplier -= (sellingClub.strategy.sellingClubStance / 100) * 0.35

  // Financial distress makes clubs reasonable very quickly.
  if (sellingClub.finances.inCrisis) multiplier *= 0.7
  else if (sellingClub.finances.balance < 0) multiplier *= 0.85

  if (player.transferRequested) multiplier *= 0.8
  if (player.listedForTransfer) multiplier *= 0.75

  // Contract leverage runs both ways.
  if (player.contract) {
    const seasonsLeft = player.contract.expiresSeason - state.date.season
    if (seasonsLeft <= 1) multiplier *= 0.8
    if (seasonsLeft >= 4) multiplier *= 1.15
  }

  // The rich-buyer tax. Everyone charges the wealthy more, and everyone knows.
  if (buyingClub) {
    const wealthGap = buyingClub.reputation - sellingClub.reputation
    if (wealthGap > 15) multiplier *= 1 + Math.min(0.35, wealthGap / 150)
  }

  const price = base * clamp(multiplier, 0.5, 3.2)
  return Math.round(price / 10_000) * 10_000
}

/**
 * 0-1 measure of how central a player is to his club: used for asking prices,
 * for how badly morale drops if he is sold, and for media interest.
 */
export function squadImportance(state: GameState, player: Player, club: Club): number {
  // Counted rather than sorted.
  //
  // This built an array of the squad, filtered it, copied it and sorted it on
  // every call, and it is called for every candidate in every transfer the AI
  // considers — 16% of the entire tick between the sort and its comparator.
  // A player's rank is just how many team-mates are better than him, which is
  // one pass and no allocation at all. The answer is identical except among
  // equal abilities, where counting gives the better rank rather than whichever
  // one the sort happened to leave first.
  let better = 0
  let size = 0
  let present = false
  for (const id of club.squad) {
    const other = state.players[id]
    if (!other || other.isAcademy) continue
    size += 1
    if (other.id === player.id) present = true
    else if (other.currentAbility > player.currentAbility) better += 1
  }

  if (size === 0) return 0.5
  if (!present) return 0.2

  // Top of the squad is 1.0, falling away through the first team.
  return clamp(1 - better / Math.max(11, size * 0.7), 0, 1)
}

/** Total weekly wage bill for a club, including staff. */
export function totalWageBill(state: GameState, club: Club): number {
  let total = 0
  for (const id of club.squad) {
    const p = state.players[id]
    if (!p?.contract) continue
    // Out on loan: the parent pays only the share it agreed to keep.
    total += p.loanClubId ? p.contract.wage * p.loanWageShare : p.contract.wage
  }
  // Borrowed players: this club pays whatever the parent did not.
  for (const id of club.loanedIn) {
    const p = state.players[id]
    if (!p?.contract) continue
    total += p.contract.wage * (1 - p.loanWageShare)
  }
  for (const id of club.staff) {
    const s = state.staff[id]
    if (s?.contract) total += s.contract.wage
  }
  return Math.round(total)
}

/** Format a currency amount compactly for a phone-sized display. */
export function formatMoney(amount: number, currency = 'GBP'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '£'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}bn`
  if (abs >= 1_000_000) {
    // Football money is written "£45m" and "£1.5m" — a decimal place is
    // meaningful at one million and noise at forty-five.
    const m = abs / 1_000_000
    return `${sign}${symbol}${m >= 10 ? m.toFixed(0) : m.toFixed(1)}m`
  }
  if (abs >= 1_000) return `${sign}${symbol}${Math.round(abs / 1_000)}k`
  return `${sign}${symbol}${Math.round(abs)}`
}

/** Weekly wages are shown per week, not abbreviated into millions. */
export function formatWage(amount: number, currency = 'GBP'): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '£'
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(amount >= 10_000 ? 0 : 1)}k`
  return `${symbol}${Math.round(amount)}`
}
