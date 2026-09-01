import { clamp, Rng } from '../rng'
import { IdFactory } from '../ids'
import { computeAskingPrice, computeWageDemand } from './valuation'
import { wageHeadroom } from './contracts'
import { moveAppeal } from './transfers'
import { addInboxItem, addNews } from './inbox'
import { seniorSquad } from './aiSquad'
import { agentFor } from './agents'
import type { Club, GameState, ID, Player } from '../types'

/**
 * Deadline day.
 *
 * The last week of a window, played at a different speed to everything else.
 * For eleven weeks a transfer has been a negotiation you could think about
 * between fixtures; on the last day it becomes a series of things happening to
 * you with an hour to answer.
 *
 * The mechanics that make it feel different are all real ones rather than
 * theatre. Selling clubs that would not discuss a price in July become
 * reasonable when the alternative is losing him for nothing in six months.
 * Rivals hijack deals that are all but done. And every offer has a clock on
 * it, so the cost of thinking about it is the deal.
 */

/** The final week of each window. */
export const SUMMER_DEADLINE_WEEK = 5
export const WINTER_DEADLINE_WEEK = 30

export function isDeadlineWeek(week: number): boolean {
  return week === SUMMER_DEADLINE_WEEK || week === WINTER_DEADLINE_WEEK
}

/** Hours left in the day, purely for the fiction of the countdown. */
export function hoursRemaining(slot: number, total: number): number {
  return Math.max(1, Math.round(24 - (slot / Math.max(1, total)) * 23))
}

export interface DeadlineOpportunity {
  kind: 'available' | 'approach' | 'hijack'
  playerId: ID
  playerName: string
  /** The club selling, or holding the player. */
  clubId: ID | null
  clubName: string
  fee: number
  wage: number
  /** Hours before the offer lapses, for the fiction. */
  hours: number
  note: string
}

/**
 * How much a selling club softens on the last day.
 *
 * A player with a year left is worth far less in six months and the seller
 * knows it, which is why the deadline discount is steepest exactly where the
 * contract is shortest. This is the one mechanic that makes waiting a strategy
 * rather than a mistake.
 */
export function deadlineDiscount(state: GameState, player: Player): number {
  const seasonsLeft = player.contract
    ? player.contract.expiresSeason - state.date.season
    : 0
  const contractPressure = seasonsLeft <= 0 ? 0.45
    : seasonsLeft === 1 ? 0.3
    : seasonsLeft === 2 ? 0.14
    : 0.06
  const unwanted = player.squadStatus === 'surplus' ? 0.14
    : player.transferRequested || player.listedForTransfer ? 0.1
    : 0
  return clamp(contractPressure + unwanted, 0, 0.6)
}

/**
 * What comes across the desk in the last hours of a window.
 *
 * Deliberately generated fresh rather than drawn from the shortlist: half the
 * character of the day is players you had not been watching becoming available
 * because somebody else's deal fell through.
 */
export function generateOpportunities(
  state: GameState,
  club: Club,
  rng: Rng,
  limit = 5,
): DeadlineOpportunity[] {
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  if (!league) return []

  const wageRoom = wageHeadroom(state, club)
  const squad = seniorSquad(state, club)
  const out: DeadlineOpportunity[] = []

  const candidates = Object.values(state.players).filter((p) => {
    if (p.clubId === club.id || p.isAcademy || p.loanClubId) return false
    if (p.currentAbility < club.reputation * 0.95) return false
    if (p.currentAbility > club.reputation * 1.7) return false
    return true
  })
  if (candidates.length === 0) return []

  const shortlisted = rng.shuffle(candidates).slice(0, 60)
  for (const player of shortlisted) {
    if (out.length >= limit) break

    const seller = player.clubId ? state.clubs[player.clubId] ?? null : null
    if (seller?.id === state.playerClubId) continue

    const discount = deadlineDiscount(state, player)
    const asking = seller ? computeAskingPrice(state, player, seller, club) : 0
    const fee = Math.round(asking * (1 - discount))
    const wage = Math.round(computeWageDemand(player, league, nation))

    if (fee > club.finances.transferBudget) continue
    if (wage > Math.max(0, wageRoom)) continue
    if (moveAppeal(state, player, club) < 0.4) continue

    // A hijack: a player who is on the point of joining somebody else.
    const beingSigned = player.interestedClubIds.length > 0 && rng.chance(0.3)
    const kind: DeadlineOpportunity['kind'] = beingSigned ? 'hijack'
      : discount > 0.28 ? 'available'
      : 'approach'

    const agent = agentFor(state, player)
    const note = kind === 'hijack'
      ? 'He is at another club\'s training ground having a medical. His agent will take a better offer.'
      : !seller
        // A free agent has no club to have given up on him, and saying one has
        // reads as a bug rather than as colour.
        ? 'Out of contract and still unattached with hours to go. He will sign for somebody tonight.'
        : discount > 0.28
          ? `${seller.name} have given up on getting a fee for him and will take what they can.`
          : agent
            ? `${agent.name} says his client would move today for the right terms.`
            : 'He would move today for the right terms.'

    out.push({
      kind,
      playerId: player.id,
      playerName: player.knownAs,
      clubId: seller?.id ?? null,
      clubName: seller?.name ?? 'Free agent',
      fee,
      wage,
      hours: 0,
      note,
    })
  }

  void squad
  // The clock is assigned after sorting so it counts down the list. Stamping
  // it before meant the hours jumped about — 24, then 10, then 19 — which
  // reads as noise rather than as a day running out.
  const ordered = out.sort((a, b) => b.fee - a.fee)
  return ordered.map((offer, index) => ({
    ...offer,
    hours: hoursRemaining(index, ordered.length),
  }))
}

