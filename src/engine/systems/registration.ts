import { isTransferWindowOpen } from '../sim/schedule'
import { embargoAllows } from './regulation'
import { ratingForPositionCached } from '../world/attributes'
import type { Club, GameState, ID, Player } from '../types'

/**
 * Squad registration.
 *
 * The rule that stops a rich club simply buying everyone. You name a senior
 * squad during the window and live with it until the next one: a player left
 * off it is not benched, he is barred, and he sits there earning his wage
 * while contributing nothing. That asymmetry — you can always buy, you cannot
 * always play — is the point.
 *
 * The operative constraint is not the 25-man list people quote. It is the
 * ceiling on players who were not trained in the country. A club with only
 * three homegrown players does not get 25 places; it gets 20, and the five it
 * is missing simply go unused.
 */

/** Places on the senior squad list. */
export const SQUAD_LIMIT = 25

/** Of those places, how many may go to players trained abroad. */
export const NON_HOMEGROWN_LIMIT = 17

/** Years at a club in the nation, before 21, that make a player homegrown. */
export const HOMEGROWN_YEARS = 3

/** Below this age a player is outside the list entirely, and unlimited. */
export const U21_AGE = 21

/**
 * Whether a player was trained in a given nation.
 *
 * Nation-level rather than club-level. The real rules distinguish
 * club-trained from association-trained, but only the second one binds in
 * practice, and modelling both would double the bookkeeping to change almost
 * no decisions.
 */
export function isHomegrownIn(player: Player, nationId: ID): boolean {
  return (player.trainingYears[nationId] ?? 0) >= HOMEGROWN_YEARS
}

export function isHomegrownFor(player: Player, club: Club): boolean {
  return isHomegrownIn(player, club.nationId)
}

/** Under-21s never need a place, so they never need registering. */
export function needsRegistration(player: Player): boolean {
  return player.age >= U21_AGE
}

/**
 * Everyone a club has to find a place for: the players it owns and has not
 * loaned out, plus the ones it has borrowed. A loanee occupies a place at the
 * club actually picking him, which is what makes a deadline-day loan a real
 * cost rather than free depth.
 */
export function registrablePool(state: GameState, club: Club): Player[] {
  const own = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && p.loanClubId === null && !p.isAcademy)
  const borrowed = club.loanedIn
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p))
  return [...own, ...borrowed]
}

export interface RegistrationView {
  /** Named seniors, in list order. */
  registered: Player[]
  /** Seniors with no place — barred from selection. */
  unregistered: Player[]
  /** Under-21s, eligible without occupying a place. */
  exempt: Player[]
  homegrown: number
  nonHomegrown: number
  placesUsed: number
  placesFree: number
  /** How many more players trained abroad the club may still name. */
  nonHomegrownFree: number
  /** True if the list as it stands breaks a limit — only reachable via a save. */
  illegal: boolean
}

export function squadRegistration(state: GameState, club: Club): RegistrationView {
  const pool = registrablePool(state, club)
  const named = new Set(club.registeredIds)

  const registered: Player[] = []
  const unregistered: Player[] = []
  const exempt: Player[] = []

  for (const player of pool) {
    if (!needsRegistration(player)) exempt.push(player)
    else if (named.has(player.id)) registered.push(player)
    else unregistered.push(player)
  }

  // Keep the caller's order: the list is displayed as the club named it.
  registered.sort(
    (a, b) => club.registeredIds.indexOf(a.id) - club.registeredIds.indexOf(b.id),
  )

  let homegrown = 0
  for (const player of registered) if (isHomegrownFor(player, club)) homegrown += 1
  const nonHomegrown = registered.length - homegrown

  return {
    registered,
    unregistered,
    exempt,
    homegrown,
    nonHomegrown,
    placesUsed: registered.length,
    placesFree: Math.max(0, SQUAD_LIMIT - registered.length),
    nonHomegrownFree: Math.max(0, NON_HOMEGROWN_LIMIT - nonHomegrown),
    illegal: registered.length > SQUAD_LIMIT || nonHomegrown > NON_HOMEGROWN_LIMIT,
  }
}

/** Whether this club may field this player, ignoring injury and suspension. */
export function isRegisteredFor(club: Club, player: Player): boolean {
  if (!needsRegistration(player)) return true
  return club.registeredIds.includes(player.id)
}

/**
 * Registration follows the transfer window. Lists are named while the window
 * is open and frozen the moment it shuts, so an injury in February is a
 * problem you solve from what you already have.
 */
export function isRegistrationOpen(week: number): boolean {
  return isTransferWindowOpen(week)
}

export type RegistrationError =
  | 'closed'
  | 'notAtClub'
  | 'alreadyRegistered'
  | 'squadFull'
  | 'noHomegrownPlaces'
  | 'embargo'

