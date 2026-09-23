import { describe, expect, it } from 'vitest'
import { scheduleLeague } from '../src/engine/sim/schedule'
import { Rng } from '../src/engine/rng'
import { IdFactory } from '../src/engine/ids'

/** The longest run of consecutive home, or away, league games for any club. */
function longestRun(size: number, seed: number): number {
  const clubs = Array.from({ length: size }, (_, i) => `c${i}`)
  const fixtures = scheduleLeague(new Rng(seed), new IdFactory(), 'L', clubs, 2026)
  let worst = 0
  for (const club of clubs) {
    const venues = fixtures
      .filter((f) => f.homeClubId === club || f.awayClubId === club)
      .sort((a, b) => a.round - b.round)
      .map((f) => f.homeClubId === club)
    let run = 1
    for (let i = 1; i < venues.length; i++) {
      run = venues[i] === venues[i - 1] ? run + 1 : 1
      worst = Math.max(worst, run)
    }
  }
  return worst
}

describe('league schedule', () => {
  // Seventeen home games in a row was possible before: the venue rule held
  // its parity as clubs rotated round the circle. A run of three survives at
  // the halfway seam and around a bye in odd-sized divisions, which real
  // fixture lists have too.
  it('never keeps a club at home, or away, for more than three games running', () => {
    for (const size of [18, 20, 23, 24]) {
      for (const seed of [1, 7, 42]) {
        expect(longestRun(size, seed), `${size} clubs, seed ${seed}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('gives every club the same number of home and away games', () => {
    const clubs = Array.from({ length: 24 }, (_, i) => `c${i}`)
    const fixtures = scheduleLeague(new Rng(3), new IdFactory(), 'L', clubs, 2026)
    for (const club of clubs) {
      const home = fixtures.filter((f) => f.homeClubId === club).length
      const away = fixtures.filter((f) => f.awayClubId === club).length
      expect(home).toBe(away)
    }
  })
})
