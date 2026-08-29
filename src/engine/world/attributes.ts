import { clamp, Rng } from '../rng'
import type { AttributeKey, PlayerAttributes, Position, PositionGroup } from '../types'

/**
 * Attribute generation and ability accounting.
 *
 * A player's `currentAbility` (1-200) is the single number the simulation and
 * the transfer market reason about; individual attributes are a *presentation*
 * of that number, distributed according to position. Generating attributes
 * from an ability budget rather than the reverse keeps the two consistent —
 * otherwise you get 180-rated players whose attributes say otherwise, and the
 * scouting system, which reports attributes, starts lying to the user.
 */

export const ALL_ATTRIBUTES: AttributeKey[] = [
  'passing', 'shooting', 'dribbling', 'tackling', 'heading', 'crossing', 'setPieces', 'firstTouch',
  'pace', 'strength', 'stamina', 'agility',
  'composure', 'vision', 'workRate', 'positioning', 'leadership', 'determination', 'temperament',
  'reflexes', 'handling', 'distribution', 'command',
]

export const OUTFIELD_ATTRIBUTES: AttributeKey[] = ALL_ATTRIBUTES.filter(
  (a) => !['reflexes', 'handling', 'distribution', 'command'].includes(a),
)

export const GOALKEEPER_ATTRIBUTES: AttributeKey[] = [
  'reflexes', 'handling', 'distribution', 'command',
  'positioning', 'composure', 'agility', 'strength', 'determination', 'temperament',
  'leadership', 'workRate', 'passing', 'firstTouch',
]

/**
 * How much each attribute contributes to a player's effectiveness in a given
 * position. These weights do double duty: they shape generated attributes, and
 * they convert an existing attribute set back into a positional rating when the
 * coach picks a side or a scout judges a player out of position.
 */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  GK: {
    reflexes: 10, handling: 9, command: 8, distribution: 6, positioning: 8,
    composure: 6, agility: 6, strength: 3, determination: 4, temperament: 4,
    leadership: 3, workRate: 2, passing: 3, firstTouch: 2,
  },
  DC: {
    tackling: 10, heading: 9, strength: 8, positioning: 9, composure: 6,
    pace: 5, determination: 6, leadership: 5, passing: 5, firstTouch: 4,
    workRate: 5, agility: 3, vision: 3, stamina: 5, temperament: 5, setPieces: 2,
  },
  DL: {
    tackling: 8, pace: 8, stamina: 8, crossing: 7, positioning: 7,
    workRate: 7, passing: 5, dribbling: 5, agility: 5, strength: 4,
    composure: 4, determination: 5, heading: 4, firstTouch: 4, vision: 3, temperament: 3,
  },
  DR: {
    tackling: 8, pace: 8, stamina: 8, crossing: 7, positioning: 7,
    workRate: 7, passing: 5, dribbling: 5, agility: 5, strength: 4,
    composure: 4, determination: 5, heading: 4, firstTouch: 4, vision: 3, temperament: 3,
  },
  DM: {
    tackling: 9, positioning: 9, passing: 8, workRate: 8, stamina: 7,
    strength: 6, composure: 6, vision: 5, determination: 6, heading: 5,
    firstTouch: 5, leadership: 5, agility: 3, pace: 4, temperament: 4, shooting: 2,
  },
  MC: {
    passing: 9, vision: 8, firstTouch: 8, composure: 7, stamina: 7,
    workRate: 7, dribbling: 6, tackling: 5, positioning: 6, shooting: 5,
    determination: 5, agility: 5, setPieces: 4, strength: 4, pace: 4, leadership: 4, temperament: 3,
  },
  ML: {
    dribbling: 8, crossing: 8, pace: 8, stamina: 7, passing: 6,
    firstTouch: 6, agility: 6, workRate: 6, vision: 5, shooting: 5,
    composure: 5, tackling: 3, determination: 4, setPieces: 4, strength: 3, temperament: 3,
  },
  MR: {
    dribbling: 8, crossing: 8, pace: 8, stamina: 7, passing: 6,
    firstTouch: 6, agility: 6, workRate: 6, vision: 5, shooting: 5,
    composure: 5, tackling: 3, determination: 4, setPieces: 4, strength: 3, temperament: 3,
  },
  AM: {
    vision: 9, passing: 8, dribbling: 8, firstTouch: 8, composure: 7,
    shooting: 7, agility: 6, setPieces: 6, pace: 5, workRate: 4,
    determination: 4, stamina: 5, strength: 3, positioning: 4, temperament: 3, leadership: 3,
  },
  ST: {
    shooting: 10, composure: 8, firstTouch: 8, pace: 7, positioning: 7,
    heading: 7, strength: 6, dribbling: 6, agility: 5, determination: 6,
    vision: 4, passing: 4, workRate: 4, stamina: 5, temperament: 3, setPieces: 3,
  },
}

