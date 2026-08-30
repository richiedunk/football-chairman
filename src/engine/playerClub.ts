/**
 * The club the director currently runs, or null while he is out of work.
 *
 * A one-line helper because the alternative is a null check at each of the
 * fifty-odd places that used to index `state.clubs[state.playerClubId]` and
 * assume something came back. Between jobs, nothing does.
 */

import type { Club, GameState } from './types'

export function playerClub(state: GameState): Club | null {
  return state.playerClubId ? state.clubs[state.playerClubId] ?? null : null
}

/** True while the director has no club — sacked, or not yet appointed. */
export function isBetweenJobs(state: GameState): boolean {
  return state.playerClubId === null
}
