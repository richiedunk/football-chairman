import { clamp, Rng } from '../rng'
import { squadImportance } from './valuation'
import type { Club, GameState, Player, SquadStatus } from '../types'

/**
 * Morale, form and squad harmony.
 *
 * This is where squad building has consequences beyond ratings. Signing a
 * third striker makes the other two unhappy. Promising a young player
 * first-team football and then signing over him is a grievance the game
 * remembers. Unhappy players leak to the press, ask to leave, and play worse.
 */

/** Numeric weight of each squad status, for comparing promises to reality. */
const STATUS_RANK: Record<SquadStatus, number> = {
  star: 5, firstTeam: 4, rotation: 3, backup: 2, prospect: 1, surplus: 0,
}

export function statusRank(status: SquadStatus): number {
  return STATUS_RANK[status] ?? 2
}

export const SQUAD_STATUS_LABELS: Record<SquadStatus, string> = {
  star: 'Star player',
  firstTeam: 'First team',
  rotation: 'Rotation',
  backup: 'Backup',
  prospect: 'Prospect',
  surplus: 'Surplus to requirements',
}

/**
 * Weekly morale pass for one club.
 *
 * Returns grievances worth telling the director about. Everything here is
 * derived from things the director actually controls — minutes, status,
 * contracts, transfers — so an unhappy squad is always traceable to a
 * decision rather than to a die roll.
 */
export function processMorale(
  state: GameState,
  club: Club,
  rng: Rng,
): { player: Player; reason: string; severity: 'low' | 'medium' | 'high' }[] {
  const grievances: { player: Player; reason: string; severity: 'low' | 'medium' | 'high' }[] = []
  const season = state.date.season

  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.isAcademy) continue

    let drift = 0

    // 1. Playing time against expectation. The single biggest driver.
    const expectedShare = expectedMinutesShare(player.desiredStatus)
    const actualShare = actualMinutesShare(player, state)
    const shortfall = expectedShare - actualShare
    if (shortfall > 0.25) {
      drift -= shortfall * 6
      if (player.morale < 45 && rng.chance(0.06)) {
        grievances.push({
          player,
          reason: `${player.knownAs} is unhappy with his playing time — he was signed as a ${SQUAD_STATUS_LABELS[player.desiredStatus].toLowerCase()}.`,
          severity: player.morale < 28 ? 'high' : 'medium',
        })
      }
    } else if (shortfall < -0.15) {
      drift += 1.2
    }

    // 2. Status mismatch. Being told you are a squad player when you consider
    // yourself a starter corrodes a dressing room quickly.
    const statusGap = statusRank(player.desiredStatus) - statusRank(player.squadStatus)
    if (statusGap > 0) drift -= statusGap * 1.4

    // 3. Contract situation. A player in his final year with no offer on the
    // table starts looking elsewhere, and says so.
    if (player.contract) {
      const seasonsLeft = player.contract.expiresSeason - season
      if (seasonsLeft <= 0 && !player.contract.inNegotiation) {
        drift -= 2.5
        if (rng.chance(0.05)) {
          grievances.push({
            player,
            reason: `${player.knownAs}'s contract expires at the end of the season and nothing has been offered.`,
            severity: 'high',
          })
        }
      } else if (seasonsLeft === 1 && !player.contract.inNegotiation && rng.chance(0.02)) {
        grievances.push({
          player,
          reason: `${player.knownAs} has asked about a new deal — he has a year left.`,
          severity: 'low',
        })
      }

      // Being paid meaningfully below what he could get elsewhere.
      if (player.contract.wage < player.wageDemand * 0.7) {
        drift -= 1.2
      }
    }

    // 4. Ambition. A good player at a club going nowhere gets restless, and
    // the better he is relative to his teammates, the faster.
    const importance = squadImportance(state, player, club)
    if (importance > 0.75 && player.ambitionVsMoney > 60) {
      const clubCeiling = club.reputation
      const playerLevel = player.currentAbility / 2
      if (playerLevel > clubCeiling + 12) {
        drift -= 1.6
        if (player.morale < 40 && rng.chance(0.04)) {
          grievances.push({
            player,
            reason: `${player.knownAs} feels he has outgrown the club and wants to test himself higher up.`,
            severity: 'high',
          })
        }
      }
    }

    // 5. Team results lift or depress everyone.
    drift += (club.fanMood - 55) / 40

    // 6. Personality.
    if (player.traits.includes('professional')) drift += 0.6
    if (player.traits.includes('clubhouseCancer')) drift -= 0.8
    if (player.traits.includes('homesick') && player.nationalityId !== club.nationId) drift -= 0.7
    if (player.traits.includes('loyal')) drift += 0.4

    // Morale reverts toward a personal baseline rather than drifting forever.
    const baseline = 55 + (player.loyalty - 50) * 0.15
    drift += (baseline - player.morale) * 0.06

    player.morale = clamp(player.morale + drift, 1, 100)

    // Form tracks recent ratings, pulled toward a level set by morale and
    // fitness so an unhappy player visibly underperforms his ability.
    const formTarget = 40 + player.morale * 0.35 + player.fitness * 0.2
    player.form = clamp(player.form + (formTarget - player.form) * 0.16 + rng.normal(0, 3.5), 1, 100)

    // A thoroughly unhappy player eventually forces the issue.
    if (player.morale < 18 && !player.transferRequested && rng.chance(0.05)) {
      player.transferRequested = true
      grievances.push({
        player,
        reason: `${player.knownAs} has handed in a formal transfer request.`,
        severity: 'high',
      })
    }
  }

  return grievances
}