export function positionGroup(pos: Position): PositionGroup {
  if (pos === 'GK') return 'goalkeeper'
  if (pos === 'DC' || pos === 'DL' || pos === 'DR') return 'defender'
  if (pos === 'ST') return 'forward'
  if (pos === 'AM') return 'forward'
  return 'midfielder'
}

/** Positions a player of `pos` can plausibly also cover, and how well. */
export const POSITION_ADJACENCY: Record<Position, Partial<Record<Position, number>>> = {
  GK: {},
  DC: { DM: 0.75, DL: 0.6, DR: 0.6 },
  DL: { ML: 0.8, DC: 0.6, DR: 0.5 },
  DR: { MR: 0.8, DC: 0.6, DL: 0.5 },
  DM: { MC: 0.85, DC: 0.75 },
  MC: { DM: 0.85, AM: 0.8, ML: 0.65, MR: 0.65 },
  ML: { DL: 0.7, MC: 0.65, AM: 0.7, ST: 0.5 },
  MR: { DR: 0.7, MC: 0.65, AM: 0.7, ST: 0.5 },
  AM: { MC: 0.8, ST: 0.75, ML: 0.7, MR: 0.7 },
  ST: { AM: 0.75, ML: 0.5, MR: 0.5 },
}

/** How competent a player is in `target`, as a 0-1 multiplier. */
export function positionalCompetence(
  natural: Position,
  altPositions: Position[],
  target: Position,
): number {
  if (natural === target) return 1
  if (altPositions.includes(target)) return 0.94
  const adjacency = POSITION_ADJACENCY[natural]?.[target]
  if (adjacency !== undefined) return adjacency
  // Playing a striker at centre-back is possible and it is always a disaster.
  if (natural === 'GK' || target === 'GK') return 0.15
  return 0.4
}

/**
 * Positional-rating cache.
 *
 * Rating a player for a position is a weighted sum over ~16 attributes, and
 * team selection does it for every player against every slot, for every club,
 * every week. Profiling a full season showed match simulation taking 63% of
 * the weekly tick, almost all of it here.
 *
 * Attributes change at most once a week per player, and only through
 * development or a retrain — both of which invalidate explicitly. The cache is
 * transient and never serialised: it is derived data, and rebuilding it costs
 * one weighted sum.
 */
const ratingCache = new Map<string, Map<Position, number>>()

export function ratingForPositionCached(
  playerId: string,
  attrs: PlayerAttributes,
  pos: Position,
): number {
  let byPosition = ratingCache.get(playerId)
  if (!byPosition) {
    byPosition = new Map()
    ratingCache.set(playerId, byPosition)
  }
  const cached = byPosition.get(pos)
  if (cached !== undefined) return cached
  const value = ratingForPosition(attrs, pos)
  byPosition.set(pos, value)
  return value
}

/** Drop a player's cached ratings after his attributes change. */
export function invalidatePlayerRatings(playerId: string): void {
  ratingCache.delete(playerId)
}

/** Drop the whole cache — used when a save is loaded or a new game starts. */
export function clearRatingCache(): void {
  ratingCache.clear()
}

/**
 * Convert an attribute set into an effective rating for a position, on the
 * same 1-200 scale as currentAbility. This is the inverse of generation and
 * the two must agree, or a scouted attribute profile will not match the fee.
 */
/**
 * Mapping between the 1-20 attribute scale and the 1-200 ability scale.
 *
 * These are NOT proportional, and treating them as though they were is wrong
 * in a way that is obvious the moment you look at a lower-division squad: a
 * simple `mean x 10` gives a fourth-tier player Passing 2 and Shooting 1,
 * which reads as broken and leaves no room to tell one poor player from
 * another.
 *
 * The 1-20 scale is absolute across all of football. A non-league professional
 * is not one-tenth of a world-class one — he is slower and less technical, but
 * he is still a footballer, with a mean somewhere around 5. The best players in
 * the world average about 17, not 20, because nobody is elite at everything.
 * Anchoring those two points gives the linear mapping below.
 */
const ABILITY_AT_MEAN_ZERO = -55
const ABILITY_PER_ATTRIBUTE_POINT = 15

/** Attribute mean that corresponds to a given ability. Inverse of the above. */
export function meanAttributeForAbility(ability: number): number {
  return clamp((ability - ABILITY_AT_MEAN_ZERO) / ABILITY_PER_ATTRIBUTE_POINT, 1, 20)
}

export function ratingForPosition(attrs: PlayerAttributes, pos: Position): number {
  const weights = POSITION_WEIGHTS[pos]
  let total = 0
  let weightSum = 0
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += attrs[key] * weight
    weightSum += weight
  }
  if (weightSum === 0) return 1
  const mean = total / weightSum
  return clamp(mean * ABILITY_PER_ATTRIBUTE_POINT + ABILITY_AT_MEAN_ZERO, 1, 200)
}

/**
 * Distribute `currentAbility` into a plausible attribute set for `position`.
 *
 * `spikiness` controls how uneven the profile is. A low value gives the
 * well-rounded player who is a 7 out of 10 at everything; a high value gives
 * the specialist — blistering pace, no left foot — which makes the transfer
 * market more interesting than a list sorted by one number.
 */
