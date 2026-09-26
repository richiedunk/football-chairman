/**
 * The inbox, grouped into conversations.
 *
 * The interrupt channel is a list of messages from a chairman, a head coach, an
 * agent and a club secretary, each waiting on an answer — which is a set of
 * conversations being rendered as one flat list. Grouping them by who is
 * talking is what makes the channel legible when nine things arrive in a week.
 *
 * **No engine change, and none needed.** `InboxItem.from` is not prose: across
 * the whole engine it resolves to about twenty values, and nearly all of them
 * are a role rather than a person — Chairman, Club Secretary, Recruitment, Your
 * representative, The League. The rest resolve to a named character: the head
 * coach's `knownAs`, a scout's, an outlet's name, an architect firm. So the
 * thread key is that string, and an unrecognised sender gets a thread of its
 * own rather than being dropped. A new call site with a new label costs a
 * plain-looking thread; it never costs a lost message.
 *
 * Two consequences, both accepted rather than discovered later. Sacking the
 * head coach ends his thread and starts another, which is correct: the old
 * conversation stays in the list as history. And two coaches sharing a name
 * over thirty-five seasons merge, which is cosmetic and not worth an engine
 * field.
 *
 * Pure, and given plain items rather than the store, so it can be tested in
 * Node like the engine is.
 */

import type { InboxCategory, InboxItem } from '../engine/types'

export interface Thread {
  /** Stable key, and the URL segment. The sender string, normalised. */
  key: string
  /** What the thread is called at the top of the screen and in the list. */
  title: string
  /**
   * The category of the most recent message. A sender keeps to one subject
   * almost always — the secretary writes about registration, the coach about
   * the squad — so this is a reliable label rather than a guess.
   */
  category: InboxCategory
  /** Oldest first. A conversation reads downwards; the inbox is newest first. */
  messages: InboxItem[]
  /** The most recent message, which is what the list row shows. */
  latest: InboxItem
  unread: number
  /** Undecided decisions, whether or not they block the week. */
  pending: number
  /** Whether any undecided decision here is one that blocks the week. */
  urgent: boolean
}

/**
 * Senders that are one department writing under two letterheads.
 *
 * `Recruitment` sends most of the department's messages and `Head of
 * Recruitment` sends one. They are the same desk, and left alone they produce
 * two near-identical threads that the reader has to check both of.
 *
 * Deliberately one entry. This is not a place to canonicalise names — two
 * people called Reidy are two people — and it is not a place to rename a role
 * into something more elegant, because a rename that merges nothing is a
 * lookup table doing no work. A sender earns a line here by being a second
 * name for a sender that already exists.
 */
const ALIASES: Record<string, string> = {
  'head of recruitment': 'Recruitment',
}

/**
 * The key two spellings of one sender must share.
 *
 * Case and surrounding space only. Anything cleverer — stripping punctuation,
 * collapsing initials — would merge two senders who are not the same person,
 * and a merged thread is a message attributed to somebody who did not send it.
 */
export function threadKey(from: string): string {
  const trimmed = from.trim().replace(/\s+/g, ' ')
  const lower = trimmed.toLowerCase()
  return ALIASES[lower]?.toLowerCase() ?? lower
}

/** What the thread is called, given the messages in it. */
function threadTitle(messages: InboxItem[]): string {
  const from = messages[messages.length - 1].from.trim().replace(/\s+/g, ' ')
  return ALIASES[from.toLowerCase()] ?? from
}

/**
 * Chronological order within a thread.
 *
 * `state.inbox` is newest first, and a conversation reads downwards, so the
 * order has to be reversed. Season and week are what actually order two
 * messages; where both match — nine things can arrive in one week — the
 * array's own order is the only record of which came first, so it breaks the
 * tie rather than leaving the pair to sort arbitrarily.
 */
function chronological(items: InboxItem[]): InboxItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const season = a.item.season - b.item.season
      if (season !== 0) return season
      const week = a.item.week - b.item.week
      if (week !== 0) return week
      return b.index - a.index
    })
    .map((entry) => entry.item)
}

/** True when a decision is still waiting on an answer. */
export function isOpen(item: InboxItem): boolean {
  return !!item.decision && item.decision.chosenId === null
}

