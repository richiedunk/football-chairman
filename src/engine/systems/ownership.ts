import { clamp, Rng } from '../rng'
import type { City, Club, GameState, League, Owner, OwnerKind } from '../types'

/**
 * Club ownership.
 *
 * The owner is the answer to questions the board used to leave hanging. Why
 * will this club not spend? Why does that one tolerate debt that would
 * frighten anyone else? Why does a board with a decent squad and a mid-table
 * finish still want you out? Because somebody owns the place, and what they
 * want is not the same as what the last owner wanted.
 *
 * Everything here is read by the board rather than acting on its own, which
 * keeps ownership a *cause* rather than another system competing with the one
 * that already decides budgets and expectations.
 */

export const OWNER_LABELS: Record<OwnerKind, string> = {
  legacyFamily: 'Family ownership',
  localBusiness: 'Local business owner',
  foreignFund: 'Foreign investment fund',
  celebrity: 'Celebrity owner',
  consortium: 'Investment consortium',
  fanOwned: 'Supporter-owned',
}

export const OWNER_DESCRIPTIONS: Record<OwnerKind, string> = {
  legacyFamily:
    'The same family have held the club for decades. They are not going to transform it and they are not going to sell it either.',
  localBusiness:
    'A local business owner who made their money elsewhere and runs the club carefully. Little money, endless patience, and no appetite at all for debt.',
  foreignFund:
    'An investment fund with more money than the division has ever seen and no interest in waiting for anything.',
  celebrity:
    'A famous name whose arrival is worth more in shirts sold and eyes on the club than in transfer money.',
  consortium:
    'A group of investors. Decisions take longer because everything goes through a room full of people.',
  fanOwned:
    'Owned by its own supporters. No outside money, no outside pressure, and a board that answers to a vote of the membership.',
}

/**
 * The shape of each kind of owner, as ranges the generator samples from.
 *
 * Written as a table because the whole point is that the kinds are legibly
 * different from each other; burying these numbers in branching code would
 * make it impossible to see at a glance that a fund is impatient and a local
 * businessman is not.
 */
interface OwnerProfile {
  wealth: [number, number]
  patience: [number, number]
  ambition: [number, number]
  interference: [number, number]
  leverage: [number, number]
  youthBelief: [number, number]
}

export const OWNER_PROFILES: Record<OwnerKind, OwnerProfile> = {
  legacyFamily: {
    wealth: [20, 55], patience: [60, 90], ambition: [30, 60],
    interference: [30, 60], leverage: [20, 50], youthBelief: [40, 70],
  },
  localBusiness: {
    wealth: [10, 40], patience: [70, 95], ambition: [20, 50],
    interference: [20, 50], leverage: [5, 25], youthBelief: [60, 90],
  },
  foreignFund: {
    wealth: [75, 100], patience: [5, 30], ambition: [80, 100],
    interference: [55, 90], leverage: [50, 85], youthBelief: [10, 35],
  },
  celebrity: {
    wealth: [35, 65], patience: [55, 85], ambition: [55, 85],
    interference: [40, 75], leverage: [30, 60], youthBelief: [35, 65],
  },
  consortium: {
    wealth: [50, 80], patience: [35, 65], ambition: [55, 80],
    interference: [30, 55], leverage: [40, 75], youthBelief: [30, 60],
  },
  fanOwned: {
    wealth: [5, 25], patience: [80, 100], ambition: [25, 55],
    interference: [10, 35], leverage: [0, 15], youthBelief: [70, 95],
  },
}

function sample(rng: Rng, range: [number, number]): number {
  return rng.int(range[0], range[1])
}

export function createOwner(
  rng: Rng,
  kind: OwnerKind,
  name: string,
  season: number,
  stake = 100,
): Owner {
  const profile = OWNER_PROFILES[kind]
  return {
    name,
    kind,
    wealth: sample(rng, profile.wealth),
    patience: sample(rng, profile.patience),
    ambition: sample(rng, profile.ambition),
    interference: sample(rng, profile.interference),
    leverage: sample(rng, profile.leverage),
    youthBelief: sample(rng, profile.youthBelief),
    sinceSeason: season,
    stake,
    faithInDirector: 50,
  }
}

/**
 * What a club starts out owned by.
 *
 * Most clubs, at most levels, are held by a family or by their own supporters.
 * Outside money concentrates at the top, which is what makes it worth having.
 */
export function startingOwnerKind(rng: Rng, reputation: number): OwnerKind {
  const kinds: OwnerKind[] = [
    'legacyFamily', 'localBusiness', 'fanOwned', 'consortium', 'foreignFund', 'celebrity',
  ]
  const wealthy = reputation / 100
  const weights = [
    34,
    30 - wealthy * 18,
    18 - wealthy * 14,
    8 + wealthy * 14,
    2 + Math.pow(wealthy, 2) * 34,
    2 + wealthy * 6,
  ]
  return rng.weighted(kinds, weights.map((w) => Math.max(0.5, w)))
}