export const REGISTRATION_MESSAGES: Record<RegistrationError, string> = {
  closed: 'The registration window is closed. Squad lists are locked until it reopens.',
  notAtClub: 'That player is not available to this club.',
  alreadyRegistered: 'That player is already on the squad list.',
  squadFull: `All ${SQUAD_LIMIT} places on the squad list are taken.`,
  noHomegrownPlaces:
    `Only ${NON_HOMEGROWN_LIMIT} places may go to players trained outside the country, and they are all taken. `
    + 'A homegrown player would still fit.',
  embargo:
    'The club is under a registration embargo for breaching the squad-cost rules. '
    + 'Nobody new may be added to the squad list until it is lifted.',
}

export interface RegistrationResult {
  ok: boolean
  error?: RegistrationError
  message?: string
}

function fail(error: RegistrationError): RegistrationResult {
  return { ok: false, error, message: REGISTRATION_MESSAGES[error] }
}

export function canRegister(
  state: GameState,
  club: Club,
  player: Player,
  opts: { ignoreWindow?: boolean } = {},
): RegistrationResult {
  if (!opts.ignoreWindow && !isRegistrationOpen(state.date.week)) return fail('closed')
  if (!registrablePool(state, club).some((p) => p.id === player.id)) return fail('notAtClub')
  if (club.registeredIds.includes(player.id)) return fail('alreadyRegistered')
  // An embargo is where financial regulation stops being a message and starts
  // being a consequence: the club may still buy whoever it likes, and may not
  // put him on the team sheet. It bars players signed since the embargo was
  // imposed, not the squad the club already had.
  if (needsRegistration(player) && !embargoAllows(club, player.joinedSeason)) {
    return fail('embargo')
  }
  // An under-21 is always eligible, so "registering" him is a no-op we accept
  // rather than an error — the UI never offers it.
  if (!needsRegistration(player)) return { ok: true }

  const view = squadRegistration(state, club)
  if (view.placesFree <= 0) return fail('squadFull')
  if (!isHomegrownFor(player, club) && view.nonHomegrownFree <= 0) {
    return fail('noHomegrownPlaces')
  }
  return { ok: true }
}

export function registerPlayer(
  state: GameState,
  club: Club,
  player: Player,
  opts: { ignoreWindow?: boolean } = {},
): RegistrationResult {
  const check = canRegister(state, club, player, opts)
  if (!check.ok) return check
  if (needsRegistration(player) && !club.registeredIds.includes(player.id)) {
    club.registeredIds.push(player.id)
  }
  return { ok: true }
}

export function unregisterPlayer(
  state: GameState,
  club: Club,
  player: Player,
  opts: { ignoreWindow?: boolean } = {},
): RegistrationResult {
  if (!opts.ignoreWindow && !isRegistrationOpen(state.date.week)) return fail('closed')
  club.registeredIds = club.registeredIds.filter((id) => id !== player.id)
  return { ok: true }
}

/**
 * How good a player looks to whoever is filling in the form. Cheap on purpose:
 * this runs for every club in the world at every window close.
 */
function registrationPriority(player: Player): number {
  let score = ratingForPositionCached(player.attributes, player.position)
  // A club will not burn a place on someone it is trying to move on, and will
  // find one for a player it just paid for.
  if (player.squadStatus === 'surplus') score -= 25
  if (player.squadStatus === 'star') score += 8
  if (player.listedForTransfer) score -= 18
  return score
}

/**
 * Fill a club's squad list from scratch, best players first, obeying both
 * limits.
 *
 * The greedy pass is deliberate: real clubs do not solve an optimisation
 * problem either, they name their best players until they run into the
 * ceiling and then start naming their best homegrown ones. Anyone who does
 * not fit is left off, which is how an AI club ends up with an expensive
 * signing in the stands.
 */
export function autoRegister(state: GameState, club: Club): Player[] {
  const pool = registrablePool(state, club).filter(needsRegistration)
  const ranked = pool
    .map((player) => ({ player, score: registrationPriority(player) }))
    .sort((a, b) => b.score - a.score)

  const named: ID[] = []
  let nonHomegrown = 0

  for (const { player } of ranked) {
    if (named.length >= SQUAD_LIMIT) break
    // Anyone signed since the embargo was imposed sits out, which is what
    // makes the sanction cost something without dismantling the club.
    if (!embargoAllows(club, player.joinedSeason)) continue
    const homegrown = isHomegrownFor(player, club)
    if (!homegrown && nonHomegrown >= NON_HOMEGROWN_LIMIT) continue
    named.push(player.id)
    if (!homegrown) nonHomegrown += 1
  }

  club.registeredIds = named
  const namedSet = new Set(named)
  return pool.filter((p) => !namedSet.has(p.id))
}

/**
 * Keep an existing list valid without rewriting it.
 *
 * Used every time the squad changes underneath the list — a sale, an expiry, a
 * loan going out — and at window close for the human's club, where throwing
 * away their choices and re-picking would be worse than useless. Names already
 * on the list stay on it; free places are filled with the best of what is
 * left.
 */
