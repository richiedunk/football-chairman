import { ordinal } from './career'
import { SAVE_VERSION } from '../types'
import type { DirectorBackground, GameState, ID } from '../types'
import type { WorldSize } from '../world/worldGen'

/**
 * Challenge links.
 *
 * The engine is seeded end to end — the week's randomness is
 * `Rng(seed:season:week)` and nothing carries a cursor — so a world is fully
 * described by the handful of values that generated it. That makes a starting
 * position a *string*, and a string fits in a message.
 *
 * "Here is the club I took, at the seed I took it on, and here is what I did
 * with it. Beat that." Every player who opens the link gets the same squad,
 * the same balance, the same coach and the same problems, which is the one
 * thing no management game has ever been able to hand somebody else.
 *
 * ## What a challenge is, and what it deliberately is not
 *
 * It is a **starting position plus a benchmark**. It is not a save, and it is
 * not a replay of the sender's career.
 *
 * Replaying somebody else's twenty seasons would need every input they ever
 * made, and it would need this build to behave exactly as theirs did. The
 * first is a large surface to capture and easy to get silently wrong; the
 * second is false the moment a balance change ships, because reordering a
 * single tick phase reshuffles every draw after it (see `tick/index.ts`). A
 * challenge sidesteps both: the *start* is reproducible from six values, and
 * the benchmark is a number the receiving build can check against its own
 * world with no trust in the sender at all.
 *
 * `engine` is stamped on anyway. A challenge set on a different build may not
 * generate the identical world, and the receiver is told that rather than
 * being handed a subtly different squad and told it is the same one.
 */

/** Bumped when the wire format changes shape. */
export const CHALLENGE_VERSION = 1

export type ChallengeGoal = 'finish' | 'promotion' | 'trophy' | 'survive'

export interface ChallengeTarget {
  goal: ChallengeGoal
  /**
   * The number to beat. A league position for `finish` (lower is better), a
   * count of promotions or trophies, and for `survive` the seasons to last.
   */
  value: number
  /** Seasons allowed to do it in. */
  seasons: number
}

export interface Challenge {
  v: number
  /** The build that set it. A mismatch is reported, not silently ignored. */
  engine: number
  seed: string
  size: WorldSize
  nationId: string
  /** The season the world starts in. */
  season: number
  clubId: ID
  /** Carried so a club can still be found if ids ever move. */
  clubName: string
  background: DirectorBackground
  target: ChallengeTarget
  /** Who set it. */
  by: string
}

/** How a challenge in progress is doing. */
export type ChallengeStatus = 'pending' | 'met' | 'failed'

// ---------------------------------------------------------------------------
// Reading a challenge out of a career
// ---------------------------------------------------------------------------

/**
 * Turn what somebody actually did into something to beat.
 *
 * The benchmark is their best finish at the club they are describing, over the
 * seasons they took to get it, because that is the claim a director makes in a
 * sentence: "fourth, in three years, with that squad."
 *
 * Returns null before a season has been completed. There is nothing to beat
 * yet, and a challenge to match a blank record is not a challenge.
 */
export function challengeFrom(state: GameState, clubId: ID): Challenge | null {
  const club = state.clubs[clubId]
  if (!club) return null
  const spell = state.director.careerHistory.find((e) => e.clubId === clubId)
  if (!spell) return null

  const seasons = club.history.filter((h) => h.season >= spell.fromSeason)
  if (seasons.length === 0) return null

  const best = seasons.reduce((a, b) => (b.position < a.position ? b : a))

  return {
    v: CHALLENGE_VERSION,
    engine: SAVE_VERSION,
    seed: state.seed,
    size: worldSizeOf(state),
    nationId: club.nationId,
    season: startingSeasonOf(state),
    clubId: club.id,
    clubName: club.name,
    background: state.director.background,
    target: {
      goal: 'finish',
      value: best.position,
      seasons: seasons.length,
    },
    by: state.director.name,
  }
}

/**
 * The world size a state was generated at.
 *
 * Not stored on the save, and adding a field for it would need a migration for
 * something derivable: the sizes differ in how many nations they carry, and
 * that is a count already sitting in the state.
 */