/**
 * Offers for your own players, which arrive on the same clock.
 *
 * The deadline cuts both ways: the club that would not meet your valuation in
 * July is back with an hour to go, and the answer has to be now.
 */
export function generateDeadlineBids(
  state: GameState,
  club: Club,
  ids: IdFactory,
  rng: Rng,
): string[] {
  const notices: string[] = []
  const squad = seniorSquad(state, club).filter((p) => !p.loanClubId)
  if (squad.length <= 18) return notices

  for (const player of squad) {
    if (out(notices)) break
    if (!rng.chance(0.05)) continue

    const suitors = Object.values(state.clubs).filter(
      (c) => c.id !== club.id
        && !c.finances.inCrisis
        && c.reputation > club.reputation - 12
        && c.finances.transferBudget >= player.value,
    )
    if (suitors.length === 0) continue
    const buyer = rng.pick(suitors)
    // Deadline bids come in above the odds, because the buyer has run out of
    // alternatives too.
    const fee = Math.round(computeAskingPrice(state, player, club, buyer) * rng.float(1.0, 1.35))

    addInboxItem(state, ids, {
      category: 'transfer',
      subject: `Deadline-day bid for ${player.knownAs}`,
      from: 'Recruitment',
      body: `${buyer.name} have bid ${fee.toLocaleString()} for ${player.knownAs}, and they want an `
        + 'answer before the window shuts. There is no time to go back to them for more.',
      urgent: true,
      decision: {
        prompt: `${buyer.name} bid ${fee.toLocaleString()}. The window shuts in hours.`,
        options: [
          { id: 'accept', label: 'Accept', hint: 'Take the money and move on.', available: true },
          { id: 'reject', label: 'Reject', hint: 'Keep him and lose the fee.', available: true },
        ],
        defaultOptionId: 'reject',
      },
      payload: {
        kind: 'transferOffer',
        playerId: player.id,
        buyerId: buyer.id,
        fee,
      },
      link: { view: 'squad' },
    })
    notices.push(`${buyer.name} have bid for ${player.knownAs}.`)
  }

  return notices
}

function out(notices: string[]): boolean {
  return notices.length >= 2
}

/**
 * The world's own deadline-day business.
 *
 * Deals that have been drifting all window get done in the last hours, which
 * is what makes the day look like deadline day from the outside as well as
 * from your own desk.
 */
export function runWorldDeadline(state: GameState, ids: IdFactory, rng: Rng): void {
  const done: { text: string; clubId: string }[] = []
  for (const club of Object.values(state.clubs)) {
    if (club.id === state.playerClubId) continue
    if (!rng.chance(0.04)) continue
    const squad = seniorSquad(state, club)
    const spare = squad.filter((p) => p.squadStatus === 'surplus' || p.listedForTransfer)
    if (spare.length === 0) continue
    done.push({
      text: `${club.name} are trying to move ${rng.pick(spare).knownAs} before the window shuts.`,
      clubId: club.id,
    })
    if (done.length >= 3) break
  }
  for (const line of done) {
    addNews(state, ids, 'transfer', line.text, { view: 'transfers' }, line.clubId)
  }
}