export function reconcileRegistration(state: GameState, club: Club): Player[] {
  const pool = registrablePool(state, club)
  const eligible = new Set(pool.map((p) => p.id))

  // Drop anyone who has left, been loaned out, or dropped below 21 (which
  // cannot happen, but a save from an older build can say anything).
  const kept: ID[] = []
  let nonHomegrown = 0
  for (const id of club.registeredIds) {
    if (!eligible.has(id)) continue
    const player = state.players[id]
    if (!player || !needsRegistration(player)) continue
    if (kept.length >= SQUAD_LIMIT) continue
    const homegrown = isHomegrownFor(player, club)
    if (!homegrown && nonHomegrown >= NON_HOMEGROWN_LIMIT) continue
    kept.push(id)
    if (!homegrown) nonHomegrown += 1
  }

  const keptSet = new Set(kept)
  const candidates = pool
    .filter((p) => needsRegistration(p) && !keptSet.has(p.id))
    .map((player) => ({ player, score: registrationPriority(player) }))
    .sort((a, b) => b.score - a.score)

  for (const { player } of candidates) {
    if (kept.length >= SQUAD_LIMIT) break
    if (!embargoAllows(club, player.joinedSeason)) continue
    const homegrown = isHomegrownFor(player, club)
    if (!homegrown && nonHomegrown >= NON_HOMEGROWN_LIMIT) continue
    kept.push(player.id)
    if (!homegrown) nonHomegrown += 1
  }

  club.registeredIds = kept
  const finalSet = new Set(kept)
  return pool.filter((p) => needsRegistration(p) && !finalSet.has(p.id))
}

export interface DisplacementResult {
  registered: boolean
  /** The player pushed off the list to make room, if anyone was. */
  displaced: Player | null
  /** Set when the player could not be registered at all. */
  blocked: RegistrationError | null
}

/**
 * Find a place for an arriving player, pushing someone else off if that is
 * what it takes.
 *
 * This is how an AI club behaves in a window: it signs a player and then finds
 * out who is paying for it. It will not displace someone better than the
 * arrival, which is what stops a club cycling its own best players out of the
 * squad, and when the block is the foreign-player ceiling it can only displace
 * another foreign player — freeing a homegrown place would not help.
 */
export function registerOrDisplace(
  state: GameState,
  club: Club,
  player: Player,
): DisplacementResult {
  const attempt = registerPlayer(state, club, player, { ignoreWindow: true })
  if (attempt.ok) return { registered: true, displaced: null, blocked: null }
  if (attempt.error !== 'squadFull' && attempt.error !== 'noHomegrownPlaces') {
    return { registered: false, displaced: null, blocked: attempt.error ?? null }
  }

  const mustBeForeign = attempt.error === 'noHomegrownPlaces'
  const view = squadRegistration(state, club)
  const candidates = view.registered
    .filter((p) => p.id !== player.id)
    .filter((p) => !mustBeForeign || !isHomegrownFor(p, club))

  let weakest: Player | null = null
  let weakestScore = Infinity
  for (const candidate of candidates) {
    const score = registrationPriority(candidate)
    if (score < weakestScore) {
      weakest = candidate
      weakestScore = score
    }
  }

  if (!weakest || registrationPriority(player) <= weakestScore) {
    return { registered: false, displaced: null, blocked: attempt.error }
  }

  club.registeredIds = club.registeredIds.filter((id) => id !== weakest!.id)
  const retry = registerPlayer(state, club, player, { ignoreWindow: true })
  if (!retry.ok) {
    // Should not happen; put the displaced player back rather than losing both.
    club.registeredIds.push(weakest.id)
    return { registered: false, displaced: null, blocked: retry.error ?? null }
  }
  return { registered: true, displaced: weakest, blocked: null }
}

/**
 * Register an arrival the way the club in question would.
 *
 * An AI club finds a place by pushing someone out. The human's club does not:
 * a director who has just signed a player he cannot register has a problem to
 * solve, and solving it for him would take away the only teeth the rule has.
 */
export function settleArrival(
  state: GameState,
  club: Club,
  player: Player,
): DisplacementResult {
  if (club.id !== state.playerClubId) return registerOrDisplace(state, club, player)
  const attempt = registerPlayer(state, club, player, { ignoreWindow: true })
  return {
    registered: attempt.ok,
    displaced: null,
    blocked: attempt.ok ? null : attempt.error ?? null,
  }
}

/** Drop a player from a club's list without touching the window lock. */
export function releaseRegistration(club: Club, playerId: ID): void {
  if (!club.registeredIds.includes(playerId)) return
  club.registeredIds = club.registeredIds.filter((id) => id !== playerId)
}

/**
 * Credit a season's training to a player who spent it under 21.
 *
 * Called once per player at the season roll, before ages tick over, so the
 * season just played counts at the age it was played at. The nation is the
 * one he actually played in — a loan spell abroad counts towards that
 * country, exactly as it does in the real regulations.
 */
export function accrueTrainingYear(state: GameState, player: Player): void {
  if (player.age >= U21_AGE) return
  const clubId = player.loanClubId ?? player.clubId
  if (!clubId) return
  const club = state.clubs[clubId]
  if (!club) return
  player.trainingYears[club.nationId] = (player.trainingYears[club.nationId] ?? 0) + 1
}