export function worldSizeOf(state: GameState): WorldSize {
  const nations = Object.keys(state.nations).length
  if (nations <= 8) return 'compact'
  if (nations <= 16) return 'standard'
  return 'large'
}

/**
 * The season the world began in.
 *
 * The director ages a year per season from thirty, so the difference between
 * his age and thirty is how many seasons have run. Derived rather than stored
 * for the same reason as the size.
 */
export function startingSeasonOf(state: GameState): number {
  const elapsed = Math.max(0, state.director.age - 30)
  return state.date.season - elapsed
}

/**
 * Has the challenge been met, missed, or is it still live?
 *
 * Judged only on what this build can see in its own world, so a sender cannot
 * claim a result the receiver's game did not produce.
 */
export function challengeStatus(state: GameState, challenge: Challenge): ChallengeStatus {
  const club = resolveClub(state, challenge)
  if (!club) return 'pending'
  const spell = state.director.careerHistory.find((e) => e.clubId === club.id)
  if (!spell) return 'pending'

  const seasons = club.history.filter((h) => h.season >= spell.fromSeason)
  const { target } = challenge

  if (target.goal === 'finish') {
    const beaten = seasons
      .slice(0, target.seasons)
      .some((h) => h.position < target.value)
    if (beaten) return 'met'
    return seasons.length >= target.seasons ? 'failed' : 'pending'
  }

  if (target.goal === 'survive') {
    if (seasons.length >= target.value) return 'met'
    // Being out of work at that club is the failure condition, and leaving is
    // the same thing as being sacked as far as a survival challenge cares.
    return spell.toSeason === null ? 'pending' : 'failed'
  }

  if (target.goal === 'promotion' || target.goal === 'trophy') {
    const count = target.goal === 'trophy'
      ? spell.trophies.length
      : promotionsIn(club, spell.fromSeason)
    if (count >= target.value) return 'met'
    return seasons.length >= target.seasons ? 'failed' : 'pending'
  }

  return 'pending'
}

/** Seasons the club climbed a division, counted from its own record. */
function promotionsIn(
  club: { history: { season: number; leagueName: string; position: number }[] },
  fromSeason: number,
): number {
  const seasons = club.history.filter((h) => h.season >= fromSeason)
  let count = 0
  for (let i = 1; i < seasons.length; i++) {
    if (seasons[i].leagueName !== seasons[i - 1].leagueName) count++
  }
  return count
}

/**
 * Find the challenge's club in this world.
 *
 * By id first, because for the same seed the id generator is deterministic and
 * the id is exact. By name second, because a real-club data edit could move an
 * id without moving the club, and being handed the wrong squad silently is far
 * worse than a slower lookup.
 */
export function resolveClub(state: GameState, challenge: Challenge) {
  return state.clubs[challenge.clubId]
    ?? Object.values(state.clubs).find((c) => c.name === challenge.clubName)
    ?? null
}

/** Does this build generate the same world the challenge was set in? */
export function isSameEngine(challenge: Challenge): boolean {
  return challenge.engine === SAVE_VERSION
}

/** The benchmark as a sentence, for a card or a screen. */
export function describeTarget(challenge: Challenge): string {
  const { target } = challenge
  const years = target.seasons === 1 ? 'one season' : `${target.seasons} seasons`
  switch (target.goal) {
    case 'finish':
      return `Better than ${placing(target.value)} within ${years}`
    case 'promotion':
      return `${target.value} promotion${target.value === 1 ? '' : 's'} within ${years}`
    case 'trophy':
      return `${target.value} trophy${target.value === 1 ? '' : 'ies'} within ${years}`
    case 'survive':
      return `Still in the job after ${target.value} seasons`
  }
}

/**
 * A league position, written out.
 *
 * `career.ordinal` returns the suffix alone, which is the right shape for the
 * places that already have the number on the page. A card and a challenge
 * blurb both want the whole thing, and two call sites spelling out the same
 * template is how they drift.
 */
export function placing(n: number): string {
  return `${n}${ordinal(n)}`
}

// ---------------------------------------------------------------------------
// The wire format
// ---------------------------------------------------------------------------

/**
 * A challenge as a short string.
 *
 * A positional array rather than an object, because the field names were most
 * of the bytes and a link that wraps in a chat window is a link nobody clicks.
 * The order is written down once, here, and `decodeChallenge` is its exact
 * inverse — the same discipline `careerRecord.ts` applies for the same reason.
 */
