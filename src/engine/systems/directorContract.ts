import { clamp, Rng } from '../rng'
import { weeklyRevenue } from './finance'
import { levelFor } from './career'
import type {
  Club, DirectorContract, DirectorProfile, EarningSource, GameState,
} from '../types'

/**
 * The director's own employment.
 *
 * You are an employee. Your salary comes out of the same wage bill you spend
 * the game trying to control, so negotiating hard for yourself has a cost you
 * will feel later — which is exactly the tension that makes the negotiation
 * worth having rather than a free slider to max out.
 *
 * What a club will pay is bounded by its revenue and by what your record says
 * you are worth. An unproven director at a non-league club is on little more
 * than a good player's wage; a Renowned one at a big club is on considerably
 * more than most of the squad.
 */

export interface ContractOffer {
  salary: number
  seasons: number
  signingBonus: number
  promotionBonus: number
  trophyBonus: number
  targetBonus: number
  severanceWeeks: number
}

export interface ContractTerms {
  /** What the club opens with. */
  opening: ContractOffer
  /** The most it will go to before walking. */
  ceiling: ContractOffer
  /** Plain-English note on the club's position, for the negotiation screen. */
  note: string
}

/**
 * What a club can and will pay a director of this standing.
 *
 * Anchored to weekly revenue rather than to reputation alone, because it is
 * the club's actual income that constrains it — a well-supported club in a
 * poor division can pay more than its league position suggests.
 */
export function contractTermsFor(
  state: GameState,
  club: Club,
  director: DirectorProfile,
): ContractTerms {
  const revenue = weeklyRevenue(state, club)
  const level = levelFor(director.xp)

  // Directors cost a small share of revenue, rising with standing: a big club
  // pays a bigger *share* as well as a bigger absolute figure, because the job
  // is genuinely larger. Calibrated against real sporting-director pay — around
  // £2m a year at a wealthy top-flight club, not the £6m a naive share of
  // revenue produces.
  const revenueShare = 0.005 + Math.pow(club.reputation / 100, 1.2) * 0.009
  const baseline = revenue * revenueShare

  // Your record moves what you can command, but less sharply than the club's
  // size does: an elite director at a small club is still paid small-club
  // money, because the club has no more to give.
  const levelMultiplier = 0.65 + (level.level - 1) * 0.075

  // A club that has just been let down is less generous; one that has chased
  // you is more so.
  const confidenceFactor = 0.9 + (club.board.confidence / 100) * 0.2

  // A floor, because even a part-time club pays its director something, and
  // because a salary that rounds to nothing makes the negotiation pointless.
  const ceilingSalary = Math.max(
    400,
    Math.round((baseline * levelMultiplier * confidenceFactor) / 50) * 50,
  )
  const openingSalary = Math.max(300, Math.round((ceilingSalary * 0.68) / 50) * 50)

  const bonusBase = ceilingSalary * 52

  const opening: ContractOffer = {
    salary: openingSalary,
    seasons: 2,
    signingBonus: 0,
    promotionBonus: Math.round((bonusBase * 0.16) / 1000) * 1000,
    trophyBonus: Math.round((bonusBase * 0.1) / 1000) * 1000,
    targetBonus: Math.round((bonusBase * 0.08) / 1000) * 1000,
    severanceWeeks: 8,
  }

  const ceiling: ContractOffer = {
    salary: ceilingSalary,
    seasons: 4,
    signingBonus: Math.round((bonusBase * 0.12) / 1000) * 1000,
    promotionBonus: Math.round((bonusBase * 0.34) / 1000) * 1000,
    trophyBonus: Math.round((bonusBase * 0.24) / 1000) * 1000,
    targetBonus: Math.round((bonusBase * 0.2) / 1000) * 1000,
    severanceWeeks: 30,
  }

  let note: string
  if (club.finances.inCrisis) {
    note = 'The club is in financial crisis and has very little room to move on money.'
  } else if (club.reputation > 55 && level.level <= 3) {
    note = 'They are taking a chance on you, and the terms reflect that.'
  } else if (level.maxClubReputation - club.reputation > 20) {
    note = 'You are comfortably over-qualified for this job, and they know it.'
  } else {
    note = 'A straightforward negotiation for a club of this size.'
  }

  return { opening, ceiling, note }
}

export interface NegotiationOutcome {
  accepted: boolean
  message: string
  /** What they will do instead, if they rejected. */
  counter?: ContractOffer
}

