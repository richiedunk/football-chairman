import { describe, expect, it } from 'vitest'
import { advanceIntent, type AdvanceContext } from '../src/ui/advance'

const base: AdvanceContext = {
  unreadResult: null,
  blockers: 0,
  isDeadlineWeek: false,
  openDeadlineOffers: 0,
  phase: 'autumn',
  nextFixture: { inWeeks: 1, opponent: 'Chelsea', isHome: false, competition: 'The Prem' },
  out: 0,
  suspended: 0,
}

const ctx = (over: Partial<AdvanceContext> = {}): AdvanceContext => ({ ...base, ...over })

describe('advanceIntent', () => {
  it('names the opponent, never the week', () => {
    const i = advanceIntent(ctx())
    expect(i.kind).toBe('match')
    expect(i.label).toBe('Advance to Chelsea')
    expect(i.label).not.toMatch(/week/i)
    expect(i.route).toBeNull()
  })

  it('puts venue, competition and availability on the second line', () => {
    const i = advanceIntent(ctx({ out: 2, suspended: 1 }))
    expect(i.detail).toBe('AWAY · THE PREM · 2 OUT 1 SUSP')
  })

  it('names only the state that applies', () => {
    expect(advanceIntent(ctx({ out: 2 })).detail).toBe('AWAY · THE PREM · 2 OUT')
    expect(advanceIntent(ctx({ suspended: 1 })).detail).toBe('AWAY · THE PREM · 1 SUSP')
  })

  it('leaves availability off when everyone is fit', () => {
    expect(advanceIntent(ctx()).detail).toBe('AWAY · THE PREM')
  })

  it('looks backwards only while a result is unread', () => {
    const i = advanceIntent(ctx({ unreadResult: 'Chelsea 1-2 United' }))
    expect(i.kind).toBe('postMatch')
    expect(i.label).toBe('Continue')
    expect(i.detail).toBe('CHELSEA 1-2 UNITED')
  })

  it('shows the result ahead of anything else, blockers included', () => {
    // The report is already on screen. Sending the player to the inbox from
    // under it would lose the result they were reading.
    expect(advanceIntent(ctx({ unreadResult: 'Chelsea 1-2 United', blockers: 2, isDeadlineWeek: true })).kind)
      .toBe('postMatch')
  })

  it('blocks on things that expire, and sends you to them', () => {
    const i = advanceIntent(ctx({ blockers: 2 }))
    expect(i.kind).toBe('blocked')
    expect(i.label).toBe('2 things need you first')
    expect(i.tone).toBe('warn')
    expect(i.route).toBe('/inbox')
  })

  it('says "one thing" rather than "1 things"', () => {
    expect(advanceIntent(ctx({ blockers: 1 })).label).toBe('One thing needs you first')
  })

  it('ranks a blocker above deadline day', () => {
    // Both are true in the same week often enough to matter, and an offer you
    // are about to lose beats a window you are about to close.
    expect(advanceIntent(ctx({ blockers: 1, isDeadlineWeek: true })).kind).toBe('blocked')
  })

  it('changes character on deadline day', () => {
    const i = advanceIntent(ctx({ isDeadlineWeek: true, openDeadlineOffers: 4 }))
    expect(i.kind).toBe('deadline')
    expect(i.tone).toBe('danger')
    expect(i.detail).toContain('4 OFFERS OPEN')
  })

  it('still advances on deadline day', () => {
    // It looks different because the window shutting cannot be undone, but it
    // must still move the clock. Routing the tap to the deadline screen left
    // the only control that advances the week unable to advance it: you looked
    // at the offers, came back, and it sent you there again.
    expect(advanceIntent(ctx({ isDeadlineWeek: true })).route).toBeNull()
  })

  it('handles a lone deadline offer without a stray plural', () => {
    expect(advanceIntent(ctx({ isDeadlineWeek: true, openDeadlineOffers: 1 })).detail)
      .toContain('1 OFFER OPEN')
  })

  it('names the season starting rather than counting a week', () => {
    const i = advanceIntent(ctx({ phase: 'preseason' }))
    expect(i.label).toBe('Start the season')
    expect(i.detail).toBe('AWAY · CHELSEA')
  })

  it('does not claim the season is starting mid-preseason', () => {
    const i = advanceIntent(
      ctx({ phase: 'preseason', nextFixture: { ...base.nextFixture!, inWeeks: 4 } }),
    )
    expect(i.kind).toBe('week')
    expect(i.detail).toBe('PRE-SEASON · CHELSEA IN 4 WEEKS')
  })

  it('tells the truth about a blank week', () => {
    const i = advanceIntent(ctx({ nextFixture: null }))
    expect(i.label).toBe('Advance a week')
    expect(i.detail).toBe('NO FIXTURE')
  })

  it('names the phase on a blank week that has one', () => {
    expect(advanceIntent(ctx({ phase: 'endOfSeason', nextFixture: null })).detail)
      .toBe('SEASON OVER')
  })

  it('always offers somewhere to go', () => {
    // Every state either advances or routes. A disabled primary action on the
    // screen the player lives on is a dead end.
    const states: Partial<AdvanceContext>[] = [
      {},
      { blockers: 3 },
      { isDeadlineWeek: true },
      { phase: 'preseason' },
      { nextFixture: null },
      { phase: 'endOfSeason', nextFixture: null },
    ]
    for (const over of states) {
      const i = advanceIntent(ctx(over))
      expect(i.label.length).toBeGreaterThan(0)
      expect(i.detail.length).toBeGreaterThan(0)
    }
  })
})