/**
 * Group an inbox into threads, most recently active first.
 *
 * Takes the inbox in the order the store hands it over — newest first — and
 * returns threads in the order they were last spoken in, which is the order a
 * messaging list is read in and not the order the categories happen to fall.
 */
export function groupThreads(items: InboxItem[]): Thread[] {
  const byKey = new Map<string, InboxItem[]>()
  for (const item of items) {
    const key = threadKey(item.from)
    const existing = byKey.get(key)
    if (existing) existing.push(item)
    else byKey.set(key, [item])
  }

  const threads: Thread[] = []
  for (const [key, group] of byKey) {
    const messages = chronological(group)
    const latest = messages[messages.length - 1]
    threads.push({
      key,
      title: threadTitle(messages),
      category: latest.category,
      messages,
      latest,
      unread: messages.filter((m) => !m.read).length,
      pending: messages.filter(isOpen).length,
      urgent: messages.some((m) => m.urgent && isOpen(m)),
    })
  }

  // Most recently spoken in first. Ties go to the thread with something
  // outstanding, because between two conversations from the same week the one
  // waiting on an answer is the one being looked for.
  return threads.sort((a, b) => {
    const season = b.latest.season - a.latest.season
    if (season !== 0) return season
    const week = b.latest.week - a.latest.week
    if (week !== 0) return week
    return Number(b.pending > 0) - Number(a.pending > 0)
  })
}

/** Find one thread by the key in the URL, or null when it names nothing. */
export function findThread(threads: Thread[], key: string): Thread | null {
  return threads.find((t) => t.key === key) ?? null
}

/**
 * The monogram on a thread's avatar.
 *
 * Initials of the first two words, which gives CS for the Club Secretary and
 * MR for Marcus Reidy. A one-word sender — Recruitment, Chairman — takes its
 * first two letters instead, because a single letter in a circle is not
 * recognisable at a glance and recognising the sender at a glance is the only
 * thing the avatar is for.
 *
 * Bracketed suffixes are dropped: outlets used to be named "The Chronicle
 * (ENG)", a save older than format 22 may still hold a sender written that
 * way, and a monogram of TE tells the reader nothing.
 */
export function initials(title: string): string {
  const words = title
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => /[a-z0-9]/i.test(w))
  // A leading article is not part of a name. Every other outlet is called
  // "The something", and a wall of TO, TC, TG tells the reader nothing.
  if (words.length > 1 && /^(the|a|an)$/i.test(words[0])) words.shift()
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/**
 * The line under a thread's name in the list.
 *
 * The body's first line rather than the subject: a subject is a filing label
 * ("From the head coach") and the first line is what he said, which is what a
 * reader scanning a list of conversations is actually looking for.
 */
export function preview(item: InboxItem): string {
  const lines = item.body.split('\n').map((line) => line.trim()).filter(Boolean)
  // A line that ends on a colon is introducing the next one ("Touchline have
  // run this:"), and a preview that stops there says nothing.
  const first = lines[0] && lines[0].endsWith(':') && lines[1] ? `${lines[0]} ${lines[1]}` : lines[0]
  return shorten((first ?? item.subject).trim())
}

/** Longest preview before it is cut, in characters. Two lines on a phone. */
const PREVIEW_MAX = 96

/**
 * The first sentence, and no more than two lines of it.
 *
 * The list used to cut the whole first paragraph wherever one line ran out, so
 * the chairman's welcome read "The partners have agreed a number of priorities
 * alongsi…" — a word sliced in half, which reads as a rendering fault rather
 * than as a preview. A sentence is the natural unit of "what did they say",
 * and when even that is too long it is cut between words, not inside one.
 */
function shorten(line: string): string {
  const sentences = line.match(/.+?[.!?](?=\s|$)/g)?.map((x) => x.trim()) ?? [line]
  // A first sentence of a word or two — "Welcome.", "Right." — previews as
  // nothing at all, so it takes the next one with it when there is room.
  let sentence = sentences[0]
  if (sentence.length < 24 && sentences[1] && sentence.length + 1 + sentences[1].length <= PREVIEW_MAX) {
    sentence = `${sentence} ${sentences[1]}`
  }
  if (sentence.length <= PREVIEW_MAX) return sentence
  const cut = sentence.slice(0, PREVIEW_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > PREVIEW_MAX / 2 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—–-]+$/, '')}…`
}
