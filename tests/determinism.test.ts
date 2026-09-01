import crypto from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import type { GameState } from '../src/engine/types'

/**
 * The same seed must produce the same world, every time, in any order.
 *
 * This is the property the save format, the tests and every measurement in
 * `scripts/` quietly depend on, and it was broken for most of the project's
 * life: the positional-rating memo was keyed on player id, and ids restart at
 * one for every world generated, so a second world in the same process
 * inherited the first world's ratings for every player. Nothing crashed. Teams
 * were simply rated as somebody else's team, which fed selection, strength and
 * every price derived from them.
 *
 * The fix was to key that cache on the attributes object rather than the id.
 * This is the test that stops it coming back: reverted onto the pre-fix engine,
 * two of the four below go red, so it is guarding something real rather than
 * asserting that the code does what it does.
 *
 * What it does not catch, so nobody mistakes it for more than it is: state
 * that is wrong but wrong *consistently*. A cache keyed on something lossy
 * that never resets hands every run the same wrong answer, and every
 * assertion here passes. Determinism is the property under test; correctness
 * of the cached value is somebody else's job.
 *
 * It runs the simulation for real. Caching these would defeat the point, so
 * the playthroughs are shared between the assertions and kept short: a cache
 * poisoned by another world shows up within a season, not after several.
 */

const WEEKS = 6

function build(seed: string) {
  const setup = prepareNewGame({
    seed, directorName: 'D', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  return { setup, state: startCareerAt(setup, startingClubCandidates(setup.state)[0].id) }
}

/** Everything except the wall clock, which is not simulation. */
function fingerprint(state: GameState): string {
  const { createdAt, savedAt, ...simulated } = state as GameState & {
    createdAt?: number
    savedAt?: number
  }
  void createdAt
  void savedAt
  return crypto.createHash('sha256').update(JSON.stringify(simulated)).digest('hex')
}

function play(seed: string, weeks = WEEKS): string {
  const { setup, state } = build(seed)
  const deps = { ids: setup.ids, names: setup.names }
  for (let w = 0; w < weeks; w++) advanceWeek(state, deps)
  return fingerprint(state)
}

describe('a seed is a promise', () => {
  // Four playthroughs, run once and shared, in the order that makes the
  // failure legible: two of the same seed back to back, then a different
  // world, then the first seed again.
  let first = ''
  let second = ''
  let other = ''
  let afterOther = ''

  beforeAll(() => {
    first = play('DET-A')
    second = play('DET-A')
    other = play('DET-B')
    afterOther = play('DET-A')
  })

  it('generates the same world twice', () => {
    expect(play('DET-GEN', 0)).toBe(play('DET-GEN', 0))
  })

  it('simulates the same world twice in one process', () => {
    // The one that was broken. Generation was always identical; the divergence
    // only appeared once the clock started, which is what pointed at state
    // living outside the world rather than inside it.
    expect(second).toBe(first)
  })

  it('is not disturbed by another world being simulated in between', () => {
    // The sharper version, and the shape the rating memo actually failed in:
    // the second world's players took the same ids as the first world's, so
    // whichever ran second was rated as somebody else's squad. If this fails
    // while the one above passes, the state is being shared between worlds
    // rather than merely surviving between runs.
    expect(afterOther).toBe(first)
  })

  it('gives different seeds different worlds', () => {
    // The control. A test that passes because everything is identical would
    // prove nothing at all.
    expect(other).not.toBe(first)
  })
})
