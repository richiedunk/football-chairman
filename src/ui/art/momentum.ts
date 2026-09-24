import type { MatchEvent } from '../../engine/types'

/**
 * Who was on top, minute by minute, read off the match's events.
 *
 * The engine does not simulate possession by the minute, but it does record
 * every chance, save and goal with the side that made it. Spread each one
 * over the minutes around it and the sum is the shape a match had: the spell
 * of pressure before the goal, the quiet twenty minutes after half-time.
 */

const WEIGHT: Partial<Record<MatchEvent['type'], number>> = {
  goal: 3,
  penaltyScored: 3,
  penaltyMissed: 2,
  save: 1.6,
  chanceMissed: 1.2,
}

/** Minutes either side an event's pressure reaches. */
const SPREAD = 4

export interface Momentum {
  /** Per minute, 0..length: home pressure, 0-1. */
  home: number[]
  /** Per minute, 0..length: away pressure, 0-1. */
  away: number[]
  length: number
}

export function momentum(events: readonly MatchEvent[], homeId: string, length = 90): Momentum {
  const home = new Array<number>(length + 1).fill(0)
  const away = new Array<number>(length + 1).fill(0)
  for (const e of events) {
    // An own goal is the other side's pressure paying off.
    const weight = e.type === 'ownGoal' ? 2 : WEIGHT[e.type]
    if (!weight) continue
    const forHome = e.type === 'ownGoal' ? e.clubId !== homeId : e.clubId === homeId
    const side = forHome ? home : away
    for (let m = Math.max(0, e.minute - SPREAD * 2); m <= Math.min(length, e.minute + SPREAD); m++) {
      // Pressure builds before a chance and falls away quickly after it.
      const d = (m - e.minute) / (m < e.minute ? SPREAD * 1.4 : SPREAD * 0.7)
      side[m] += weight * Math.exp(-d * d)
    }
  }
  // Scaled to the busiest minute of either side, with a floor so a match with
  // two half-chances in it does not look like a siege.
  const peak = Math.max(3, ...home, ...away)
  return { home: home.map((v) => v / peak), away: away.map((v) => v / peak), length }
}