/** Minutes share a player of this status expects, 0-1. */
function expectedMinutesShare(status: SquadStatus): number {
  switch (status) {
    case 'star': return 0.85
    case 'firstTeam': return 0.7
    case 'rotation': return 0.45
    case 'backup': return 0.2
    case 'prospect': return 0.12
    case 'surplus': return 0
  }
}

function actualMinutesShare(player: Player, state: GameState): number {
  // Matches played so far this season, approximated from the calendar so a
  // player is not judged in week 7 on a full season's expectations.
  const weeksPlayed = Math.max(1, state.date.week - 5)
  const possibleMinutes = weeksPlayed * 90
  return clamp(player.stats.minutes / possibleMinutes, 0, 1)
}

/**
 * Reaction of the existing squad to a new signing. Called when a transfer
 * completes, because this is one of the clearest ways a director of football's
 * decisions land on people.
 */
export function reactToSigning(
  state: GameState,
  club: Club,
  signing: Player,
  rng: Rng,
): { player: Player; reason: string }[] {
  const reactions: { player: Player; reason: string }[] = []

  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.id === signing.id || player.isAcademy) continue

    const samePosition = player.position === signing.position
      || player.altPositions.includes(signing.position)

    if (!samePosition) {
      // A marquee signing lifts everyone else — evidence of ambition.
      if (signing.currentAbility > player.currentAbility + 20) {
        player.morale = clamp(player.morale + 3, 1, 100)
      }
      continue
    }

    if (signing.currentAbility > player.currentAbility + 8) {
      // Direct competition, and he has lost it.
      const hit = clamp((signing.currentAbility - player.currentAbility) / 6, 2, 14)
      player.morale = clamp(player.morale - hit, 1, 100)
      if (player.morale < 40 && rng.chance(0.4)) {
        reactions.push({
          player,
          reason: `${player.knownAs} is unsettled by the arrival of ${signing.knownAs} in his position.`,
        })
      }
    } else if (signing.currentAbility < player.currentAbility - 12) {
      // Squad cover, not a threat. Mildly reassuring.
      player.morale = clamp(player.morale + 1, 1, 100)
    }
  }

  return reactions
}

/** Reaction of the squad and fans to a departure. */
export function reactToDeparture(
  state: GameState,
  club: Club,
  departing: Player,
): void {
  const importance = squadImportance(state, departing, club)
  if (importance < 0.4) return

  // Selling a key player damages morale and fan mood in proportion to how
  // central he was. This is the cost side of a sell-to-survive model.
  const impact = importance * 12
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.isAcademy) continue
    player.morale = clamp(player.morale - impact * 0.5, 1, 100)
  }
  club.fanMood = clamp(club.fanMood - impact, 1, 100)
}

/** Recompute squad statuses from where players actually sit in the pecking order. */
export function refreshSquadStatuses(state: GameState, club: Club): void {
  const squad = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)
    .sort((a, b) => b.currentAbility - a.currentAbility)

  squad.forEach((player, index) => {
    // Only the club-assigned status moves here; desiredStatus is the player's
    // own view and changes only when he is promised something.
    if (player.listedForTransfer) {
      player.squadStatus = 'surplus'
    } else if (index < 2) player.squadStatus = 'star'
    else if (index < 11) player.squadStatus = 'firstTeam'
    else if (index < 17) player.squadStatus = 'rotation'
    else if (player.age <= 21) player.squadStatus = 'prospect'
    else player.squadStatus = 'backup'
  })
}
