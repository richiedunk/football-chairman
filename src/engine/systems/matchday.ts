import { Rng } from '../rng'
import { IdFactory } from '../ids'
import { NameGenerator } from '../names/generator'
import { generateYouthIntake } from '../world/playerGen'
import { fieldableCount, isAvailable, selectableSquad } from '../sim/selection'
import { seniorSquad } from './aiSquad'
import { promoteToSenior } from './academy'
import { computeValue, computeWageDemand } from './valuation'
import { addInboxItem } from './inbox'
import type { AvailabilityContext } from '../sim/selection'
import type { Club, GameState, Player } from '../types'

/**
 * Being able to field a side.
 *
 * The engine used to treat a shortage as a silent degradation: `selectTeam`
 * filled one slot per available player and stopped, so a club short of bodies
 * kicked off with ten, or nine, and nothing anywhere was told. Worse, the last
 * fallback was every owned or borrowed player with no filter at all, so before
 * fielding ten it would field an injured man, a suspended man, or one on loan
 * at another club that same week.
 *
 * **A shortage is an event, not a degradation.** Nothing here forfeits a
 * match — a fixture always gets played, because a league that cannot fulfil
 * its own calendar is a broken world rather than a hard lesson. The two sides
 * of the game answer for it differently, and that asymmetry is the point:
 *
 * - **An AI club fixes itself.** It promotes from its academy, invents a
 *   sixteen-year-old if the academy is empty too, and signs a free agent it
 *   can plausibly attract. None of it is glamorous and all of it is what a
 *   real club does in a crisis week.
 * - **The human is answerable.** No secretary quietly signs players for him.
 *   He is warned the moment his squad cannot field eleven, and if it is still
 *   true on the morning of a match he is dismissed for it — at which point the
 *   club becomes an AI club and fixes the side in time to kick off. Failing to
 *   put eleven players on a pitch is the one thing a director of football is
 *   unambiguously employed to prevent.
 */

/** A side is eleven players. Everything here exists to reach that number. */
export const ELEVEN = 11

/**
 * The bodies a club keeps beyond the eleven.
 *
 * An AI club recovering from a shortage aims a little above the line, because
 * fixing it exactly at eleven means the next injury puts it straight back.
 */
const AI_RECOVERY_TARGET = 14

/**
 * How far above its own best player a club will reach for a free agent.
 *
 * A ceiling that scales with the club rather than with its reputation: a side
 * in trouble will take somebody a quarter better than anyone it has, and not
 * a Ballon d'Or winner who happens to be unattached. It self-adjusts as the
 * club rises or falls, which a fixed reputation band never did.
 */
const EMERGENCY_ABILITY_HEADROOM = 1.25

export interface MatchdayDeps {
  ids: IdFactory
  names: NameGenerator
  rng: Rng
}

/** Everyone this club could field this week. */
export function fieldable(state: GameState, club: Club, week: number): Player[] {
  const ctx: AvailabilityContext = { suspendedIds: new Set(), week }
  return selectableSquad(state, club).filter((p) => isAvailable(p, club.id, ctx))
}

/** Whether the club can put a side out at all. */
export function canFieldEleven(state: GameState, club: Club, week: number): boolean {
  return fieldableCount(state, club, { suspendedIds: new Set(), week }) >= ELEVEN
}

/**
 * Invent a youth player, because the alternative is a match with ten men.
 *
 * A club whose academy is empty on the morning of a fixture registers whoever
 * is training with it — and every club has somebody, however poor. This is the
 * bottom of the ladder and it is deliberately unglamorous: the player it makes
 * is a sixteen-year-old with nothing to recommend him except a pulse and a
 * registration, which is exactly the right cost for having let it get here.
 */
export function conjureYouth(
  state: GameState,
  club: Club,
  deps: MatchdayDeps,
): Player | null {
  const nation = state.nations[club.nationId]
  if (!nation) return null

  const [player] = generateYouthIntake(
    {
      rng: deps.rng,
      ids: deps.ids,
      names: deps.names,
      nations: Object.values(state.nations),
      season: state.date.season,
    },
    club.id,
    nation,
    // The worst intake the generator will produce, from no facilities and no
    // academy director. Nobody good arrives this way.
    0,
    0,
    1,
    // Local, always. A club scraping bodies together is not flying anyone in.
    0,
  )
  if (!player) return null

  player.age = 16
  player.joinedSeason = state.date.season
  state.players[player.id] = player
  club.squad.push(player.id)
  return player
}

export interface MatchdayFix {
  promoted: Player[]
  conjured: Player[]
  signed: Player[]
}

/**
 * Get an AI club to eleven, by whatever means it has.
 *
 * In order of what a real club would reach for: the academy first, because
 * those players are already registered and already there; a free agent next,
 * because that costs money and takes a day; and an invented sixteen-year-old
 * last, because that is an admission.
 */
