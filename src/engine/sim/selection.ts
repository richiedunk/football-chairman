import { clamp, Rng } from '../rng'
import { positionalCompetence, ratingForPosition } from '../world/attributes'
import type {
  CoachProfile, Club, Formation, GameState, Player, Position, Staff,
} from '../types'

/**
 * Team selection.
 *
 * The director of football does not pick the team — the head coach does. This
 * module is therefore the AI opponent to your squad building: you can sign a
 * brilliant left-footed playmaker, and a coach who plays 4-4-2 and distrusts
 * anyone under 23 will leave him on the bench, tanking his form, his morale
 * and his resale value. That friction is the game.
 */

/** Which positions each formation actually fields. */
export const FORMATION_SHAPES: Record<Formation, Position[]> = {
  '4-4-2': ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'ST', 'ST'],
  '4-3-3': ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'MR', 'ST', 'ML'],
  '4-2-3-1': ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'DM', 'MR', 'AM', 'ML', 'ST'],
  '3-5-2': ['GK', 'DC', 'DC', 'DC', 'MR', 'MC', 'MC', 'DM', 'ML', 'ST', 'ST'],
  '5-3-2': ['GK', 'DR', 'DC', 'DC', 'DC', 'DL', 'MC', 'MC', 'DM', 'ST', 'ST'],
  '4-1-4-1': ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MR', 'MC', 'MC', 'ML', 'ST'],
  '3-4-3': ['GK', 'DC', 'DC', 'DC', 'MR', 'MC', 'MC', 'ML', 'ST', 'ST', 'ST'],
}

/**
 * Order in which slots are filled. The spine goes first, because a coach
 * picking a side settles his goalkeeper and centre-backs before he worries
 * about which winger starts.
 */
const SLOT_PRIORITY: Position[] = ['GK', 'DC', 'DM', 'MC', 'ST', 'DR', 'DL', 'AM', 'MR', 'ML']

export interface SelectedTeam {
  starters: { playerId: string; position: Position }[]
  bench: string[]
  /** Combined strengths used by the match engine, each 0-200. */
  strength: { defence: number; midfield: number; attack: number; goalkeeper: number }
  formation: Formation
  /** Players left out who had a reasonable claim — feeds unrest and morale. */
  unluckyOmissions: string[]
}

export interface AvailabilityContext {
  suspendedIds: Set<string>
}

/** Whether a player can be selected at all this week. */
export function isAvailable(player: Player, ctx?: AvailabilityContext): boolean {
  if (player.injury && player.injury.weeksRemaining > 0) return false
  if (ctx?.suspendedIds.has(player.id)) return false
  if (player.loanClubId) return false
  return true
}

/**
 * How good a player is *for this coach in this slot*, on the 1-200 scale.
 * Combines raw positional rating with the situational modifiers a coach
 * actually reacts to: form, sharpness, and his own stylistic preferences.
 */
export function selectionScore(
  player: Player,
  slot: Position,
  coach: CoachProfile | null,
  club: Club,
): number {
  const competence = positionalCompetence(player.position, player.altPositions, slot)
  if (competence < 0.2) return 0

  let score = ratingForPosition(player.attributes, slot) * competence

  // Form and sharpness. A player who has not played is not match fit, which is
  // what makes a squad rotation policy matter rather than just a squad list.
  score *= 0.82 + (player.form / 100) * 0.26
  score *= 0.85 + (player.fitness / 100) * 0.18
  score *= 0.9 + (player.morale / 100) * 0.14

  if (coach) {
    // Coaches over-value the attributes their style depends on. A high-press
    // coach will pick the tireless 140-rated midfielder over the languid
    // 150-rated one, and you have to recruit knowing that.
    let styleBonus = 0
    for (const key of coach.valuedAttributes) {
      styleBonus += (player.attributes[key] - 10) * 1.4
    }
    score += styleBonus * (club.strategy.systemFit / 100)

    // Trust in youth, applied as a penalty rather than a hard rule so a
    // genuinely outstanding teenager still forces his way in.
    if (player.age <= 20) {
      const distrust = (100 - coach.trustInYouth) / 100
      score *= 1 - distrust * 0.28
    }
    if (player.age >= 33) {
      score *= 1 - ((100 - coach.trustInYouth) / 100) * 0.05
    }
  }

  // Squad status carries a little weight of its own: a designated star gets
  // the benefit of the doubt in a way a squad player does not.
  const statusBonus: Record<string, number> = {
    star: 6, firstTeam: 3, rotation: 0, backup: -3, prospect: -5, surplus: -12,
  }
  score += statusBonus[player.squadStatus] ?? 0

  return Math.max(0, score)
}

/**
 * Pick a starting eleven and a bench.
 *
 * Greedy assignment in spine-first order. A full optimal assignment (Hungarian
 * algorithm) would gain very little here — coaches are not optimal either, and
 * greedy selection reproduces the recognisable behaviour of a manager who
 * settles his best defender first and squeezes the rest around him.
 */
