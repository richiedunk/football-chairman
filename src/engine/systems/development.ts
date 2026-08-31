import { clamp, Rng } from '../rng'
import {
  calibrate, generateAttributes, invalidatePlayerRatings, POSITION_WEIGHTS, ratingForPosition,
} from '../world/attributes'
import { staffEffectiveness } from '../world/staffGen'
import type { AttributeKey, Club, GameState, Player, Staff } from '../types'

/**
 * Player development and decline.
 *
 * Runs weekly. A player's ability moves toward — or away from — his potential
 * depending on age, playing time, coaching, facilities and his own
 * determination. This is the system that pays for the academy, justifies the
 * training ground upgrade, and punishes you for buying a 21-year-old and
 * then leaving him on the bench for two seasons.
 */

/**
 * Peak years. Players improve toward potential until roughly 24, plateau, then
 * decline from about 30 — sharply for pace-dependent players, gently for
 * those whose game is built on positioning and passing.
 */
const GROWTH_END_AGE = 24
const PLATEAU_END_AGE = 29

/** Attributes that decay first and fastest with age. */
const PHYSICAL_ATTRIBUTES: AttributeKey[] = ['pace', 'agility', 'stamina', 'strength']
/** Attributes that keep improving into a player's thirties. */
const MENTAL_ATTRIBUTES: AttributeKey[] = [
  'composure', 'vision', 'positioning', 'leadership', 'determination',
]

export interface DevelopmentContext {
  rng: Rng
  /** Weeks of the season elapsed, used to pace growth over 52 ticks. */
  week: number
}

/**
 * Advance one player by one week.
 *
 * Returns a description of any notable change, for the inbox — a director of
 * football should be told when a prospect kicks on, because that is the
 * moment his sale value moves.
 */
export function developPlayer(
  state: GameState,
  player: Player,
  ctx: DevelopmentContext,
): string | null {
  if (!player.clubId) return null
  const club = state.clubs[player.clubId]
  if (!club) return null

  const { rng } = ctx
  const before = player.currentAbility

  const coaching = coachingQuality(state, club, player)
  const facilityFactor = 0.6 + (club.facilities.trainingGround / 20) * 0.8
  const youthFactor = player.age <= 20
    ? 0.7 + (club.facilities.youthFacilities / 20) * 0.7
    : 1

  // Playing time is the single biggest driver. A young player who is not
  // playing does not develop, however good the training ground is — which is
  // why loaning prospects out is a real strategy and not just squad tidying.
  const minutesFactor = playingTimeFactor(player)

  // Determination and the hidden development rate separate two players with
  // identical attributes and identical minutes.
  const personality = (player.attributes.determination / 20) * 0.7 + 0.5
  const professionalism = player.traits.includes('professional') ? 1.15
    : player.traits.includes('disruptive') ? 0.85 : 1

  if (player.age <= GROWTH_END_AGE) {
    const headroom = player.potentialAbility - player.currentAbility
    if (headroom > 0) {
      // Growth is proportional to remaining headroom, so players converge on
      // their ceiling rather than crossing it, and the last few points are
      // always the slowest to come.
      const weeklyGrowth =
        (headroom / 100)
        * 0.55
        * coaching
        * facilityFactor
        * youthFactor
        * minutesFactor
        * personality
        * professionalism
        * player.developmentRate
        * rng.float(0.5, 1.5)

      applyAbilityChange(player, weeklyGrowth, rng)
    }
  } else if (player.age <= PLATEAU_END_AGE) {
    // Plateau: small movements either way, still reachable if minutes are good.
    const headroom = player.potentialAbility - player.currentAbility
    if (headroom > 0 && minutesFactor > 0.6) {
      applyAbilityChange(player, (headroom / 100) * 0.18 * coaching * minutesFactor * rng.float(0.3, 1.2), rng)
    } else if (minutesFactor < 0.3 && rng.chance(0.12)) {
      applyAbilityChange(player, -0.12 * rng.float(0.5, 1.5), rng)
    }
  } else {
    // Decline. Steeper for players whose value is physical.
    const yearsPast = player.age - PLATEAU_END_AGE
    const physicalReliance = physicalRelianceOf(player)
    const decline =
      0.055
      * yearsPast
      * (0.6 + physicalReliance * 0.9)
      * (minutesFactor > 0.5 ? 0.85 : 1.15)
      * (player.traits.includes('professional') ? 0.85 : 1)
      * rng.float(0.4, 1.6)

    applyAbilityChange(player, -decline, rng)
  }

  const after = player.currentAbility
  const delta = after - before

  // Only report movement large enough to matter, and only for players the
  // director would plausibly be told about.
  if (Math.abs(delta) >= 3 && (player.age <= 23 || player.currentAbility > 120)) {
    return delta > 0
      ? `${player.knownAs} has kicked on — coaching staff report a clear step up.`
      : `${player.knownAs} has slipped back; the staff are concerned.`
  }
  return null
}

/**
 * Apply an ability change and redistribute it across attributes, so the
 * profile a scout reports always matches the underlying number.
 */