export function generateAttributes(
  rng: Rng,
  position: Position,
  currentAbility: number,
  spikiness = 0.5,
): PlayerAttributes {
  const isKeeper = position === 'GK'
  const weights = POSITION_WEIGHTS[position]

  // Target mean attribute value that will reproduce `currentAbility` through
  // ratingForPosition. Solved directly rather than iterated.
  const targetMean = meanAttributeForAbility(currentAbility)

  const attrs = {} as PlayerAttributes
  for (const key of ALL_ATTRIBUTES) {
    const relevance = weights[key] ?? 0

    if (isKeeper && !GOALKEEPER_ATTRIBUTES.includes(key)) {
      // Outfield skills on a keeper: present but low, and irrelevant to rating.
      attrs[key] = rng.normalInt(6, 2.5, 1, 14)
      continue
    }
    if (!isKeeper && ['reflexes', 'handling', 'distribution', 'command'].includes(key)) {
      attrs[key] = rng.normalInt(3, 1.5, 1, 8)
      continue
    }

    if (relevance === 0) {
      // Irrelevant to this position: loosely correlated with overall quality so
      // a great player is not randomly hopeless at everything peripheral.
      attrs[key] = rng.normalInt(targetMean * 0.7, 3, 1, 20)
      continue
    }

    // Key attributes cluster tighter around the target; peripheral ones vary
    // more. Spikiness widens both.
    const importance = relevance / 10
    const spread = (1.2 + (1 - importance) * 2.2) * (0.6 + spikiness)
    const bias = (importance - 0.5) * 2.4 * spikiness
    attrs[key] = rng.normalInt(targetMean + bias, spread, 1, 20)
  }

  // Personality-ish attributes should not track ability — a 150-rated player is
  // no more likely to be level-headed than a 90-rated one.
  attrs.determination = rng.normalInt(12, 3.5, 1, 20)
  attrs.temperament = rng.normalInt(12, 4, 1, 20)
  attrs.leadership = rng.normalInt(10, 4, 1, 20)

  // Correct drift so the generated profile actually rates at currentAbility.
  return calibrate(attrs, position, currentAbility)
}

/**
 * Nudge attributes until `ratingForPosition` matches the intended ability.
 * Generation is stochastic, so without this a "150 CA" player might rate 138 —
 * and every downstream system (fee, wage, coach selection) would disagree with
 * the number the save file holds.
 */
export function calibrate(
  attrs: PlayerAttributes,
  position: Position,
  targetAbility: number,
): PlayerAttributes {
  const weights = POSITION_WEIGHTS[position]
  const relevantKeys = (Object.keys(weights) as AttributeKey[]).filter((k) => (weights[k] ?? 0) > 0)

  for (let iteration = 0; iteration < 24; iteration++) {
    const current = ratingForPosition(attrs, position)
    const diff = targetAbility - current
    if (Math.abs(diff) < 1.2) break

    const step = diff > 0 ? 1 : -1
    let adjusted = false
    // Move the attributes with the most headroom first, so calibration does not
    // pile everything onto one already-maxed attribute.
    const sorted = relevantKeys.slice().sort((a, b) =>
      step > 0 ? attrs[a] - attrs[b] : attrs[b] - attrs[a],
    )
    for (const key of sorted) {
      const next = attrs[key] + step
      if (next >= 1 && next <= 20) {
        attrs[key] = next
        adjusted = true
        if (Math.abs(ratingForPosition(attrs, position) - targetAbility) < 1.2) break
      }
    }
    if (!adjusted) break
  }
  return attrs
}

/** Human-readable grouping used by the player profile screen. */
export const ATTRIBUTE_GROUPS: { label: string; keys: AttributeKey[] }[] = [
  {
    label: 'Technical',
    keys: ['passing', 'shooting', 'dribbling', 'tackling', 'heading', 'crossing', 'setPieces', 'firstTouch'],
  },
  { label: 'Physical', keys: ['pace', 'strength', 'stamina', 'agility'] },
  {
    label: 'Mental',
    keys: ['composure', 'vision', 'workRate', 'positioning', 'leadership', 'determination', 'temperament'],
  },
  { label: 'Goalkeeping', keys: ['reflexes', 'handling', 'distribution', 'command'] },
]

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  passing: 'Passing',
  shooting: 'Shooting',
  dribbling: 'Dribbling',
  tackling: 'Tackling',
  heading: 'Heading',
  crossing: 'Crossing',
  setPieces: 'Set Pieces',
  firstTouch: 'First Touch',
  pace: 'Pace',
  strength: 'Strength',
  stamina: 'Stamina',
  agility: 'Agility',
  composure: 'Composure',
  vision: 'Vision',
  workRate: 'Work Rate',
  positioning: 'Positioning',
  leadership: 'Leadership',
  determination: 'Determination',
  temperament: 'Temperament',
  reflexes: 'Reflexes',
  handling: 'Handling',
  distribution: 'Distribution',
  command: 'Command of Area',
}