export function selectTeam(
  state: GameState,
  club: Club,
  rng: Rng,
  ctx?: AvailabilityContext,
): SelectedTeam {
  const coachStaff: Staff | null = club.headCoachId ? state.staff[club.headCoachId] ?? null : null
  const coach = coachStaff?.coachProfile ?? null
  const formation = coach?.formation ?? '4-4-2'
  const shape = FORMATION_SHAPES[formation]

  const available = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && isAvailable(p, ctx))
    // Academy players are only considered once promoted, or if the squad is
    // too thin to field eleven — which is exactly the crisis that forces a
    // director of football to act.
    .filter((p) => !p.isAcademy)

  const pool = available.length >= 11
    ? available
    : club.squad
        .map((id) => state.players[id])
        .filter((p): p is Player => Boolean(p) && isAvailable(p, ctx))

  // Slots ordered spine-first, keeping duplicates (a 4-4-2 has two MC slots).
  const orderedSlots = shape
    .slice()
    .sort((a, b) => SLOT_PRIORITY.indexOf(a) - SLOT_PRIORITY.indexOf(b))

  const taken = new Set<string>()
  const starters: { playerId: string; position: Position }[] = []

  for (const slot of orderedSlots) {
    let best: Player | null = null
    let bestScore = -1
    for (const player of pool) {
      if (taken.has(player.id)) continue
      const score = selectionScore(player, slot, coach, club)
      // A little noise so the same eleven is not picked mechanically every
      // week, scaled by how much this coach rotates.
      const jitter = rng.normal(0, 3 + (coach?.rotationTendency ?? 40) / 12)
      if (score + jitter > bestScore) {
        bestScore = score + jitter
        best = player
      }
    }
    if (best) {
      taken.add(best.id)
      starters.push({ playerId: best.id, position: slot })
    }
  }

  // Bench: the next seven by their best-position score.
  const benchCandidates = pool
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ player: p, score: selectionScore(p, p.position, coach, club) }))
    .sort((a, b) => b.score - a.score)

  const bench = benchCandidates.slice(0, 7).map((c) => c.player.id)

  // Anyone strong enough to expect a start who did not get one. This drives
  // the unrest system: the £12m signing on the bench is a problem you created.
  const startingScores = starters.map((s) => {
    const p = state.players[s.playerId]
    return p ? selectionScore(p, s.position, coach, club) : 0
  })
  const weakestStarter = Math.min(...startingScores.filter((s) => s > 0), Infinity)
  const unluckyOmissions = benchCandidates
    .filter((c) => c.score > weakestStarter && c.player.squadStatus !== 'prospect')
    .map((c) => c.player.id)

  return {
    starters,
    bench,
    strength: computeStrength(state, starters, coach),
    formation,
    unluckyOmissions,
  }
}

/**
 * Collapse a selected eleven into the four numbers the match engine reasons
 * about. Midfield is weighted most heavily because control of midfield is what
 * actually generates chances, and because it keeps 4-2-3-1 and 4-4-2 from
 * producing identical output.
 */
function computeStrength(
  state: GameState,
  starters: { playerId: string; position: Position }[],
  coach: CoachProfile | null,
): { defence: number; midfield: number; attack: number; goalkeeper: number } {
  const buckets = { defence: [] as number[], midfield: [] as number[], attack: [] as number[], goalkeeper: [] as number[] }

  for (const { playerId, position } of starters) {
    const player = state.players[playerId]
    if (!player) continue
    const rating = ratingForPosition(player.attributes, position)
      * positionalCompetence(player.position, player.altPositions, position)
      * (0.85 + (player.fitness / 100) * 0.15)
      * (0.88 + (player.form / 100) * 0.2)

    if (position === 'GK') buckets.goalkeeper.push(rating)
    else if (position === 'DC' || position === 'DL' || position === 'DR') buckets.defence.push(rating)
    else if (position === 'ST' || position === 'AM') buckets.attack.push(rating)
    else buckets.midfield.push(rating)
  }

  const mean = (arr: number[], fallback = 60) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback

  const strength = {
    defence: mean(buckets.defence),
    midfield: mean(buckets.midfield),
    attack: mean(buckets.attack),
    goalkeeper: mean(buckets.goalkeeper),
  }

  // Coaching style shifts where a side is strong. The same eleven set up to
  // press is more dangerous and more vulnerable than the same eleven sitting
  // deep, which is why a coach's style is a squad-building constraint.
  if (coach) {
    switch (coach.style) {
      case 'highPress':
        strength.attack *= 1.08
        strength.defence *= 0.94
        strength.midfield *= 1.04
        break
      case 'defensive':
        strength.defence *= 1.11
        strength.attack *= 0.9
        break
      case 'counterAttack':
        strength.attack *= 1.05
        strength.midfield *= 0.96
        strength.defence *= 1.03
        break
      case 'possession':
        strength.midfield *= 1.09
        strength.attack *= 0.99
        break
      case 'direct':
        strength.attack *= 1.04
        strength.midfield *= 0.95
        break
      default:
        break
    }
  }

  return {
    defence: clamp(strength.defence, 1, 200),
    midfield: clamp(strength.midfield, 1, 200),
    attack: clamp(strength.attack, 1, 200),
    goalkeeper: clamp(strength.goalkeeper, 1, 200),
  }
}

/** Squad-depth audit surfaced on the squad screen and in coach requests. */
export function auditSquadDepth(
  state: GameState,
  club: Club,
): { position: Position; count: number; bestRating: number; shortage: boolean }[] {
  const coach = club.headCoachId ? state.staff[club.headCoachId]?.coachProfile ?? null : null
  const shape = FORMATION_SHAPES[coach?.formation ?? '4-4-2']
  const needed = new Map<Position, number>()
  for (const pos of shape) needed.set(pos, (needed.get(pos) ?? 0) + 1)

  const squad = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)

  return Array.from(needed.entries()).map(([position, count]) => {
    const capable = squad.filter(
      (p) => positionalCompetence(p.position, p.altPositions, position) >= 0.7,
    )
    const bestRating = capable.length
      ? Math.max(...capable.map((p) => ratingForPosition(p.attributes, position)))
      : 0
    return {
      position,
      count: capable.length,
      bestRating: Math.round(bestRating),
      // A position needs cover: one senior option for a slot is a squad crisis
      // waiting for an injury.
      shortage: capable.length < count + 1,
    }
  })
}
