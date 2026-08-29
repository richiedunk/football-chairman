import { clamp, Rng } from '../rng'
import { weeklyRevenue } from './finance'
import { totalWageBill, formatMoney } from './valuation'
import { levelFor } from './career'
import type { Club, GameState, BoardMandate } from '../types'

/**
 * Asking the board for things.
 *
 * The board is not only a scoreboard that judges you — it is a party you
 * negotiate with. Money can be released, budgets raised, projects underwritten
 * and expectations renegotiated, but every request spends the same currency:
 * their confidence in you. A director who asks for everything the moment he
 * arrives gets less than one who banks a good half-season first.
 *
 * Requests are rate-limited by design. Without a cooldown the optimal play is
 * to ask every week until something lands, which is not a decision.
 */

export type BoardRequestKind =
  | 'transferFunds'
  | 'wageBudget'
  | 'fundFacility'
  | 'fundStadium'
  | 'lowerExpectation'
  | 'moreTime'
  | 'dismissCoach'
  | 'takeLoan'

export interface BoardRequestOption {
  kind: BoardRequestKind
  label: string
  description: string
  /** What it will cost you in board confidence if refused. */
  risk: 'low' | 'medium' | 'high'
  /** Whether it can be asked at all right now. */
  available: boolean
  unavailableReason?: string
  /** Requests that involve a sum: the largest that can sensibly be asked. */
  maxAmount?: number
  suggestedAmount?: number
}

export interface BoardResponse {
  outcome: 'granted' | 'partial' | 'refused'
  message: string
  /** Amount actually released, where relevant. */
  amount?: number
  confidenceChange: number
}

/** Weeks between formal requests. */
const REQUEST_COOLDOWN = 6
/** Requests a board will entertain in one season before it starts to grate. */
const REQUESTS_BEFORE_IRRITATION = 3

export function weeksUntilNextRequest(state: GameState, club: Club): number {
  return Math.max(0, REQUEST_COOLDOWN - (state.date.week - club.board.lastRequestWeek))
}

/**
 * What can be asked right now, and what each would cost. Unavailable options
 * are returned with a reason rather than hidden, so the board screen reads as
 * a relationship with rules rather than a menu that silently changes.
 */