/**
 * Put an offer to the club.
 *
 * Every term is weighed against the ceiling and combined, so you can trade a
 * lower salary for a bigger promotion bonus, or a long deal for a smaller
 * signing fee. Pushing every dial to the ceiling at once is refused — that is
 * the point of having several dials.
 */
/**
 * How hard an offer pushes the club, as a fraction of what it would bear.
 *
 * Every term is weighed against the ceiling and combined, so a big signing-on
 * fee can be paid for with a lower salary or a shorter deal. A single term at
 * the ceiling is fine; all of them at once is not, which is what makes the
 * package a genuine choice rather than six sliders to max out.
 */
function offerPressure(
  offer: ContractOffer,
  ceiling: ContractOffer,
  directorLevel: number,
): { pressure: number; worstTerm: string } {
  const demands = [
    { label: 'salary', value: offer.salary / Math.max(1, ceiling.salary), weight: 3 },
    { label: 'signing bonus', value: offer.signingBonus / Math.max(1, ceiling.signingBonus), weight: 1.2 },
    { label: 'promotion bonus', value: offer.promotionBonus / Math.max(1, ceiling.promotionBonus), weight: 0.9 },
    { label: 'trophy bonus', value: offer.trophyBonus / Math.max(1, ceiling.trophyBonus), weight: 0.7 },
    { label: 'target bonus', value: offer.targetBonus / Math.max(1, ceiling.targetBonus), weight: 0.7 },
    { label: 'severance', value: offer.severanceWeeks / Math.max(1, ceiling.severanceWeeks), weight: 0.9 },
  ]

  const totalWeight = demands.reduce((sum, d) => sum + d.weight, 0)
  const weighted = demands.reduce((sum, d) => sum + d.value * d.weight, 0) / totalWeight

  // A long contract is a commitment a club is wary of giving an unproven
  // director and happy to give a proven one.
  const lengthPressure =
    clamp((offer.seasons - 2) * 0.06, -0.06, 0.18) * (directorLevel >= 5 ? 0.4 : 1)

  const worstTerm = demands.slice().sort((a, b) => b.value - a.value)[0].label
  return { pressure: weighted + lengthPressure, worstTerm }
}

/** The lower bound of the tolerance band, used when constructing a counter. */
const BASE_TOLERANCE = 0.86
const TOLERANCE_NOISE = 0.03

export function negotiateContract(
  state: GameState,
  club: Club,
  director: DirectorProfile,
  offer: ContractOffer,
  rng: Rng,
): NegotiationOutcome {
  const { ceiling, opening } = contractTermsFor(state, club, director)
  const level = levelFor(director.xp).level

  const { pressure, worstTerm } = offerPressure(offer, ceiling, level)
  const tolerance = BASE_TOLERANCE + rng.float(-TOLERANCE_NOISE, TOLERANCE_NOISE)

  if (pressure <= tolerance) {
    return { accepted: true, message: 'The board are happy with those terms.' }
  }

  // Build a counter and then *verify* it against the same test the player's
  // next submission will face. A counter that would itself be refused traps
  // the player in a loop with no way to reach agreement, which is the sort of
  // thing that only shows up when something actually plays the negotiation.
  const counter: ContractOffer = {
    salary: Math.max(opening.salary, Math.round(offer.salary / 50) * 50),
    seasons: offer.seasons > 3 && level < 5 ? 3 : offer.seasons,
    signingBonus: offer.signingBonus,
    promotionBonus: offer.promotionBonus,
    trophyBonus: offer.trophyBonus,
    targetBonus: offer.targetBonus,
    severanceWeeks: offer.severanceWeeks,
  }

  // Scale the package back until it clears the *worst case* tolerance, so the
  // counter holds however the next roll lands.
  const target = BASE_TOLERANCE - TOLERANCE_NOISE
  for (let i = 0; i < 24; i++) {
    if (offerPressure(counter, ceiling, level).pressure <= target) break
    counter.salary = Math.max(opening.salary, Math.round((counter.salary * 0.92) / 50) * 50)
    counter.signingBonus = Math.round((counter.signingBonus * 0.85) / 1000) * 1000
    counter.promotionBonus = Math.round((counter.promotionBonus * 0.85) / 1000) * 1000
    counter.trophyBonus = Math.round((counter.trophyBonus * 0.85) / 1000) * 1000
    counter.targetBonus = Math.round((counter.targetBonus * 0.85) / 1000) * 1000
    counter.severanceWeeks = Math.max(4, Math.round(counter.severanceWeeks * 0.85))
  }

  return {
    accepted: false,
    message: `The board will not go that far on ${worstTerm}. This is what they will do.`,
    counter,
  }
}

