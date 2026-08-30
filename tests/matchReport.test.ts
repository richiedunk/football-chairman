import { describe, expect, it } from 'vitest'
import { expectedPoints, manOfTheMatch, matchVerdict } from '../src/engine/systems/matchReport'
import type { Club, Fixture, MatchResult, Staff } from '../src/engine/types'

const club = (id: string, reputation: number) => ({ id, reputation }) as Club

const fixture = (homeClubId: string, awayClubId: string): Fixture =>
  ({ id: 'FIX1', homeClubId, awayClubId, week: 10, season: 2025 }) as Fixture

const result = (homeGoals: number, awayGoals: number, over: Partial<MatchResult> = {}): MatchResult =>
  ({
    homeGoals, awayGoals, events: [], ratings: {},
    homeLineup: [], awayLineup: [], possession: 50,
    shots: { home: 10, away: 10 }, shotsOnTarget: { home: 4, away: 4 },
    attendance: 20000, summary: '', ...over,
  }) as MatchResult

const coach = (dofRelationship: number): Staff =>
  ({ id: 'C1', coachProfile: { dofRelationship } }) as Staff

describe('expectedPoints', () => {
  it('rates an even home tie above an even away one', () => {
    expect(expectedPoints(60, 60, true)).toBeGreaterThan(expectedPoints(60, 60, false))
  })

  it('rises with the gap in class', () => {
    const easy = expectedPoints(80, 40, true)
    const even = expectedPoints(60, 60, true)
    const hard = expectedPoints(40, 80, false)
    expect(easy).toBeGreaterThan(even)
    expect(even).toBeGreaterThan(hard)
  })

  it('stays inside nought and three points', () => {
    for (const [a, b] of [[1, 100], [100, 1], [50, 50], [0, 0]]) {
      for (const home of [true, false]) {
        const p = expectedPoints(a, b, home)
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(3)
      }
    }
  })
})

describe('matchVerdict', () => {
  const us = club('US', 50)

  it('judges the result against the fixture, not against the scoreline', () => {
    // The same 1-0 defeat means different things depending on who it was to.
    const atChampions = matchVerdict(us, club('THEM', 92), fixture('THEM', 'US'), result(1, 0), null)
    const atStrugglers = matchVerdict(us, club('THEM', 20), fixture('THEM', 'US'), result(1, 0), null)
    expect(atChampions.outcome).toBe('L')
    expect(atStrugglers.outcome).toBe('L')
    expect(atChampions.verdict).toBe('par')
    expect(atStrugglers.verdict).toBe('dismal')
  })

  it('calls beating a far better side outstanding', () => {
    const v = matchVerdict(us, club('THEM', 92), fixture('THEM', 'US'), result(0, 1), null)
    expect(v.outcome).toBe('W')
    expect(v.verdict).toBe('outstanding')
  })

  it('does not congratulate a club for beating the worst side in the league', () => {
    const v = matchVerdict(us, club('THEM', 12), fixture('US', 'THEM'), result(3, 0), null)
    expect(v.verdict).toBe('par')
  })

  it('reads the score from the right side when away', () => {
    const v = matchVerdict(us, club('THEM', 50), fixture('THEM', 'US'), result(0, 2), null)
    expect(v.outcome).toBe('W')
  })

  it('stays quiet when there is no head coach to speak', () => {
    expect(matchVerdict(us, club('THEM', 50), fixture('US', 'THEM'), result(1, 1), null).coachLine)
      .toBe('')
  })

  it('lets a coach who trusts you say it differently', () => {
    const f = fixture('US', 'THEM')
    const bad = result(0, 3)
    const warm = matchVerdict(us, club('THEM', 20), f, bad, coach(80)).coachLine
    const cold = matchVerdict(us, club('THEM', 20), f, bad, coach(20)).coachLine
    expect(warm).not.toBe('')
    expect(cold).not.toBe('')
    expect(warm).not.toBe(cold)
  })

  it('says the same thing every time the same report is opened', () => {
    const f = fixture('US', 'THEM')
    const args = [us, club('THEM', 50), f, result(2, 2), coach(70)] as const
    expect(matchVerdict(...args).coachLine).toBe(matchVerdict(...args).coachLine)
  })

  it('always produces a headline', () => {
    for (const [h, a] of [[0, 0], [5, 0], [0, 5], [1, 2]]) {
      const v = matchVerdict(us, club('THEM', 50), fixture('US', 'THEM'), result(h, a), null)
      expect(v.headline.length).toBeGreaterThan(0)
    }
  })
})

describe('manOfTheMatch', () => {
  it('picks the best rated player from your own side only', () => {
    const r = result(1, 1, {
      homeLineup: ['a', 'b'],
      awayLineup: ['x', 'y'],
      ratings: { a: 7.1, b: 6.2, x: 9.4, y: 8.8 },
    })
    expect(manOfTheMatch(club('US', 50), fixture('US', 'THEM'), r)).toEqual({ playerId: 'a', rating: 7.1 })
  })

  it('picks from the away lineup when the club was away', () => {
    const r = result(1, 1, {
      homeLineup: ['a'], awayLineup: ['x', 'y'],
      ratings: { a: 9.9, x: 6.0, y: 7.5 },
    })
    expect(manOfTheMatch(club('US', 50), fixture('THEM', 'US'), r)?.playerId).toBe('y')
  })

  it('returns nothing rather than guessing when nobody was rated', () => {
    expect(manOfTheMatch(club('US', 50), fixture('US', 'THEM'), result(0, 0))).toBeNull()
  })
})