export function availableRequests(state: GameState, club: Club): BoardRequestOption[] {
  const cooldown = weeksUntilNextRequest(state, club)
  const onCooldown = cooldown > 0
  const cooldownReason = `The board will not entertain another request for ${cooldown} week${cooldown === 1 ? '' : 's'}.`

  const revenue = weeklyRevenue(state, club)
  const reserves = Math.max(0, club.finances.balance)
  const coach = club.headCoachId ? state.staff[club.headCoachId] : null

  const gate = (extra?: { ok: boolean; reason: string }): { available: boolean; unavailableReason?: string } => {
    if (onCooldown) return { available: false, unavailableReason: cooldownReason }
    if (extra && !extra.ok) return { available: false, unavailableReason: extra.reason }
    return { available: true }
  }

  return [
    {
      kind: 'transferFunds',
      label: 'Ask for transfer funds',
      description: 'Release money from reserves into the transfer budget.',
      risk: 'low',
      maxAmount: Math.round(reserves * 0.6),
      suggestedAmount: Math.round(reserves * 0.25),
      ...gate(
        club.finances.inCrisis
          ? { ok: false, reason: 'There is nothing to release while the club is in crisis.' }
          : reserves < revenue
            ? { ok: false, reason: 'The club has no meaningful reserves to draw on.' }
            : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'wageBudget',
      label: 'Ask to raise the wage budget',
      description: 'A permanent increase in what the club will carry in wages.',
      risk: 'medium',
      maxAmount: Math.round(club.finances.wageBudget * 0.4),
      suggestedAmount: Math.round(club.finances.wageBudget * 0.12),
      ...gate(
        totalWageBill(state, club) < club.finances.wageBudget * 0.85
          ? { ok: false, reason: 'You are not close enough to the current ceiling to justify it.' }
          : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'fundFacility',
      label: 'Ask the board to fund a facility upgrade',
      description: 'The board underwrites the next upgrade rather than the club paying for it.',
      risk: 'medium',
      ...gate(
        club.facilities.projects.length > 0
          ? { ok: false, reason: 'Work is already under way. Finish it first.' }
          : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'fundStadium',
      label: 'Ask for a stadium expansion',
      description: 'A major capital project, underwritten by the board.',
      risk: 'high',
      ...gate(
        club.facilities.stadiumProject
          ? { ok: false, reason: 'Building work is already under way at the ground.' }
          : club.reputation < 25
            ? { ok: false, reason: 'A club this size cannot fill the seats it already has.' }
            : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'lowerExpectation',
      label: 'Ask them to be realistic',
      description: 'Argue the target is beyond this squad. Lowers what you are judged against.',
      risk: 'high',
      ...gate(
        club.board.expectation.leaguePosition >= (state.leagues[club.leagueId]?.clubIds.length ?? 20) - 2
          ? { ok: false, reason: 'They already expect nothing more than survival.' }
          : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'moreTime',
      label: 'Ask for more time',
      description: 'Make the case that the plan needs longer. Withdraws a warning.',
      risk: 'high',
      ...gate(
        club.board.warnings === 0
          ? { ok: false, reason: 'You are not under any formal warning.' }
          : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'dismissCoach',
      label: 'Recommend dismissing the head coach',
      description: 'Put the case that the coach has to go. The board decides, and it becomes your call to answer for.',
      risk: 'high',
      ...gate(
        !coach
          ? { ok: false, reason: 'There is no head coach to dismiss.' }
          : { ok: true, reason: '' },
      ),
    },
    {
      kind: 'takeLoan',
      label: 'Ask to borrow against future revenue',
      description: 'Cash now, repaid weekly with interest. A last resort.',
      risk: 'medium',
      maxAmount: Math.round(revenue * 30),
      suggestedAmount: Math.round(revenue * 10),
      ...gate(
        club.finances.debt > revenue * 25
          ? { ok: false, reason: 'The club is already carrying as much debt as it can service.' }
          : { ok: true, reason: '' },
      ),
    },
  ]
}

/**
 * Put a request to the board.
 *
 * Success turns on their confidence in you, how much you are asking for
 * relative to the club's means, how recently you last asked, and your standing
 * in the game. Refusals cost confidence — asking is never free, which is what
 * makes choosing the moment part of the job.
 */
export function makeRequest(
  state: GameState,
  club: Club,
  kind: BoardRequestKind,
  rng: Rng,
  amount = 0,
): BoardResponse {
  const option = availableRequests(state, club).find((o) => o.kind === kind)
  if (!option) return { outcome: 'refused', message: 'That is not something you can ask for.', confidenceChange: 0 }
  if (!option.available) {
    return {
      outcome: 'refused',
      message: option.unavailableReason ?? 'The board will not discuss it.',
      confidenceChange: 0,
    }
  }

  club.board.lastRequestWeek = state.date.week
  club.board.requestsThisSeason += 1

  // Base willingness. Confidence dominates; a director with a reputation gets
  // more benefit of the doubt; a board asked repeatedly gets tired of it.
  const fatigue = Math.max(0, club.board.requestsThisSeason - REQUESTS_BEFORE_IRRITATION) * 0.12
  const standing = (levelFor(state.director.xp).level - 1) * 0.02
  let willingness = clamp(
    (club.board.confidence / 100) * 0.85 + standing - fatigue,
    0.03,
    0.95,
  )

  const riskPenalty = option.risk === 'high' ? 0.28 : option.risk === 'medium' ? 0.14 : 0.04
  willingness -= riskPenalty

  // Asking for a lot is harder than asking for a little.
  if (option.maxAmount && amount > 0) {
    willingness -= (amount / Math.max(1, option.maxAmount)) * 0.35
  }

  willingness = clamp(willingness, 0.02, 0.95)
  const roll = rng.next()

  // A near miss becomes a partial grant rather than a flat no — a board that
  // meets you halfway is far more interesting than one that only ever says
  // yes or no.
  if (roll < willingness) return grant(state, club, kind, amount, 1, rng)
  if (roll < willingness + 0.2 && option.maxAmount && amount > 0) {
    return grant(state, club, kind, amount, rng.float(0.35, 0.65), rng)
  }

  const confidenceChange = -(option.risk === 'high' ? 5 : option.risk === 'medium' ? 3 : 1.5)
  club.board.confidence = clamp(club.board.confidence + confidenceChange, 0, 100)
  return {
    outcome: 'refused',
    message: refusalMessage(kind, club),
    confidenceChange,
  }
}

function grant(
  state: GameState,
  club: Club,
  kind: BoardRequestKind,
  amount: number,
  fraction: number,
  rng: Rng,
): BoardResponse {
  const currency = state.settings.currency
  const granted = Math.round(amount * fraction)
  const partial = fraction < 1
  // Getting what you asked for costs a little goodwill; the board has spent
  // something to give it to you.
  const confidenceChange = -1
  club.board.confidence = clamp(club.board.confidence + confidenceChange, 0, 100)

  switch (kind) {
    case 'transferFunds':
      club.finances.transferBudget += granted
      return {
        outcome: partial ? 'partial' : 'granted',
        message: partial
          ? `The board release ${formatMoney(granted, currency)} — less than you asked for, but something.`
          : `The board release ${formatMoney(granted, currency)} into the transfer budget.`,
        amount: granted,
        confidenceChange,
      }

    case 'wageBudget':
      club.finances.wageBudget += granted
      return {
        outcome: partial ? 'partial' : 'granted',
        message: `The wage ceiling rises by ${formatMoney(granted, currency)} a week.`,
        amount: granted,
        confidenceChange,
      }

    case 'takeLoan':
      club.finances.balance += granted
      club.finances.debt += granted
      return {
        outcome: partial ? 'partial' : 'granted',
        message: `${formatMoney(granted, currency)} borrowed. It will be repaid weekly, with interest.`,
        amount: granted,
        confidenceChange,
      }

    case 'fundFacility': {
      // The board pays: the next upgrade the club starts costs it nothing.
      club.finances.balance += estimatedUpgradeGrant(state, club)
      return {
        outcome: 'granted',
        message: `The board will underwrite the work. ${formatMoney(estimatedUpgradeGrant(state, club), currency)} has been made available — start the upgrade from the facilities screen.`,
        amount: estimatedUpgradeGrant(state, club),
        confidenceChange,
      }
    }

    case 'fundStadium': {
      const grantAmount = Math.round(weeklyRevenue(state, club) * 60)
      club.finances.balance += grantAmount
      if (!club.board.mandates.includes('improveFacilities')) {
        club.board.mandates.push('improveFacilities' as BoardMandate)
      }
      return {
        outcome: 'granted',
        message: `The board have approved a capital injection of ${formatMoney(grantAmount, currency)} for the ground. Appoint an architect and get the work under way.`,
        amount: grantAmount,
        confidenceChange,
      }
    }

    case 'lowerExpectation': {
      const clubCount = state.leagues[club.leagueId]?.clubIds.length ?? 20
      const before = club.board.expectation.leaguePosition
      const shift = rng.int(2, 4)
      club.board.expectation.leaguePosition = clamp(before + shift, 1, clubCount)
      club.board.expectation.description = 'Consolidate and build'
      return {
        outcome: 'granted',
        message: `They accept the point. The target moves from ${before} to ${club.board.expectation.leaguePosition}.`,
        confidenceChange,
      }
    }

    case 'moreTime':
      club.board.warnings = Math.max(0, club.board.warnings - 1)
      return {
        outcome: 'granted',
        message: 'They agree to give the plan longer. One warning has been withdrawn.',
        confidenceChange,
      }

    case 'dismissCoach': {
      const coach = club.headCoachId ? state.staff[club.headCoachId] : null
      if (coach) {
        coach.clubId = null
        coach.contract = null
        club.staff = club.staff.filter((id) => id !== coach.id)
        club.headCoachId = null
      }
      // You asked for it, so the replacement's results are on you.
      club.board.confidence = clamp(club.board.confidence - 4, 0, 100)
      return {
        outcome: 'granted',
        message: `${coach?.knownAs ?? 'The head coach'} has been dismissed. Appointing a replacement is now urgent, and whoever you choose is your responsibility.`,
        confidenceChange: confidenceChange - 4,
      }
    }
  }
}

/** Roughly what the next facility upgrade will cost, for the board's grant. */
function estimatedUpgradeGrant(state: GameState, club: Club): number {
  const revenue = weeklyRevenue(state, club)
  return Math.round(revenue * 18)
}

function refusalMessage(kind: BoardRequestKind, club: Club): string {
  const confidence = club.board.confidence
  const cold = confidence < 40

  switch (kind) {
    case 'transferFunds':
      return cold
        ? 'The board tell you to work with what you have. They are not minded to give you more.'
        : 'Not at the moment. They would rather see the current squad used first.'
    case 'wageBudget':
      return 'The wage ceiling stays where it is. If you want a bigger player, move one on.'
    case 'fundFacility':
      return 'The board will not underwrite it. If you want the work done, find the money.'
    case 'fundStadium':
      return 'A capital project on that scale is out of the question for now.'
    case 'lowerExpectation':
      return 'The board are unmoved. The target stands, and they have noted that you asked.'
    case 'moreTime':
      return 'They tell you the time you have is the time you have.'
    case 'dismissCoach':
      return 'The board back the head coach. They suggest the problem may be elsewhere.'
    case 'takeLoan':
      return 'They will not borrow against future income to solve a present problem.'
  }
}

export const RISK_LABELS: Record<BoardRequestOption['risk'], string> = {
  low: 'Low risk',
  medium: 'They may take it badly',
  high: 'Asking this costs you if refused',
}
