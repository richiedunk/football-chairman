import { describe, expect, it } from 'vitest'
import {
  MAX_CAREER_SEASONS,
  RETIREMENT_AGE,
  STARTING_AGE,
  careerSummary,
  mustRetire,
  retirementHeadline,
  seasonsRemaining,
} from '../src/engine/systems/directorCareer'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { simulated } from './support/simulated'
import type { DirectorProfile, GameState } from '../src/engine/types'

const at = (age: number) => ({ age }) as DirectorProfile

describe('the career clock', () => {
  it('runs from thirty to sixty-five', () => {
    expect(STARTING_AGE).toBe(30)
    expect(RETIREMENT_AGE).toBe(65)
    expect(MAX_CAREER_SEASONS).toBe(35)
  })

  it('counts down the seasons left', () => {
    expect(seasonsRemaining(at(30))).toBe(35)
    expect(seasonsRemaining(at(64))).toBe(1)
    expect(seasonsRemaining(at(65))).toBe(0)
  })

  it('never reports negative time left', () => {
    expect(seasonsRemaining(at(80))).toBe(0)
  })

  it('ends it at sixty-five and not before', () => {
    expect(mustRetire(at(64))).toBe(false)
    expect(mustRetire(at(65))).toBe(true)
    expect(mustRetire(at(66))).toBe(true)
  })
})

describe('a career in progress', () => {
  let state: GameState
  let deps: { ids: ReturnType<typeof prepareNewGame>['ids']; names: ReturnType<typeof prepareNewGame>['names'] }

  function fresh() {
    const setup = prepareNewGame({
      seed: 'AGE', directorName: 'Richie Dunk', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    deps = { ids: setup.ids, names: setup.names }
    return startCareerAt(setup, setup.candidates[0].id)
  }

  it('starts a new director at thirty', () => {
    state = fresh()
    expect(state.director.age).toBe(STARTING_AGE)
    expect(state.director.retiredAtSeason).toBeUndefined()
  })

  it('adds a year at the season roll, not weekly', () => {
    // Both readings come out of one run, and the pair is the assertion: the
    // clock must not have moved by week twenty and must have by week sixty.
    const { midSeason, afterRoll } = simulated('director-ages', () => {
      const world = fresh()
      for (let week = 0; week < 20; week++) advanceWeek(world, deps)
      const mid = world.director.age
      for (let week = 0; week < 40; week++) advanceWeek(world, deps)
      return { midSeason: mid, afterRoll: world.director.age }
    })
    expect(midSeason, 'aged mid-season').toBe(STARTING_AGE)
    expect(afterRoll).toBe(STARTING_AGE + 1)
  })

  /**
   * One retirement, read by both tests that need one.
   *
   * They were running the identical setup — jump the director to sixty-four,
   * play until he goes — and paying for it twice, forty seconds between them.
   */
  const retired = () => simulated('director-retires', () => {
    const world = fresh()
    // Jump the clock rather than simulating thirty-five seasons: the birthday
    // is what is under test, not the intervening football.
    world.director.age = RETIREMENT_AGE - 1
    let guard = 0
    while (world.director.retiredAtSeason === undefined && guard < 120) {
      advanceWeek(world, deps)
      guard++
    }
    return world
  })

  it('retires at sixty-five, with the record intact', () => {
    state = retired()
    expect(state.director.retiredAtSeason, 'never retired').toBeDefined()
    expect(state.director.age).toBe(RETIREMENT_AGE)
    expect(state.director.retiredBecause).toBe('age')
    // And no dangling offer of a job the rules will not let anyone take.
    expect(state.director.jobOffers).toEqual([])
  })

  it('tells the player it has happened', () => {
    state = retired()
    const notice = state.inbox.find((item) => item.subject.includes('end of it'))
    expect(notice, 'no word to the player that his career ended').toBeDefined()
  })
})

describe('careerSummary', () => {
  it('reports a career that has actually been lived', () => {
    const setup = prepareNewGame({
      seed: 'SUMMARY', directorName: 'Richie Dunk', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    state.director.age = 42

    const summary = careerSummary(state, 'age')
    expect(summary.name).toBe('Richie Dunk')
    expect(summary.age).toBe(42)
    expect(summary.seasonsWorked).toBe(12)
    expect(summary.clubs).toBeGreaterThan(0)
    expect(summary.finalClubName).toBeTruthy()
    expect(summary.trophies).toBeGreaterThanOrEqual(0)
  })

  it('tells stepping down apart from being retired by the calendar', () => {
    const setup = prepareNewGame({
      seed: 'SUMMARY2', directorName: 'Pat Nevin', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    state.director.age = 58

    expect(retirementHeadline(careerSummary(state, 'choice'))).toBe('Pat Nevin steps down at 58')
    expect(retirementHeadline(careerSummary(state, 'age'))).toBe('Pat Nevin retires at 58')
  })
})
