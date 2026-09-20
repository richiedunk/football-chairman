import { describe, expect, it } from 'vitest'
import { findThread, groupThreads, preview, threadKey } from '../src/ui/threads'
import type { InboxItem } from '../src/engine/types'

/**
 * The inbox, grouped into conversations.
 *
 * The grouping key is the sender string, because `from` across the whole engine
 * is a role or a named character rather than prose. That is a load-bearing
 * assumption: if it is wrong, messages either vanish into a thread nobody opens
 * or are attributed to somebody who did not send them. Both are worse than the
 * flat list this replaces, so the guarantees are tested rather than assumed.
 */

let counter = 0

function item(partial: Partial<InboxItem> & { from: string }): InboxItem {
  counter += 1
  return {
    id: `inbox_${counter}`,
    season: 1,
    week: 1,
    category: 'board',
    subject: 'Subject',
    body: 'Body text.',
    read: true,
    urgent: false,
    decision: null,
    link: null,
    expiresWeek: null,
    ...partial,
  }
}

/** An undecided decision, which is what "pending" counts. */
function open(): InboxItem['decision'] {
  return {
    prompt: 'Well?',
    options: [{ id: 'yes', label: 'Yes', hint: 'It will cost you', available: true }],
    chosenId: null,
    defaultOptionId: 'yes',
    outcomeText: null,
  }
}

function answered(): InboxItem['decision'] {
  return { ...open()!, chosenId: 'yes', outcomeText: 'It cost you.' }
}

