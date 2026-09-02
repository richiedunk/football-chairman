import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { computeAttendance } from '../src/engine/sim/match'
import { Rng } from '../src/engine/rng'
import type { Club, GameState } from '../src/engine/types'

/**
 * Attendance is a headcount, not a share of the ground.
 *
 * This is the one property worth a test of its own, because losing it is
 * silent and expensive. For a long time `computeAttendance` returned a
 * *fraction* of capacity, which meant a club that doubled its stadium filled
 * the same fraction of it and sold out all over again — AI grounds ran away to
 * an average of 103,849 places over thirty seasons, no stadium could ever be
 * too big for its club, and closing a stand on safety grounds quietly reduced
 * demand to match instead of costing anything.
 *
 * Nothing else would catch a regression to that. The world would still load,
 * every test would still pass, and the number would only look wrong to
 * somebody who ran a thirty-season career and thought to check the size of the
 * grounds.
 */

let state: GameState
let home: Club
let away: Club

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'ATTENDANCE', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  // A well supported club, so there is demand to be constrained in the first
  // place, and an opponent worth watching.
  const byFanbase = Object.values(state.clubs).sort((a, b) => b.fanbase - a.fanbase)
  home = byFanbase[0]
  away = byFanbase[1]
})

/** Same draw every time, so a difference is the ground and not the dice. */
const attend = (h: Club, a: Club): number => computeAttendance(h, a, new Rng('gate'), false)

describe('how many people come', () => {
  it('does not grow to fill whatever has been built', () => {
    const before = attend(home, away)
    const stadium = home.facilities.stadium
    const was = stadium.capacity
    stadium.capacity = was * 4
    const after = attend(home, away)
    stadium.capacity = was

    expect(after, 'quadrupling the ground quadrupled the crowd').toBeLessThan(before * 1.5)
  })

  // True under the old model too, and kept because it is the rule the rest of
  // the file leans on rather than a new behaviour.
  it('sells out a ground too small for the support, and no more', () => {
    const stadium = home.facilities.stadium
    const was = stadium.capacity
    stadium.capacity = 1_000
    const crowd = attend(home, away)
    stadium.capacity = was

    expect(crowd, 'let more people in than the ground holds').toBe(1_000)
  })

  it('leaves seats empty at a club that has over-built', () => {
    const stadium = home.facilities.stadium
    const was = stadium.capacity
    stadium.capacity = 400_000
    const crowd = attend(home, away)
    stadium.capacity = was

    expect(crowd, 'an absurd ground still filled').toBeLessThan(200_000)
  })

  it('costs a club nothing to shut seats it was never filling', () => {
    // The old model cut attendance in proportion to capacity, so a half-empty
    // ground lost half its crowd by closing a quarter of itself — supporters
    // who had a seat, in a stand that was still open, simply stopped coming.
    const stadium = home.facilities.stadium
    const was = stadium.capacity
    stadium.capacity = 400_000
    const roomy = attend(home, away)
    stadium.capacity = 300_000
    const trimmed = attend(home, away)
    stadium.capacity = was

    expect(trimmed, 'closing empty seats drove real supporters away').toBe(roomy)
  })

  it('draws a bigger crowd for a bigger club, at the same ground', () => {
    const stadium = home.facilities.stadium
    const was = stadium.capacity
    // Big enough that the ground is never the constraint either way.
    stadium.capacity = 400_000
    const asIs = attend(home, away)
    const smallerClub = { ...home, reputation: Math.max(3, home.reputation - 30) }
    const reduced = computeAttendance(smallerClub, away, new Rng('gate'), false)
    stadium.capacity = was

    expect(reduced, 'standing made no difference to the gate').toBeLessThan(asIs)
  })
})