function applyAbilityChange(player: Player, delta: number, rng: Rng): void {
  const next = clamp(player.currentAbility + delta, 1, player.potentialAbility)
  if (Math.abs(next - player.currentAbility) < 0.01) return

  const growing = next > player.currentAbility
  player.currentAbility = next

  // Physical decline hits pace and stamina first; growth favours the
  // attributes the player's position actually uses.
  const weights = POSITION_WEIGHTS[player.position]
  const pool: AttributeKey[] = growing
    ? (Object.keys(weights) as AttributeKey[])
    : player.age > PLATEAU_END_AGE
      ? PHYSICAL_ATTRIBUTES
      : (Object.keys(weights) as AttributeKey[])

  // Mental attributes keep creeping up even in decline — the veteran who
  // "reads the game" is real, and it is why an ageing centre-back holds value
  // longer than an ageing winger.
  if (!growing && player.age > PLATEAU_END_AGE && rng.chance(0.35)) {
    const key = rng.pick(MENTAL_ATTRIBUTES)
    player.attributes[key] = clamp(player.attributes[key] + 1, 1, 20)
    invalidatePlayerRatings(player.id)
  }

  let attributeMoved = false
  if (rng.chance(Math.min(1, Math.abs(delta)))) {
    const key = rng.pick(pool)
    const step = growing ? 1 : -1
    const next = clamp(player.attributes[key] + step, 1, 20)
    if (next !== player.attributes[key]) {
      player.attributes[key] = next
      attributeMoved = true
    }
  }

  // Recalibrating is the single most expensive operation in the weekly tick —
  // it runs an iterative solve over every weighted attribute. Most weeks a
  // player's ability creeps by a fraction of a point and no attribute moves at
  // all, so there is nothing to reconcile. Only pay for it when there is.
  if (attributeMoved) {
    calibrate(player.attributes, player.position, Math.round(player.currentAbility))
    invalidatePlayerRatings(player.id)
  }
}

/** Effective coaching quality for this player, 0.5 - 1.6. */
function coachingQuality(state: GameState, club: Club, player: Player): number {
  const staff = club.staff.map((id) => state.staff[id]).filter((s): s is Staff => Boolean(s))

  const relevant = staff.filter((s) => {
    if (player.position === 'GK') return s.role === 'goalkeepingCoach' || s.role === 'headCoach'
    if (player.age <= 20) return s.role === 'academyDirector' || s.role === 'headCoach' || s.role === 'assistantCoach'
    return s.role === 'headCoach' || s.role === 'assistantCoach' || s.role === 'fitnessCoach'
  })

  if (relevant.length === 0) return 0.7
  const avg = relevant.reduce((sum, s) => sum + staffEffectiveness(s), 0) / relevant.length
  return 0.55 + (avg / 100) * 1.05
}

/**
 * How much a player has been playing, expressed as a 0-1.3 multiplier. Uses
 * season appearances relative to how far into the season we are.
 */
function playingTimeFactor(player: Player): number {
  const apps = player.stats.appearances
  const minutes = player.stats.minutes
  if (apps === 0) return player.age <= 19 ? 0.35 : 0.2
  // Roughly: a regular starter accumulates ~90 minutes per league match.
  const share = clamp(minutes / Math.max(1, apps * 90), 0, 1)
  const volume = clamp(apps / 25, 0, 1)
  return 0.3 + share * 0.45 + volume * 0.55
}

/** 0-1: how much of this player's game rests on physical attributes. */
function physicalRelianceOf(player: Player): number {
  const weights = POSITION_WEIGHTS[player.position]
  let physical = 0
  let total = 0
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += weight
    if (PHYSICAL_ATTRIBUTES.includes(key)) physical += weight
  }
  return total > 0 ? physical / total : 0.3
}

/**
 * Annual ageing, run once at the start of a season. Separated from weekly
 * development because a birthday is a discrete event and the value/wage
 * recalculation that follows is expensive.
 */
export function ageOneYear(player: Player): void {
  player.age += 1
  // Potential is revised down for players who have plainly stopped improving,
  // which stops the squad list being full of 26-year-olds still labelled as
  // having enormous unrealised potential.
  if (player.age >= 25 && player.potentialAbility > player.currentAbility) {
    const gap = player.potentialAbility - player.currentAbility
    player.potentialAbility = Math.round(
      clamp(player.currentAbility + gap * 0.55, player.currentAbility, 200),
    )
  }
  if (player.age >= 29) player.potentialAbility = Math.round(player.currentAbility)
}

/**
 * Rebuild a player's attribute profile after a positional retrain. Used when a
 * coach converts an ageing full-back into a centre-back — a genuine
 * squad-management lever for a director of football with an old squad.
 */
export function retrainPosition(
  rng: Rng,
  player: Player,
  newPosition: Player['position'],
): void {
  if (!player.altPositions.includes(player.position)) {
    player.altPositions.push(player.position)
  }
  player.position = newPosition
  // Retraining costs something: the player is not immediately as effective in
  // the new role as his old rating suggested.
  const targetAbility = clamp(player.currentAbility * 0.94, 1, 200)
  player.attributes = generateAttributes(rng, newPosition, targetAbility, 0.5)
  player.currentAbility = ratingForPosition(player.attributes, newPosition)
  invalidatePlayerRatings(player.id)
}