type Wire = [
  v: number,
  engine: number,
  seed: string,
  size: string,
  nationId: string,
  season: number,
  clubId: string,
  clubName: string,
  background: string,
  goal: string,
  value: number,
  seasons: number,
  by: string,
]

export function encodeChallenge(challenge: Challenge): string {
  const wire: Wire = [
    challenge.v,
    challenge.engine,
    challenge.seed,
    challenge.size,
    challenge.nationId,
    challenge.season,
    challenge.clubId,
    challenge.clubName,
    challenge.background,
    challenge.target.goal,
    challenge.target.value,
    challenge.target.seasons,
    challenge.by,
  ]
  return base64UrlEncode(utf8(JSON.stringify(wire)))
}

/**
 * Read one back, or null.
 *
 * Every failure returns null rather than throwing. This parses a string a
 * stranger pasted in, so malformed input is the expected case and not an
 * exceptional one.
 */
export function decodeChallenge(encoded: string): Challenge | null {
  try {
    const trimmed = encoded.trim().split('#').pop() ?? ''
    if (!trimmed) return null
    const wire = JSON.parse(fromUtf8(base64UrlDecode(trimmed))) as unknown
    if (!Array.isArray(wire) || wire.length < 13) return null
    const [v, engine, seed, size, nationId, season, clubId, clubName, background,
      goal, value, seasons, by] = wire as Wire
    if (typeof v !== 'number' || v > CHALLENGE_VERSION) return null
    if (typeof seed !== 'string' || !seed) return null
    if (!['compact', 'standard', 'large'].includes(size)) return null
    if (!['finish', 'promotion', 'trophy', 'survive'].includes(goal)) return null
    if (!Number.isFinite(season) || !Number.isFinite(value) || !Number.isFinite(seasons)) {
      return null
    }
    return {
      v,
      engine: Number(engine) || 0,
      seed,
      size: size as WorldSize,
      nationId: String(nationId),
      season: Number(season),
      clubId: String(clubId),
      clubName: String(clubName),
      background: String(background) as DirectorBackground,
      target: { goal: goal as ChallengeGoal, value: Number(value), seasons: Number(seasons) },
      by: String(by ?? ''),
    }
  } catch {
    return null
  }
}

/** The full link, given wherever the game is hosted. */
export function challengeLink(challenge: Challenge, origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/#challenge=${encodeChallenge(challenge)}`
}

/** Pull a challenge out of a URL, a hash, or a pasted bare code. */
export function challengeFromUrl(url: string): Challenge | null {
  const match = /challenge=([A-Za-z0-9_-]+)/.exec(url)
  return decodeChallenge(match ? match[1] : url)
}

// ---------------------------------------------------------------------------
// base64url, without a dependency
// ---------------------------------------------------------------------------

/**
 * Hand-rolled because the alternatives are all wrong somewhere this code runs.
 *
 * `btoa` is not in a plain Node test runner without a shim, `Buffer` is not in
 * a browser, and the engine has no framework imports by rule. Forty lines that
 * work identically in both is cheaper than a polyfill, and it is exercised by
 * a round-trip test over every byte value.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += ALPHABET[b0 >> 2]
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    if (b1 === undefined) break
    out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    if (b2 === undefined) break
    out += ALPHABET[b2 & 63]
  }
  return out
}

export function base64UrlDecode(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9_-]/g, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const value = ALPHABET.indexOf(ch)
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

function utf8(text: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)
        i++
      }
    }
    if (code < 0x80) out.push(code)
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      )
    }
  }
  return new Uint8Array(out)
}

function fromUtf8(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    let code: number
    if (b < 0x80) code = b
    else if (b < 0xe0) code = ((b & 31) << 6) | (bytes[++i] & 63)
    else if (b < 0xf0) {
      code = ((b & 15) << 12) | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63)
    } else {
      code = ((b & 7) << 18) | ((bytes[++i] & 63) << 12)
        | ((bytes[++i] & 63) << 6) | (bytes[++i] & 63)
    }
    if (code > 0xffff) {
      code -= 0x10000
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023))
    } else out += String.fromCharCode(code)
  }
  return out
}