describe('grouping the inbox into threads', () => {
  it('puts messages from one sender in one thread', () => {
    const threads = groupThreads([
      item({ from: 'Chairman' }),
      item({ from: 'Chairman' }),
      item({ from: 'Club Secretary' }),
    ])
    expect(threads).toHaveLength(2)
    expect(threads.find((t) => t.title === 'Chairman')!.messages).toHaveLength(2)
  })

  it('drops no message, whoever it is from', () => {
    // The self-healing property. A sender the registry has never seen — a new
    // call site, an architect firm out of the name generator — must cost a
    // plain-looking thread and never a lost message.
    const items = [
      item({ from: 'Chairman' }),
      item({ from: 'Ashworth & Vane Consulting' }),
      item({ from: 'Somebody Nobody Anticipated' }),
    ]
    const threads = groupThreads(items)
    const grouped = threads.flatMap((t) => t.messages.map((m) => m.id))
    expect(grouped.sort()).toEqual(items.map((i) => i.id).sort())
  })

  it('does not split one sender on case or stray spacing', () => {
    const threads = groupThreads([
      item({ from: 'Chairman' }),
      item({ from: 'chairman' }),
      item({ from: '  Chairman  ' }),
      item({ from: 'Chairman\tHouse' }),
    ])
    // The first three are one man. The fourth is not, and must not be merged
    // into him by any amount of tidying.
    expect(threads).toHaveLength(2)
    expect(threads.find((t) => t.key === 'chairman')!.messages).toHaveLength(3)
  })

  it('folds one department writing under two letterheads into one thread', () => {
    // The engine sends as both 'Recruitment' and 'Head of Recruitment'. It is
    // one desk, and two near-identical threads is two places to check.
    const threads = groupThreads([
      item({ from: 'Recruitment' }),
      item({ from: 'Head of Recruitment' }),
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].title).toBe('Recruitment')
    expect(threads[0].messages).toHaveLength(2)
  })

  it('does not merge two senders who are merely similar', () => {
    // The guard on the line above. Anything cleverer than a named alias —
    // stripping titles, collapsing initials — attributes a message to somebody
    // who did not send it, which is worse than a duplicate thread.
    expect(threadKey('Head Coach')).not.toBe(threadKey('Marcus Reidy'))
    expect(threadKey('Press Officer')).not.toBe(threadKey('Communications'))
    expect(threadKey('Club Secretary')).not.toBe(threadKey('Competition Secretary'))
  })

  it('reads a conversation downwards, oldest first', () => {
    // The store hands over `state.inbox`, which is newest first because items
    // are unshifted onto it. A thread read in that order is a conversation
    // running backwards.
    const threads = groupThreads([
      item({ from: 'Chairman', season: 2, week: 3, subject: 'Third' }),
      item({ from: 'Chairman', season: 2, week: 1, subject: 'Second' }),
      item({ from: 'Chairman', season: 1, week: 40, subject: 'First' }),
    ])
    expect(threads[0].messages.map((m) => m.subject)).toEqual(['First', 'Second', 'Third'])
    expect(threads[0].latest.subject).toBe('Third')
  })

  it('keeps two messages from one week in the order they arrived', () => {
    // Season and week are equal, so the array's own order is the only record
    // of which came first. Nine things can arrive in one week.
    const threads = groupThreads([
      item({ from: 'Chairman', week: 5, subject: 'Later' }),
      item({ from: 'Chairman', week: 5, subject: 'Earlier' }),
    ])
    expect(threads[0].messages.map((m) => m.subject)).toEqual(['Earlier', 'Later'])
  })

  it('orders threads by when they were last spoken in', () => {
    const threads = groupThreads([
      item({ from: 'Recruitment', season: 2, week: 2 }),
      item({ from: 'Chairman', season: 2, week: 9 }),
      item({ from: 'Club Secretary', season: 1, week: 1 }),
    ])
    expect(threads.map((t) => t.title)).toEqual(['Chairman', 'Recruitment', 'Club Secretary'])
  })

  it('puts the thread waiting on an answer first when the week is the same', () => {
    const threads = groupThreads([
      item({ from: 'Recruitment', week: 4 }),
      item({ from: 'Chairman', week: 4, decision: open() }),
    ])
    expect(threads[0].title).toBe('Chairman')
  })

  it('counts unread and open decisions per thread', () => {
    const threads = groupThreads([
      item({ from: 'Chairman', read: false }),
      item({ from: 'Chairman', read: false, decision: open() }),
      item({ from: 'Chairman', decision: answered() }),
    ])
    expect(threads[0].unread).toBe(2)
    expect(threads[0].pending).toBe(1)
  })

  it('does not count a decision that already resolved itself', () => {
    // An expired item has a chosenId written by the engine and an outcome
    // explaining that nobody answered. It is history, not an outstanding ask,
    // and a badge on it would send the reader looking for a decision that is
    // no longer theirs to make.
    const threads = groupThreads([item({ from: 'Chairman', decision: answered() })])
    expect(threads[0].pending).toBe(0)
    expect(threads[0].urgent).toBe(false)
  })

  it('flags a thread urgent only while the blocking decision is open', () => {
    const blocked = groupThreads([item({ from: 'Chairman', urgent: true, decision: open() })])
    expect(blocked[0].urgent).toBe(true)

    const done = groupThreads([item({ from: 'Chairman', urgent: true, decision: answered() })])
    expect(done[0].urgent).toBe(false)
  })

  it('sums to the same unread total the tab badge shows', () => {
    // The badge counts the flat inbox. Two numbers disagreeing about how much
    // is unread is the kind of thing a reader notices immediately and cannot
    // explain, so they are made to come from the same messages.
    const items = [
      item({ from: 'Chairman', read: false }),
      item({ from: 'Club Secretary', read: false }),
      item({ from: 'Recruitment' }),
    ]
    const total = groupThreads(items).reduce((sum, t) => sum + t.unread, 0)
    expect(total).toBe(items.filter((i) => !i.read).length)
  })

  it('finds a thread by its key, and nothing by a key that names none', () => {
    const threads = groupThreads([item({ from: 'Chairman' })])
    expect(findThread(threads, 'chairman')?.title).toBe('Chairman')
    expect(findThread(threads, 'nobody')).toBeNull()
  })

  it('previews what was said rather than what it was filed as', () => {
    // "From the head coach" is a filing label. The first line of the body is
    // what he actually said, which is what a reader scanning a list wants.
    const line = preview(item({
      from: 'Marcus Reidy',
      subject: 'From the head coach',
      body: 'I need a centre-back.\nThe one we have is thirty-four.',
    }))
    expect(line).toBe('I need a centre-back.')
  })

  it('falls back to the subject when a body has nothing in it', () => {
    expect(preview(item({ from: 'Chairman', subject: 'Filed', body: '\n  \n' }))).toBe('Filed')
  })
})
