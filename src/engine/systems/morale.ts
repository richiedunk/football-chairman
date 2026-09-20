import { clamp, Rng } from '../rng'
import { squadImportance } from './valuation'
import { influenceOf, readRoom, roomBaseline } from './dressingRoom'
import { phrase, withArticle } from './voice'
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

function statusRank(status: SquadStatus): number {
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

  // Read once for the whole squad: the room is a property of the group, and
  // recomputing it per player would let the first name in the list be judged
  // against a different room from the last.
  const room = readRoom(state, club)

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
          reason: phrase(`minutes:${player.id}:${state.date.season}:${state.date.week}`, [
            `${player.knownAs} has been in to see me. He came here as ${withArticle(SQUAD_STATUS_LABELS[player.desiredStatus].toLowerCase())} and he isn't playing like one.`,
            `Had ${player.knownAs} at my door about his minutes. He was promised ${SQUAD_STATUS_LABELS[player.desiredStatus].toLowerCase()} and he hasn't forgotten it.`,
            `${player.knownAs} isn't happy. His words: he signed as ${withArticle(SQUAD_STATUS_LABELS[player.desiredStatus].toLowerCase())}. Hard to argue.`,
          ]),
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
            reason: phrase(`expiring:${player.id}:${state.date.season}:${state.date.week}`, [
              `${player.knownAs} is out of contract in the summer and nobody has spoken to him. He's noticed.`,
              `We need to talk about ${player.knownAs}. Contract up at the end of the season, nothing offered, and he's asking me why.`,
              `${player.knownAs}'s deal runs out this summer. He has had no offer and he is starting to take that personally.`,
            ]),
            severity: 'high',
          })
        }
      } else if (seasonsLeft === 1 && !player.contract.inNegotiation && rng.chance(0.02)) {
        grievances.push({
          player,
          reason: phrase(`renewal:${player.id}:${state.date.season}:${state.date.week}`, [
            `${player.knownAs} asked me about a new deal today. He's got a year left.`,
            `Quiet one: ${player.knownAs} wants to know where he stands. Twelve months to run.`,
            `${player.knownAs} raised his contract with me. A year left — worth getting ahead of.`,
          ]),
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
            reason: phrase(`outgrown:${player.id}:${state.date.season}:${state.date.week}`, [
              `${player.knownAs} thinks he's outgrown us. He wants to try himself higher up and he said so plainly.`,
              `I'll be honest with you — ${player.knownAs} believes he is too good for this level now.`,
              `${player.knownAs} has told me he wants a bigger club. Not angry about it, just certain.`,
            ]),
            severity: 'high',
          })
        }
      }
    }

    // 5. Team results lift or depress everyone.
    drift += (club.fanMood - 55) / 40

    // 6. The room, and his own place in it.
    //
    // The traits used to affect nobody but the man carrying them, which is
    // precisely not how a dressing room works: a senior professional lifts the
    // players around him and a disruptive one drags them down. The room term
    // is what everyone in the squad feels; the personal terms below are what
    // he feels regardless of anybody else.
    //
    // His own influence is taken back out of what he feels, so a leader is not
    // paid for his own leadership and a disruptive player does not sit in a
    // pool of his own making — each man is lifted or dragged by the others.
    // The room does not push on this week's drift at all any more. It sets
    // where this player settles, further down, and the reasoning is in
    // `roomBaseline`: the reversion term below erases anything added here
    // within a few weeks, which is why two previous versions of this measured
    // as nothing.
    const roomTone = room.tone - influenceOf(state, player, club) / 6

    if (player.traits.includes('homesick') && player.nationalityId !== club.nationId) drift -= 0.7
    if (player.traits.includes('inconsistent')) drift -= 0.1

    // Morale reverts toward a personal baseline rather than drifting forever —
    // and the room is part of what that baseline is. A player in a well-run
    // squad is not temporarily cheerful; he is contented at a higher level.
    const baseline = 55 + (player.loyalty - 50) * 0.15 + roomBaseline(roomTone)
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
        reason: phrase(`request:${player.id}:${state.date.season}:${state.date.week}`, [
          `${player.knownAs} has put in a formal transfer request. It's in writing.`,
          `It's official — ${player.knownAs} has requested a transfer.`,
          `${player.knownAs} handed me a transfer request this morning. In writing, so it's real.`,
        ]),
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
          reason: phrase(`signedover:${player.id}:${signing.id}`, [
            `${player.knownAs} is rattled by ${signing.knownAs} coming in. Same position, and he knows what it means.`,
            `Signing ${signing.knownAs} has unsettled ${player.knownAs}. He sees it as a message.`,
            `${player.knownAs} has taken the ${signing.knownAs} signing badly. It's his shirt.`,
          ]),
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
