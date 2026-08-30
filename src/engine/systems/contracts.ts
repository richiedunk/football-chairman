import { clamp, Rng } from '../rng'
import { computeValue, computeWageDemand, squadImportance, totalWageBill } from './valuation'
import { releaseRegistration } from './registration'
import { writeOffBookValue } from './finance'
import { adjustForPlayer } from './agents'
import type { Club, Contract, GameState, Player, SquadStatus } from '../types'

/**
 * Contracts and renewals.
 *
 * The quiet system that ruins careless directors of football. Players run
 * their deals down and leave for nothing; a squad renewed carelessly ends up
 * with six players on wages the club cannot sustain and no way to move them
 * on. Contract length is the single biggest lever over a squad's future value,
 * and none of it produces a headline until it is too late.
 */

export interface RenewalOffer {
  wage: number
  seasons: number
  signingBonus: number
  releaseClause: number | null
  appearanceFee: number
  goalBonus: number
  loyaltyBonus: number
  /** Status the club is promising, which the player will hold you to. */
  promisedStatus: SquadStatus
}

export interface RenewalResponse {
  accepted: boolean
  message: string
  /** What he would accept, if he rejected. */
  counter?: RenewalOffer
}

/**
 * Evaluate a renewal offer. The player weighs wages against status, ambition
 * and how he has been treated — a player who has been left out all season will
 * want considerably more than the market rate to stay.
 */
export function evaluateRenewal(
  state: GameState,
  club: Club,
  player: Player,
  offer: RenewalOffer,
  rng: Rng,
): RenewalResponse {
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const marketWage = computeWageDemand(player, league, nation)

  // What he actually wants, adjusted for how the club has treated him.
  let demanded = marketWage
  if (player.morale < 40) demanded *= 1.15
  if (player.morale > 75) demanded *= 0.95
  const importance = squadImportance(state, player, club)
  if (importance > 0.8) demanded *= 1.12
  if (player.traits.includes('mercenary')) demanded *= 1.15
  if (player.traits.includes('loyal')) demanded *= 0.9
  // Long deals cost more per week for an older player and less for a young one.
  if (player.age >= 31 && offer.seasons >= 3) demanded *= 1.18
  if (player.age <= 22 && offer.seasons >= 4) demanded *= 0.94

  const wageRatio = offer.wage / Math.max(1, demanded)

  // Status promises carry real weight — more than a small wage increase.
  const statusValue = statusScore(offer.promisedStatus) - statusScore(player.squadStatus)
  const statusBonus = statusValue * 0.06

  // Bonuses and clauses are worth something, but less than headline wage.
  const extras =
    (offer.signingBonus / Math.max(1, marketWage * 52)) * 0.15
    + (offer.loyaltyBonus / Math.max(1, marketWage * 52)) * 0.1
    + (offer.releaseClause !== null && offer.releaseClause < player.value * 1.4 ? 0.08 : 0)

  const satisfaction = wageRatio + statusBonus + extras + rng.float(-0.04, 0.04)

  if (satisfaction >= 1) {
    return { accepted: true, message: `${player.knownAs} is happy to sign.` }
  }

  const counterWage = Math.round((demanded * rng.float(1.0, 1.08)) / 50) * 50
  const counter: RenewalOffer = {
    ...offer,
    wage: counterWage,
    promisedStatus: statusValue < 0 ? player.squadStatus : offer.promisedStatus,
  }

  let message: string
  if (wageRatio < 0.7) {
    message = `${player.knownAs} considers the offer well short of his worth.`
  } else if (statusValue < 0) {
    message = `${player.knownAs} will not sign for a lesser role in the squad.`
  } else {
    message = `${player.knownAs} is close, but wants more.`
  }

  return { accepted: false, message, counter }
}

/** Apply an accepted renewal. */
export function applyRenewal(
  state: GameState,
  club: Club,
  player: Player,
  offer: RenewalOffer,
): void {
  const contract: Contract = {
    wage: Math.round(offer.wage),
    expiresSeason: state.date.season + offer.seasons,
    signingBonus: offer.signingBonus,
    releaseClause: offer.releaseClause,
    appearanceFee: offer.appearanceFee,
    goalBonus: offer.goalBonus,
    loyaltyBonus: offer.loyaltyBonus,
    inNegotiation: false,
    weeksSinceRenewalRequest: 0,
  }
  player.contract = contract
  player.desiredStatus = offer.promisedStatus
  player.morale = clamp(player.morale + 10, 1, 100)
  player.loyalty = clamp(player.loyalty + 4, 1, 100)

  club.finances.balance -= offer.signingBonus
  club.finances.season.otherCosts += offer.signingBonus

  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  player.value = computeValue(player, league, nation, state.date.season)

  // His agent takes a view on how the club treats the people he represents.
  adjustForPlayer(state, club.id, player, 'renewedClient')
}

/** A sensible opening offer, so the UI can pre-fill the renewal screen. */
export function suggestRenewal(
  state: GameState,
  club: Club,
  player: Player,
): RenewalOffer {
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const marketWage = computeWageDemand(player, league, nation)

  // Contract length follows age: long deals for young players so their value
  // is protected, short ones for players approaching decline.
  // Clubs stop committing to players past thirty: a thirty-three-year-old
  // gets a year at a time, which is both how it works and what keeps a squad
  // from silently ageing into a retirement home on the back of three-year
  // deals signed when everyone was thirty.
  const seasons = player.age <= 23 ? 5
    : player.age <= 27 ? 4
    : player.age <= 30 ? 3
    : player.age <= 32 ? 2
    : 1

  return {
    wage: Math.round(marketWage / 50) * 50,
    seasons,
    signingBonus: Math.round(marketWage * 4),
    releaseClause: player.age <= 25 ? Math.round((player.value * 2.2) / 100_000) * 100_000 : null,
    appearanceFee: Math.round(marketWage * 0.08),
    goalBonus: player.position === 'ST' || player.position === 'AM' ? Math.round(marketWage * 0.3) : 0,
    loyaltyBonus: Math.round(marketWage * 2),
    promisedStatus: player.squadStatus,
  }
}

