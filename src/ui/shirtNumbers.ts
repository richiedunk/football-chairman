import { squadNumbers } from './art/shirtNumber'
import type { useGameStore } from '../stores/game'
import type { Player } from '../engine/types'

/**
 * A player's shirt number, numbered with the rest of his club's squad so no
 * two team-mates share one. Cached per club and squad, so a list of twenty
 * five does not renumber the squad twenty-five times.
 */
const cache = new Map<string, { key: string; numbers: Map<string, number> }>()

export function numberFor(store: ReturnType<typeof useGameStore>, player: Pick<Player, 'id' | 'position' | 'clubId'>): number {
  const club = player.clubId ? store.clubById(player.clubId) : null
  if (!club) return squadNumbers([player]).get(player.id) ?? 0
  const ids = [...club.squad, ...club.loanedIn]
  const key = ids.join(',')
  let entry = cache.get(club.id)
  if (!entry || entry.key !== key) {
    const players = ids.map((id) => store.player(id)).filter((p): p is Player => Boolean(p))
    entry = { key, numbers: squadNumbers(players) }
    cache.set(club.id, entry)
  }
  return entry.numbers.get(player.id) ?? squadNumbers([player]).get(player.id) ?? 0
}