export function fixAiSquad(
  state: GameState,
  club: Club,
  deps: MatchdayDeps,
  week: number,
): MatchdayFix {
  const fix: MatchdayFix = { promoted: [], conjured: [], signed: [] }
  let guard = 0

  while (fieldable(state, club, week).length < AI_RECOVERY_TARGET && guard++ < 30) {
    const before = fieldable(state, club, week).length

    // 1. The academy. Best first — a crisis is still a chance for the ones
    //    who are ready, which is how a career really starts.
    const academy = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && p.isAcademy && p.age >= 15)
      .sort((a, b) => b.currentAbility - a.currentAbility)
    if (academy.length > 0) {
      const result = promoteToSenior(state, club, academy[0])
      if (result.ok) {
        fix.promoted.push(academy[0])
        continue
      }
    }

    // 2. A free agent, capped a quarter above the best player at the club so
    //    the fix stays in proportion to the club it is fixing.
    const signing = signEmergencyFreeAgent(state, club)
    if (signing) {
      fix.signed.push(signing)
      continue
    }

    // 3. Somebody. Anybody.
    const youth = conjureYouth(state, club, deps)
    if (youth) {
      const result = promoteToSenior(state, club, youth)
      if (result.ok) {
        fix.conjured.push(youth)
        continue
      }
    }

    if (fieldable(state, club, week).length <= before) break
  }

  return fix
}

/**
 * The best free agent a club in trouble could plausibly attract.
 *
 * Bounded by the squad rather than by the club's standing: a quarter above the
 * best player already there. The old bound was an ability ceiling derived from
 * reputation, which measured 34 clubs sitting below the emergency floor while
 * 2,174 free agents went unsigned — every one of them too good for anybody who
 * needed them, and none of them playing.
 */
export function signEmergencyFreeAgent(
  state: GameState,
  club: Club,
): Player | null {
  const squad = seniorSquad(state, club)
  const best = squad.reduce((max, p) => Math.max(max, p.currentAbility), 0)
  // An empty squad has no reference, so fall back to what the division is.
  const reference = best > 0 ? best : (state.leagues[club.leagueId]?.reputation ?? 40) * 1.4
  const ceiling = reference * EMERGENCY_ABILITY_HEADROOM

  const league = state.leagues[club.leagueId] ?? null
  const nation = state.nations[club.nationId] ?? null

  let target: Player | null = null
  for (const player of Object.values(state.players)) {
    if (player.clubId || player.isAcademy) continue
    if (player.injury && player.injury.weeksRemaining > 0) continue
    if (player.currentAbility > ceiling) continue
    if (!target || player.currentAbility > target.currentAbility) target = player
  }
  if (!target) return null

  // Signed on what he is asking, for the rest of the season. A club in this
  // position does not negotiate, and the overspend is answered for by the
  // crisis machinery exactly as it should be.
  const wage = Math.max(90, Math.round(computeWageDemand(target, league, nation)))
  target.clubId = club.id
  target.loanClubId = null
  target.weeksUnattached = 0
  target.joinedSeason = state.date.season
  target.squadStatus = 'backup'
  target.desiredStatus = 'backup'
  target.contract = {
    wage,
    expiresSeason: state.date.season + 1,
    signingBonus: 0,
    releaseClause: null,
    appearanceFee: 0,
    goalBonus: 0,
    loyaltyBonus: 0,
    inNegotiation: false,
    weeksSinceRenewalRequest: 0,
  }
  target.value = computeValue(target, league, nation, state.date.season)
  club.squad.push(target.id)
  // Under-21s need no place on the list; anyone older does, and a club in this
  // state has places going spare.
  if (!club.registeredIds.includes(target.id)) club.registeredIds.push(target.id)
  return target
}

/**
 * Warn the human, every week it is true, as early as it is true.
 *
 * Not on match day — by then it is a dismissal rather than a warning. The
 * moment the squad cannot field eleven, whoever is at fault, he is told.
 */
export function warnHuman(
  state: GameState,
  club: Club,
  ids: IdFactory,
  week: number,
  weeksUntilMatch: number | null,
): void {
  const count = fieldable(state, club, week).length
  const short = ELEVEN - count
  addInboxItem(state, ids, {
    category: 'player',
    subject: `We cannot field a side — ${short} short`,
    from: 'Club Secretary',
    body: `We have ${count} player${count === 1 ? '' : 's'} available and we need eleven. `
      + (weeksUntilMatch !== null && weeksUntilMatch <= 1
        ? 'We play this week. '
        : `Our next fixture is in ${weeksUntilMatch ?? 'several'} weeks. `)
      + 'Promote from the academy, sign somebody, or get players registered. '
      + 'If we take the field short the board will not be asking me about it.',
    urgent: true,
    link: { view: 'squad' },
  })
}
