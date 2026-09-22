import { absorb, compareLineage, deviceId, type LineageVerdict, type SaveLineage } from './lineage'
import type { GameState } from '../engine/types'

/**
 * Picking a career up on another device.
 *
 * The shape is handoff rather than sync, and the difference is where the
 * decision lives. A syncing game resolves in the background and tells you
 * afterwards; this one uploads without asking and never *takes* anything
 * without asking. Those are not the same promise, and only the second one can
 * be made to a game whose stake is a thirty-five season career.
 *
 * Three rules hold it together.
 *
 * **Local is the source of truth.** The remote copy is a courier. Nothing in
 * the game waits on a network on a path a player is sitting in front of, so a
 * career with no signal, and a career with no pairing at all, behave exactly
 * as they did before any of this existed. That is what keeps the game the
 * offline product it is sold as.
 *
 * **A pull is always a question.** Even the easy case, where the remote is
 * plainly the descendant of what is here, is offered rather than applied. The
 * cost of asking is one tap; the cost of being wrong is a season.
 *
 * **Nothing is thrown away.** Choosing a side of a divergence keeps the other,
 * the way `migrate` keeps the pre-migration bytes.
 *
 * This module decides. It has no transport in it and does not know whether the
 * other copy arrived over a network, which is deliberate: the hard part is the
 * decision, it is the part that will have bugs, and a decision that can only
 * be exercised through a server is a decision nobody tests.
 */

export type HandoffAction =
  /** The copies agree. Nothing to offer. */
  | 'none'
  /** This device is the newer one; it should be sent. */
  | 'push'
  /** The other copy descends from this one; offer to take it. */
  | 'pull'
  /** Both advanced separately. Put it to the player. */
  | 'choose'
  /** Different careers, or a copy too old to be ordered. */
  | 'incompatible'

export interface HandoffDecision {
  action: HandoffAction
  verdict: LineageVerdict
  /** One line, in the terms the player thinks in. */
  message: string
  /** Where the other copy was last written, when that is known. */
  otherDevice: string | null
}

/**
 * What to do about a remote copy of this career.
 *
 * `local` is what is on this device; `remote` is what was found elsewhere.
 * Either may be absent — a first upload has no remote, and a fresh install has
 * no local.
 */
export function decideHandoff(
  local: SaveLineage | undefined,
  remote: SaveLineage | undefined,
): HandoffDecision {
  const otherDevice = remote?.deviceLabel ?? null

  if (!remote) {
    return {
      action: local ? 'push' : 'none',
      verdict: 'unrelated',
      message: local ? 'Not sent to your other devices yet.' : '',
      otherDevice: null,
    }
  }

  if (!local) {
    return {
      action: 'pull',
      verdict: 'behind',
      message: `A career from ${otherDevice ?? 'another device'} is waiting.`,
      otherDevice,
    }
  }

  const verdict = compareLineage(local, remote)

  switch (verdict) {
    case 'same':
      return { action: 'none', verdict, message: 'Up to date.', otherDevice }

    case 'ahead':
      return {
        action: 'push',
        verdict,
        message: 'This device has the newer career.',
        otherDevice,
      }

    case 'behind':
      return {
        action: 'pull',
        verdict,
        message: `${otherDevice ?? 'Another device'} has carried this career on.`,
        otherDevice,
      }

    case 'diverged':
      return {
        action: 'choose',
        verdict,
        // Named plainly. "Sync conflict" tells a player nothing; being told
        // that both copies have been played tells them exactly what they are
        // about to decide.
        message: `This career has been played here and on `
          + `${otherDevice ?? 'another device'} since they last agreed.`,
        otherDevice,
      }

    case 'unrelated':
      return {
        action: 'incompatible',
        verdict,
        message: 'That is a different career.',
        otherDevice,
      }
  }
}

/**
 * Take the remote copy, keeping a record that this device's version existed.
 *
 * The clocks are merged so the divergence is settled rather than re-offered
 * on every check. The *bytes* of the losing copy are not this module's
 * business — the caller keeps them, the way a migration keeps its backup.
 */
export function acceptRemote(remote: GameState, local: SaveLineage | undefined): GameState {
  if (remote.lineage && local) {
    remote.lineage = absorb(remote.lineage, local)
  }
  return remote
}

/**
 * Keep what is here, and record that the other copy has been seen.
 *
 * Without this the two stay mutually ahead for ever, and a player who has
 * already said "keep mine" is asked again every time they open the game.
 */
export function keepLocal(local: GameState, remote: SaveLineage | undefined): GameState {
  if (local.lineage && remote) {
    local.lineage = absorb(local.lineage, remote)
  }
  return local
}

/** Is this copy one this device has written since it last agreed with the other? */
export function writtenHere(lineage: SaveLineage | undefined): boolean {
  return !!lineage && lineage.device === deviceId()
}
