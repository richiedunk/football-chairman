/**
 * How the people on your phone talk.
 *
 * The inbox is a contacts list — Chairman, Club Secretary, Medical Department,
 * Max Jones — and the messages in it read like bulletins written by nobody:
 * "Curtis Blackwood has picked up a tight hamstring and will be unavailable
 * for around 2 weeks." Nobody types that to their director of football. They
 * type "Blackwood's hamstring has gone again. Two weeks, and that's me being
 * optimistic."
 *
 * Those names are plausible exactly as they are, by the way. This is a phone,
 * and a phone saves the competition secretary as "Competition Secretary"
 * because that is who they are to you. Only the people you actually know get a
 * name, which is already how the engine writes them: the head coach and your
 * scouts come through as themselves.
 *
 * **Variation without an RNG.** Picking a phrasing needs to be deterministic —
 * the same seed rebuilds the same world down to the wording — and threading an
 * `Rng` through forty-seven call sites to pick between three sentences would
 * be a lot of plumbing for a cosmetic. So the choice is a hash of a key the
 * caller already has: a player's id and the week, say. Same key, same line,
 * for ever, and no state to carry.
 */

/**
 * FNV-1a, 32-bit.
 *
 * Small, stable, and — unlike anything built on `Math.random` or object
 * iteration order — identical on every platform and every run, which is the
 * only property that matters here. It is a phrase picker, not a hash anybody
 * should rely on for anything else.
 */
function hash(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * One line from a pool, chosen by a key the caller already has.
 *
 * The key wants to be something that identifies this message rather than this
 * kind of message — a player's id and the week, not just the category — or
 * every injury in a season reads identically and the variation does nothing.
 */
export function phrase(key: string, pool: readonly string[]): string {
  if (pool.length === 0) return ''
  return pool[hash(key) % pool.length]
}

/**
 * "a" or "an", for a word the writer does not know in advance.
 *
 * Injuries, facilities and competitions all get dropped into a sentence from
 * generated data, and "a ankle sprain" turned up on screen the first time this
 * was tried. Vowel-letter rather than vowel-sound: the words that reach this
 * are ordinary nouns, and the exceptions that would need a pronunciation
 * dictionary — an hour, a unicorn — do not occur in them.
 */
export function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a'
}

/** The same word with its article in front of it. */
export function withArticle(word: string): string {
  return `${article(word)} ${word}`
}

/**
 * How a contact is saved on the phone.
 *
 * "Jude Holloway (Scout)" — which is how anybody saves somebody whose name
 * they know but whose job they need reminding of. It is also what makes the
 * thread list legible: twelve conversations with people, each one saying what
 * that person is to you.
 *
 * The role alone where there is no name, because a phone that does not know
 * who the competition secretary is saves them as "Competition Secretary" and
 * that is a perfectly good contact.
 */
export function contact(name: string | null | undefined, role: string): string {
  const trimmed = name?.trim()
  return trimmed ? `${trimmed} (${role})` : role
}

// ---------------------------------------------------------------------------
// Who is speaking, and how they feel about you
// ---------------------------------------------------------------------------

/**
 * How the board is currently disposed towards you.
 *
 * Not a mood: `confidence` is computed every week from results against the
 * expectation, the books, and whether you did what you were told, and
 * `warnings` is the formal count that ends a job at three. A chairman writing
 * to a director he has already warned twice does not write the way he did in
 * August, and the game already knows which of those it is.
 */
export type BoardTone = 'backing' | 'neutral' | 'cooling' | 'hostile'

export function boardTone(confidence: number, warnings = 0): BoardTone {
  if (warnings >= 2 || confidence < 22) return 'hostile'
  if (confidence < 45) return 'cooling'
  if (confidence >= 72) return 'backing'
  return 'neutral'
}

/**
 * How a chairman talks, which follows from what he is.
 *
 * `OwnerKind` was already generated with the world and read only for money and
 * patience. It is also the single best thing the game knows about how the man
 * would phrase a sentence: a family that has held the club for eighty years
 * does not write like a fund that bought it in March, and a supporters' trust
 * does not write like either.
 */
export type ChairmanRegister =
  | 'paternal'   // legacyFamily — long view, the club as an inheritance
  | 'plain'      // localBusiness — blunt, money-minded, fair
  | 'corporate'  // foreignFund — metrics, distance, the passive voice
  | 'breezy'     // celebrity — enthusiastic, vague, slightly absent
  | 'committee'  // consortium — hedged, nobody's own opinion
  | 'earnest'    // fanOwned — sincere, apologetic about money

const REGISTERS: Record<string, ChairmanRegister> = {
  legacyFamily: 'paternal',
  localBusiness: 'plain',
  foreignFund: 'corporate',
  celebrity: 'breezy',
  consortium: 'committee',
  fanOwned: 'earnest',
}

export function chairmanRegister(kind: string): ChairmanRegister {
  return REGISTERS[kind] ?? 'plain'
}

/**
 * How a head coach talks to you.
 *
 * Derived rather than invented. `mediaHandling` is how much a coach courts the
 * press — a talker talks — and `dofRelationship` is what he thinks of you
 * specifically, which the match verdict already leans on. Both were modelled
 * and neither reached the words on the screen.
 */
export type CoachRegister = 'warm' | 'brisk' | 'terse' | 'pointed'

export function coachRegister(mediaHandling: number, dofRelationship: number): CoachRegister {
  if (dofRelationship < 30) return 'pointed'
  if (dofRelationship >= 65) return mediaHandling >= 50 ? 'warm' : 'brisk'
  return mediaHandling >= 55 ? 'brisk' : 'terse'
}

/**
 * A line from the pool belonging to one register, varied within it.
 *
 * Keeps the writing at the call site where the message is, rather than in a
 * table somewhere else that has to be read alongside it.
 */
export function pickBy<K extends string>(
  key: string,
  group: K,
  pools: Record<K, readonly string[]>,
): string {
  return phrase(key, pools[group] ?? [])
}
