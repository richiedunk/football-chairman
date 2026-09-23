import type { Position } from '../../engine/types'
import { hashString } from './seed'

/**
 * A shirt number for a player, for the drawn kit only.
 *
 * The engine has no squad numbers and does not need them. A shirt with no
 * number reads as a training top, though, so the picture gets one: drawn
 * from the numbers that position traditionally wears, chosen by the player's
 * id so it never changes between screens. Two players can land on the same
 * number; nothing in the game depends on it.
 */
const BY_POSITION: Record<Position, readonly number[]> = {
  GK: [1, 13, 31, 1, 1, 25],
  DC: [4, 5, 6, 15, 16, 24, 26, 33],
  DL: [3, 3, 23, 18, 27],
  DR: [2, 2, 22, 12, 28],
  DM: [6, 4, 16, 18, 21],
  MC: [8, 4, 14, 16, 18, 20],
  ML: [11, 7, 17, 21],
  MR: [7, 7, 17, 19],
  AM: [10, 10, 8, 19, 20],
  ST: [9, 9, 19, 14, 20, 30],
}

export function shirtNumber(player: { id: string; position: Position }): number {
  const options = BY_POSITION[player.position] ?? [14, 17, 18, 19, 20, 21, 22, 23, 24]
  return options[hashString(`shirt:${player.id}`) % options.length]
}
