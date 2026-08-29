import { clamp, Rng } from '../rng'
import { staffEffectiveness } from '../world/staffGen'
import { invalidatePlayerRatings } from '../world/attributes'
import type { Club, GameState, Injury, Player, Staff } from '../types'

/**
 * Injuries and fitness.
 *
 * Injuries are the main reason squad depth is a real cost rather than an
 * abstraction. They also give the medical centre and the physio a measurable
 * return, which is what makes the facilities screen a decision instead of a
 * shopping list.
 */

interface InjuryTemplate {
  type: string
  severity: Injury['severity']
  minWeeks: number
  maxWeeks: number
  weight: number
  /** Chance this injury leaves a permanent mark on physical attributes. */
  lingerChance: number
}

const INJURY_TYPES: InjuryTemplate[] = [
  { type: 'Dead leg', severity: 'knock', minWeeks: 1, maxWeeks: 1, weight: 22, lingerChance: 0 },
  { type: 'Bruised ribs', severity: 'knock', minWeeks: 1, maxWeeks: 2, weight: 12, lingerChance: 0 },
  { type: 'Tight hamstring', severity: 'minor', minWeeks: 2, maxWeeks: 3, weight: 18, lingerChance: 0.02 },
  { type: 'Ankle sprain', severity: 'minor', minWeeks: 2, maxWeeks: 4, weight: 15, lingerChance: 0.03 },
  { type: 'Groin strain', severity: 'minor', minWeeks: 2, maxWeeks: 4, weight: 12, lingerChance: 0.03 },
  { type: 'Hamstring tear', severity: 'moderate', minWeeks: 5, maxWeeks: 9, weight: 9, lingerChance: 0.08 },
  { type: 'Broken metatarsal', severity: 'moderate', minWeeks: 6, maxWeeks: 12, weight: 5, lingerChance: 0.1 },
  { type: 'Medial ligament damage', severity: 'serious', minWeeks: 10, maxWeeks: 18, weight: 4, lingerChance: 0.2 },
  { type: 'Shoulder dislocation', severity: 'serious', minWeeks: 8, maxWeeks: 14, weight: 2, lingerChance: 0.15 },
  { type: 'Cruciate ligament rupture', severity: 'severe', minWeeks: 32, maxWeeks: 48, weight: 1, lingerChance: 0.55 },
  { type: 'Achilles rupture', severity: 'severe', minWeeks: 28, maxWeeks: 44, weight: 0.7, lingerChance: 0.6 },
]

/** Roll a new injury for a player, scaled by the club's medical department. */
export function rollInjury(rng: Rng, player: Player, medicalLevel: number, physioSkill: number): Injury {
  // Injury-prone and older players suffer proportionally more of the serious
  // injuries, not merely more injuries overall — which is what makes a
  // 33-year-old with a history a genuinely different risk to carry.
  const severityBias = 1 + (player.injuryProneness / 100) * 0.8 + Math.max(0, player.age - 30) * 0.06
  const template = rng.weighted(
    INJURY_TYPES,
    INJURY_TYPES.map((t) =>
      t.severity === 'knock' || t.severity === 'minor' ? t.weight : t.weight * severityBias,
    ),
  )

  // A good medical department shortens recovery meaningfully but never
  // eliminates it — that keeps the investment worthwhile without trivialising
  // a cruciate.
  const medicalFactor = clamp(1.25 - (medicalLevel / 20) * 0.3 - (physioSkill / 100) * 0.22, 0.6, 1.25)
  const weeks = Math.max(1, Math.round(rng.int(template.minWeeks, template.maxWeeks) * medicalFactor))

  return {
    type: template.type,
    weeksRemaining: weeks,
    severity: template.severity,
    lingeringEffect: rng.chance(template.lingerChance) ? rng.float(0.01, 0.05) : 0,
  }
}

/**
 * Weekly injury and fitness pass for one club.
 *
 * Returns the players who picked up a new injury, so the tick can raise inbox
 * items — a director of football finds out about a cruciate from the medical
 * department, not by noticing a name greyed out in the squad list.
 */
export function processInjuries(
  state: GameState,
  club: Club,
  rng: Rng,
  playedThisWeek: boolean,
): { newInjuries: Player[]; recovered: Player[] } {
  const newInjuries: Player[] = []
  const recovered: Player[] = []

  const physio = club.staff
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s) && s.role === 'physio')
    .sort((a, b) => staffEffectiveness(b) - staffEffectiveness(a))[0]
  const physioSkill = physio ? staffEffectiveness(physio) : 30
  const medicalLevel = club.facilities.medicalCentre

  for (const id of club.squad) {
    const player = state.players[id]
    if (!player) continue

    if (player.injury) {
      player.injury.weeksRemaining -= 1
      // Fitness decays while out, so a returning player is not immediately
      // available — the reason a squad needs cover for the whole recovery,
      // not just the injury itself.
      player.fitness = clamp(player.fitness - 4, 20, 100)
      if (player.injury.weeksRemaining <= 0) {
        if (player.injury.lingeringEffect > 0) {
          // A permanent cost, applied once, to the attributes that carry it.
          const loss = player.injury.lingeringEffect
          player.attributes.pace = clamp(Math.round(player.attributes.pace * (1 - loss)), 1, 20)
          player.attributes.stamina = clamp(Math.round(player.attributes.stamina * (1 - loss)), 1, 20)
          player.currentAbility = clamp(player.currentAbility * (1 - loss * 0.5), 1, 200)
          player.injuryProneness = clamp(player.injuryProneness + 8, 0, 100)
          invalidatePlayerRatings(player.id)
        }
        player.injury = null
        recovered.push(player)
      }
      continue
    }

    // Training-ground injuries. Rarer than match injuries but they happen, and
    // they scale with how hard the squad is being worked.
    const baseRisk = playedThisWeek ? 0.008 : 0.004
    const risk = baseRisk * (0.4 + player.injuryProneness / 55) * (medicalLevel < 8 ? 1.25 : 1)
    if (rng.chance(risk)) {
      player.injury = rollInjury(rng, player, medicalLevel, physioSkill)
      newInjuries.push(player)
      continue
    }

    // Fitness recovery between matches.
    const recovery = playedThisWeek ? 3 : 7
    player.fitness = clamp(player.fitness + recovery + (medicalLevel / 20) * 3, 20, 100)
  }

  return { newInjuries, recovered }
}

/** Match participation costs fitness; the amount depends on stamina. */
export function applyMatchFatigue(player: Player, minutes: number, rng: Rng): void {
  const staminaFactor = 1.4 - (player.attributes.stamina / 20) * 0.7
  const cost = (minutes / 90) * 16 * staminaFactor * rng.float(0.8, 1.2)
  player.fitness = clamp(player.fitness - cost, 15, 100)
}

export function injuryDescription(injury: Injury): string {
  const weeks = injury.weeksRemaining
  const duration = weeks === 1 ? '1 week' : `${weeks} weeks`
  return `${injury.type} — out for ${duration}`
}

export const SEVERITY_LABELS: Record<Injury['severity'], string> = {
  knock: 'Knock',
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
  severe: 'Severe',
}