/** A plausible name for the owner, in the flavour of what they are. */
export function ownerName(
  rng: Rng,
  kind: OwnerKind,
  personName: string,
  city: City,
): string {
  switch (kind) {
    case 'fanOwned':
      return `${city.name} Supporters' Trust`
    case 'foreignFund': {
      const words = ['Capital', 'Holdings', 'Partners', 'Group', 'Ventures', 'Sports Investments']
      const places = ['Meridian', 'Northgate', 'Silverpoint', 'Anchor', 'Harbour', 'Summit', 'Cedar']
      return `${rng.pick(places)} ${rng.pick(words)}`
    }
    case 'consortium':
      return `The ${rng.pick(['Beaumont', 'Ashcroft', 'Halloran', 'Ridgeway', 'Calder'])} Consortium`
    case 'localBusiness':
      // The label under the name already says what he is; appending the
      // nationality in brackets read like a database field.
      return personName
    default:
      return personName
  }
}

// ---------------------------------------------------------------------------
// What the owner does to the board
// ---------------------------------------------------------------------------

/**
 * Share of what is left after running costs that the board puts on wages.
 *
 * The single number that most decides what kind of club this is to work for.
 * A fund hands you most of it; a supporter-owned club will not go near the
 * edge.
 */
export function wageBudgetShare(owner: Owner): number {
  // Centred so the world's average lands where the flat share it replaced sat,
  // and spread wide enough that the owner is the difference between a club
  // that can pay and one that cannot. Recentring mattered: the first version
  // averaged lower than what it replaced, quietly cut every wage bill in the
  // world by a sixth and put the money back in the bank.
  const base = 0.86
  const appetite = (owner.wealth / 100) * 0.3 + (owner.ambition / 100) * 0.14
  const caution = (owner.patience / 100) * 0.2
  return clamp(base + appetite - caution, 0.6, 1.05)
}

/** How much of the club's cash reserves the board will release for transfers. */
export function reserveRelease(owner: Owner): number {
  return clamp(0.18 + (owner.wealth / 100) * 0.42 + (owner.ambition / 100) * 0.15, 0.15, 0.75)
}

/**
 * How much of a week's losses the owner will absorb rather than borrow.
 *
 * This, not a weekly gift, is what a rich owner actually is. The first version
 * handed wealthy clubs a standing income worth 42% of turnover, which is not
 * ownership, it is a subsidy — and it put the money straight back into the
 * reserves the whole economy has been trying to drain.
 *
 * Covering losses instead means the owner shows up exactly where it matters:
 * a club with money behind it does not slide into debt when it has a bad
 * season, and a club without it does. That is the real difference between the
 * two jobs, and it costs nothing when the club is running properly.
 */
export function lossCoverage(owner: Owner): number {
  if (owner.wealth < 45) return 0
  const depth = (owner.wealth - 45) / 55
  return clamp(Math.pow(depth, 1.2) * 0.95, 0, 0.95)
}

/** How far above a club's natural level the owner expects it to finish. */
export function expectationLift(owner: Owner): number {
  return (owner.ambition / 100) * 0.45 + (owner.wealth / 100) * 0.2
}

/**
 * How fast board confidence falls when things go badly.
 *
 * A fund's board loses faith roughly three times as quickly as a supporters'
 * trust does, which is the whole difference between the two jobs.
 */
export function impatienceFactor(owner: Owner): number {
  return clamp(1.9 - (owner.patience / 100) * 1.4, 0.5, 1.9)
}

/** Multiplier on how willing a board is to grant what you ask for. */
export function requestReceptiveness(owner: Owner): number {
  return clamp(0.7 + (owner.wealth / 100) * 0.4 - (owner.interference / 100) * 0.15, 0.55, 1.2)
}

/**
 * Debt the owner is relaxed about, as a multiple of weekly revenue.
 *
 * The floor used to sit at twelve weeks, which is about four months of
 * turnover — tight enough that one bad season put a cautious club into
 * financial crisis, and crisis then lasted three seasons because getting back
 * under so low a bar took years. Real clubs carry more than that routinely.
 */
export function debtTolerance(owner: Owner): number {
  return 24 + (owner.leverage / 100) * 46
}

export function ownerSummary(owner: Owner): string {
  return OWNER_DESCRIPTIONS[owner.kind]
}

/** Short, honest read on what this owner is like to work for. */
export function ownerTraits(owner: Owner): string[] {
  const traits: string[] = []
  if (owner.wealth >= 75) traits.push('Deep pockets')
  else if (owner.wealth <= 25) traits.push('No money to put in')
  if (owner.patience >= 75) traits.push('Patient')
  else if (owner.patience <= 30) traits.push('Wants results now')
  if (owner.ambition >= 80) traits.push('Ambitious')
  if (owner.interference >= 70) traits.push('Hands-on')
  else if (owner.interference <= 25) traits.push('Leaves you alone')
  if (owner.youthBelief >= 70) traits.push('Believes in the academy')
  if (owner.leverage <= 20) traits.push('Debt-averse')
  else if (owner.leverage >= 70) traits.push('Comfortable with borrowing')
  return traits
}

/** Clubs whose owner has held them long enough to be assessed for a sale. */
export function ownerTenure(state: GameState, club: Club): number {
  return state.date.season - club.board.owner.sinceSeason
}

/** Convenience for screens: the club's league, for phrasing expectations. */
export function leagueOf(state: GameState, club: Club): League | null {
  return state.leagues[club.leagueId] ?? null
}
