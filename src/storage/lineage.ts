import type { GameState } from '../engine/types'

/**
 * Which copy of a career is the newer one.
 *
 * The same career can exist on a phone and on a desktop, and the only thing
 * that makes handing it between them safe is being able to look at two copies
 * and say, without guessing, that one descends from the other — or that
 * neither does and somebody has to choose.
 *
 * ## Why a vector clock and not a timestamp
 *
 * A wall clock is the obvious answer and it is wrong here. Device clocks
 * disagree, they get corrected, and a phone in another timezone can produce a
 * save "older" than the one it descends from. Worse, a timestamp cannot tell
 * the difference between the two cases that matter: a copy that is simply
 * behind, which is safe to replace, and a copy that has advanced separately,
 * which is a season somebody is about to lose.
 *
 * A per-device counter answers both. A copy is behind if every device's count
 * in it is less than or equal to the other's; it has diverged if each holds a
 * count the other does not. That is a few lines and it is exact, and it stays
 * exact with three devices, which a single "last synced version" number does
 * not.
 *
 * ## The rule it exists to enforce
 *
 * **Nothing is ever replaced silently.** A divergence is a question put to the
 * player with both sides named, and the losing copy is kept — the same
 * instinct the migration code already has, where the untouched bytes are put
 * aside before a format change rather than after it goes wrong.
 */

/** Per-device write counts. Small: one entry per device a career has seen. */
export type SaveClock = Record<string, number>

export interface SaveLineage {
  /**
   * Identity of the career itself.
   *
   * Minted the first time a save is stamped rather than at world generation,
   * so a career that predates this code acquires one without a migration. The
   * consequence is worth stating: two copies of the same *old* save, stamped
   * separately on two devices, are genuinely unrelatable and will be reported
   * as different careers. That is the honest answer — nothing in those bytes
   * says they share an ancestor — and it errs towards asking.
   */
  careerId: string
  clock: SaveClock
  /** The device that wrote this copy, and what to call it on screen. */
  device: string
  deviceLabel: string
}

export type LineageVerdict =
  /** Identical copies. Nothing to do. */
  | 'same'
  /** The first descends from the second: it is the newer one. */
  | 'ahead'
  /** The first is an ancestor of the second. */
  | 'behind'
  /** Both have advanced since they last agreed. Somebody must choose. */
  | 'diverged'
  /** Not the same career at all. */
  | 'unrelated'

// ---------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------

const DEVICE_KEY = 'dof:device'
const LABEL_KEY = 'dof:device-label'

/**
 * In-memory fallbacks, so a session still works with storage blocked.
 *
 * Both of them, and that is the point: the id had one and the label did not,
 * which meant a device with storage blocked could be given a name and forget
 * it again within the same sitting.
 */
let ephemeral: string | null = null
let ephemeralLabel: string | null = null

/**
 * A stable, opaque id for this installation.
 *
 * No personal data and nothing derived from the machine: a random value
 * generated once and kept. If storage is unavailable — a private window, a
 * browser with site data blocked — this device looks new on every run, which
 * makes every comparison read as a divergence. That degrades to *asking*,
 * which is the safe direction, and is why the failure is left to happen
 * rather than papered over with a fingerprint.
 */
export function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return stored
    const minted = randomId()
    localStorage.setItem(DEVICE_KEY, minted)
    return minted
  } catch {
    if (!ephemeral) ephemeral = randomId()
    return ephemeral
  }
}

/**
 * What to call this device on the screen that asks.
 *
 * "Newer on your phone" is an answerable question; "newer on device
 * 7f3a9c" is not. Defaulted from the shape of the thing rather than sniffed
 * in detail, and settable, because the only person who can name a device
 * usefully is the person holding it.
 */
export function deviceLabel(fallback = 'This device'): string {
  try {
    const stored = localStorage.getItem(LABEL_KEY)
    if (stored) return stored
  } catch {
    // Fall through to whatever this session was told.
  }
  return ephemeralLabel ?? fallback
}

export function setDeviceLabel(label: string): void {
  const trimmed = label.trim().slice(0, 40)
  ephemeralLabel = trimmed || null
  try {
    localStorage.setItem(LABEL_KEY, trimmed)
  } catch {
    // A device that cannot write its own name still answers to it until it is
    // closed, which is better than forgetting it the moment it is given.
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the arithmetic version.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------------------------------------------------------------------------
// Stamping
// ---------------------------------------------------------------------------

/**
 * Record that this device has written this copy.
 *
 * Called on every save. The counter is per device, so two devices writing the
 * same career produce two independent counts and the comparison below can see
 * both.
 */
export function stamp(
  state: GameState,
  device: string = deviceId(),
  label: string = deviceLabel(),
): SaveLineage {
  const existing = state.lineage
  const clock: SaveClock = { ...(existing?.clock ?? {}) }
  clock[device] = (clock[device] ?? 0) + 1

  const lineage: SaveLineage = {
    careerId: existing?.careerId ?? randomId(),
    clock,
    device,
    deviceLabel: label,
  }
  state.lineage = lineage
  return lineage
}

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------

/**
 * How `a` stands against `b`.
 *
 * Read it as a question about `a`: ahead means `a` is the one to keep.
 */
export function compareLineage(
  a: SaveLineage | undefined,
  b: SaveLineage | undefined,
): LineageVerdict {
  // A copy with no lineage predates this code. It cannot be ordered against
  // anything, and claiming otherwise would be the one mistake that costs a
  // career.
  if (!a || !b) return 'unrelated'
  if (a.careerId !== b.careerId) return 'unrelated'
  return compareClocks(a.clock, b.clock)
}

export function compareClocks(a: SaveClock, b: SaveClock): LineageVerdict {
  let aHasMore = false
  let bHasMore = false

  for (const device of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[device] ?? 0
    const right = b[device] ?? 0
    if (left > right) aHasMore = true
    if (right > left) bHasMore = true
  }

  if (aHasMore && bHasMore) return 'diverged'
  if (aHasMore) return 'ahead'
  if (bHasMore) return 'behind'
  return 'same'
}

/**
 * Absorb the copy that lost, so the question is not asked again.
 *
 * After somebody chooses a side of a divergence, the winner takes the highest
 * count it has seen for every device. Without this the two copies stay
 * mutually ahead for ever and every future handoff re-opens a decision that
 * has already been made.
 */
export function absorb(chosen: SaveLineage, discarded: SaveLineage): SaveLineage {
  const clock: SaveClock = { ...chosen.clock }
  for (const [device, count] of Object.entries(discarded.clock)) {
    clock[device] = Math.max(clock[device] ?? 0, count)
  }
  return { ...chosen, clock }
}

/** How many writes a copy carries, for a screen that wants a rough measure. */
export function totalWrites(lineage: SaveLineage | undefined): number {
  if (!lineage) return 0
  return Object.values(lineage.clock).reduce((sum, n) => sum + n, 0)
}