function statusScore(status: SquadStatus): number {
  switch (status) {
    case 'star': return 5
    case 'firstTeam': return 4
    case 'rotation': return 3
    case 'backup': return 2
    case 'prospect': return 1
    case 'surplus': return 0
  }
}

/**
 * Weekly contract pass. Surfaces expiring deals before they become a crisis,
 * and lets players start agitating when they have been ignored.
 */
export function processContracts(
  state: GameState,
  club: Club,
  rng: Rng,
): { player: Player; message: string; urgent: boolean }[] {
  const alerts: { player: Player; message: string; urgent: boolean }[] = []
  const season = state.date.season

  for (const id of club.squad) {
    const player = state.players[id]
    if (!player?.contract) continue

    const seasonsLeft = player.contract.expiresSeason - season
    player.contract.weeksSinceRenewalRequest += 1

    // Expiring this season, and nothing happening.
    if (seasonsLeft <= 0 && !player.contract.inNegotiation) {
      // Once inside the final six months a player can talk to other clubs, and
      // his sale value collapses — the moment the neglect starts costing money.
      if (state.date.week >= 26 && state.date.week <= 30 && rng.chance(0.25)) {
        alerts.push({
          player,
          message: `${player.knownAs} is now free to negotiate with other clubs. If nothing is agreed he leaves for nothing in the summer.`,
          urgent: true,
        })
      } else if (player.contract.weeksSinceRenewalRequest > 8 && rng.chance(0.12)) {
        alerts.push({
          player,
          message: `${player.knownAs}'s contract expires at the end of the season. He is waiting to hear from the club.`,
          urgent: squadImportance(state, player, club) > 0.6,
        })
        player.contract.weeksSinceRenewalRequest = 0
      }
    } else if (seasonsLeft === 1 && player.contract.weeksSinceRenewalRequest > 16 && rng.chance(0.06)) {
      alerts.push({
        player,
        message: `${player.knownAs} has a year left on his deal and would like to discuss an extension.`,
        urgent: false,
      })
      player.contract.weeksSinceRenewalRequest = 0
    }

    // A player massively outperforming his contract wants it fixed.
    const marketWage = player.wageDemand
    if (
      player.contract.wage < marketWage * 0.6
      && player.form > 72
      && player.contract.weeksSinceRenewalRequest > 12
      && rng.chance(0.08)
    ) {
      alerts.push({
        player,
        message: `${player.knownAs} has been outstanding and is earning well below his market value. His agent has been in touch.`,
        urgent: false,
      })
      player.contract.weeksSinceRenewalRequest = 0
    }
  }

  return alerts
}

/** Release a player, paying up the remainder of his deal. */
export function releasePlayer(
  state: GameState,
  club: Club,
  player: Player,
): { ok: true; cost: number } | { ok: false; error: string } {
  if (player.clubId !== club.id) return { ok: false, error: 'That player is not at this club.' }
  if (!player.contract) {
    club.squad = club.squad.filter((id) => id !== player.id)
    releaseRegistration(club, player.id)
    player.clubId = null
    return { ok: true, cost: 0 }
  }

  const seasonsLeft = Math.max(0, player.contract.expiresSeason - state.date.season)
  const weeksLeft = seasonsLeft * 52 + (52 - state.date.week)
  // Settlements are negotiated down; nobody pays the full remaining term.
  const cost = Math.round(player.contract.wage * weeksLeft * 0.55)

  if (cost > club.finances.balance) {
    return { ok: false, error: 'The club cannot afford to pay up the remainder of his contract.' }
  }

  club.finances.balance -= cost
  club.finances.season.otherCosts += cost
  adjustForPlayer(state, club.id, player, 'releasedClient')
  writeOffBookValue(state, player)
  club.squad = club.squad.filter((id) => id !== player.id)
  releaseRegistration(club, player.id)
  player.clubId = null
  player.contract = null
  player.value = 0

  return { ok: true, cost }
}

/** Total committed wages, for the finance screen's forward view. */
export function committedWages(state: GameState, club: Club, seasonsAhead: number): number {
  const targetSeason = state.date.season + seasonsAhead
  let total = 0
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player?.contract) continue
    if (player.contract.expiresSeason >= targetSeason) total += player.contract.wage
  }
  return total
}

/** Players whose contracts expire within `seasons`, worst-first by importance. */
export function expiringContracts(
  state: GameState,
  club: Club,
  seasons = 1,
): { player: Player; seasonsLeft: number; importance: number }[] {
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && Boolean(p.contract))
    .map((p) => ({
      player: p,
      seasonsLeft: p.contract!.expiresSeason - state.date.season,
      importance: squadImportance(state, p, club),
    }))
    .filter((e) => e.seasonsLeft <= seasons)
    .sort((a, b) => b.importance - a.importance)
}

/** Whether the wage budget has room for a given weekly wage. */
export function wageHeadroom(state: GameState, club: Club): number {
  return club.finances.wageBudget - totalWageBill(state, club)
}