/** Commit an agreed contract and pay any signing bonus. */
export function signContract(
  state: GameState,
  club: Club,
  offer: ContractOffer,
): DirectorContract {
  const contract: DirectorContract = {
    salary: Math.round(offer.salary),
    expiresSeason: state.date.season + offer.seasons,
    signingBonus: Math.round(offer.signingBonus),
    promotionBonus: Math.round(offer.promotionBonus),
    trophyBonus: Math.round(offer.trophyBonus),
    targetBonus: Math.round(offer.targetBonus),
    severanceWeeks: Math.round(offer.severanceWeeks),
    clubId: club.id,
  }
  state.director.contract = contract

  if (contract.signingBonus > 0) {
    club.finances.balance -= contract.signingBonus
    club.finances.season.staffWages += contract.signingBonus
    recordEarning(state, club, contract.signingBonus, 'signingBonus', 'Signing-on fee')
  }

  return contract
}

/**
 * Record money paid to the director. Every payment routes through here so the
 * career-earnings total can never drift from what was actually paid.
 */
function recordEarning(
  state: GameState,
  club: Club | null,
  amount: number,
  source: EarningSource,
  description: string,
): void {
  if (amount === 0) return
  const director = state.director
  director.careerEarnings += amount
  director.earningsThisSeason += amount
  director.earnings.unshift({
    season: state.date.season,
    week: state.date.week,
    amount: Math.round(amount),
    source,
    description,
    clubName: club?.name ?? '—',
  })
  // Salary is paid every week for decades; keeping every line would bloat the
  // save for no benefit, and the running totals are authoritative anyway.
  if (director.earnings.length > 120) director.earnings.length = 120
}

/**
 * Weekly salary payment. Comes out of the club's balance and counts toward its
 * staff wages, so the director is genuinely part of the cost base he manages.
 */
export function payDirectorSalary(state: GameState, club: Club): void {
  const contract = state.director.contract
  if (!contract || contract.clubId !== club.id) return

  club.finances.balance -= contract.salary
  club.finances.season.staffWages += contract.salary
  state.director.careerEarnings += contract.salary
  state.director.earningsThisSeason += contract.salary
}

/**
 * Season-end bonuses. Kept separate from the XP awards because money and
 * standing are different currencies and a director may reasonably chase one
 * at the expense of the other.
 */
export function paySeasonBonuses(
  state: GameState,
  club: Club,
  finalPosition: number,
  promoted: boolean,
  trophies: string[],
): number {
  const contract = state.director.contract
  if (!contract || contract.clubId !== club.id) return 0

  let paid = 0

  if (promoted && contract.promotionBonus > 0) {
    paid += contract.promotionBonus
    recordEarning(state, club, contract.promotionBonus, 'promotionBonus', 'Promotion bonus')
  }
  for (const trophy of trophies) {
    if (contract.trophyBonus <= 0) break
    paid += contract.trophyBonus
    recordEarning(state, club, contract.trophyBonus, 'trophyBonus', `Bonus for winning the ${trophy}`)
  }
  if (finalPosition <= club.board.expectation.leaguePosition && contract.targetBonus > 0) {
    paid += contract.targetBonus
    recordEarning(state, club, contract.targetBonus, 'targetBonus', 'Met the board\'s target')
  }

  if (paid > 0) {
    club.finances.balance -= paid
    club.finances.season.staffWages += paid
  }
  return paid
}

/** Severance on dismissal. The one time being sacked pays. */
export function paySeverance(state: GameState, club: Club): number {
  const contract = state.director.contract
  if (!contract || contract.clubId !== club.id) return 0

  const amount = Math.round(contract.salary * contract.severanceWeeks)
  club.finances.balance -= amount
  club.finances.season.staffWages += amount
  recordEarning(state, club, amount, 'severance', `Severance from ${club.name}`)
  state.director.contract = null
  return amount
}

/** A readable summary of the current deal, for the career screen. */
export function contractSummary(state: GameState): string {
  const contract = state.director.contract
  if (!contract) return 'You are not under contract.'
  const seasonsLeft = contract.expiresSeason - state.date.season
  if (seasonsLeft <= 0) return 'Your contract expires at the end of this season.'
  return `Contract runs ${seasonsLeft} more season${seasonsLeft === 1 ? '' : 's'}.`
}
