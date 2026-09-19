import { compressValue, decompress, type StorageAdapter } from './adapter'
import type { GameState, ID, PlayerCareerRecord } from '../engine/types'

/**
 * Career history, kept out of the game.
 *
 * Every player carries up to 25 seasons of it and it was 35% of the save's raw
 * JSON, yet nothing in `src/ui` has ever displayed a career and the engine
 * never reads one back — the season roll appends, and that is all. Carrying it
 * in memory and writing it on every save was paying for a feature that does
 * not exist yet.
 *
 * So it lives in a part of the save record, written in the same transaction as
 * the game and read only when something asks. `player.careerStats` still
 * exists and the roll still appends to it, but in a loaded game it holds only
 * what has not been persisted yet — usually nothing, because the roll runs
 * once a season and the save that follows clears it.
 *
 * ## Why the merge is cheap
 *
 * Writing an append-only log normally means reading it back first, and doing
 * that on every save would put the cost straight back. It does not happen on
 * every save: the roll is the only writer, so there is something pending on
 * exactly one save a season and the rest write the game alone and leave the
 * part untouched.
 */

/** The name this part is stored under, alongside the game. */
export const HISTORY_PART = 'careers'

/** Seasons kept per player. Older ones fall off the front. */
const KEPT_SEASONS = 25

export type CareerHistory = Record<ID, PlayerCareerRecord[]>

/** Everything each player has waiting to be written. Empty on most saves. */
export function pendingHistory(state: GameState): CareerHistory {
  const pending: CareerHistory = {}
  for (const player of Object.values(state.players)) {
    if (player.careerStats.length > 0) pending[player.id] = player.careerStats
  }
  return pending
}

export function hasPendingHistory(state: GameState): boolean {
  for (const player of Object.values(state.players)) {
    if (player.careerStats.length > 0) return true
  }
  return false
}

/** Read a slot's stored history, or an empty one if it has none. */
export async function readHistory(
  adapter: StorageAdapter,
  slotId: string,
): Promise<CareerHistory> {
  const bytes = await adapter.readPart(slotId, HISTORY_PART)
  if (!bytes) return {}
  try {
    return JSON.parse(await decompress(bytes)) as CareerHistory
  } catch {
    // History is not worth failing a save or a load over. A career that has
    // lost its statistics is still a career; one that will not open is not.
    return {}
  }
}

/** Stored history with the pending records appended, oldest first. */
export function mergeHistory(stored: CareerHistory, pending: CareerHistory): CareerHistory {
  const merged: CareerHistory = { ...stored }
  for (const [id, records] of Object.entries(pending)) {
    const combined = [...(merged[id] ?? []), ...records]
    merged[id] = combined.length > KEPT_SEASONS ? combined.slice(-KEPT_SEASONS) : combined
  }
  return merged
}

export async function compressHistory(history: CareerHistory): Promise<Uint8Array> {
  return (await compressValue(history)).data
}

/**
 * Hand a player his own history back.
 *
 * The on-demand read: a career screen asks for one player and gets one
 * player's seasons, rather than the whole world's being resident on the chance
 * that somebody looks.
 */
export async function careerOf(
  adapter: StorageAdapter,
  slotId: string,
  playerId: ID,
): Promise<PlayerCareerRecord[]> {
  const history = await readHistory(adapter, slotId)
  return history[playerId] ?? []
}
