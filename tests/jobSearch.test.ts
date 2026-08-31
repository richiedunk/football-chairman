import { describe, expect, it } from 'vitest'
import {
  SACKING_REPUTATION_COST,
  advanceSearch,
  dismissDirector,
  openVacancies,
} from '../src/engine/systems/jobSearch'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { acceptJobOffer } from '../src/engine/season'
import { advanceWeek } from '../src/engine/tick'
import { simulated } from './support/simulated'
import { startingClubCandidates } from '../src/engine/systems/career'
import { IdFactory } from '../src/engine/ids'
import { Rng } from '../src/engine/rng'
import type { GameState } from '../src/engine/types'

function fresh(seed = 'JOBS') {
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  return { state, ids: setup.ids, names: setup.names, setup }
}

describe('being dismissed', () => {
  it('actually removes you from the club', () => {
    const { state, ids } = fresh()
    const clubId = state.playerClubId!
    expect(clubId).toBeTruthy()

    dismissDirector(state, ids, new Rng('sack'))

    expect(state.playerClubId, 'still holding the job').toBeNull()
    expect(state.clubs[clubId].isPlayerClub).toBe(false)
    expect(state.director.contract).toBeNull()
  })

  it('writes the spell into the record', () => {
    const { state, ids } = fresh()
    const before = state.director.careerHistory.length
    dismissDirector(state, ids, new Rng('sack'), 'Sacked')
    const entry = state.director.careerHistory[before - 1] ?? state.director.careerHistory[0]
    expect(entry.outcome).toBe('Sacked')
    expect(entry.toSeason).not.toBeNull()
  })

  it('costs you standing', () => {
    const { state, ids } = fresh()
    const before = state.director.reputation
    dismissDirector(state, ids, new Rng('sack'))
    expect(state.director.reputation).toBe(Math.max(1, before - SACKING_REPUTATION_COST))
  })

  it('never drives reputation below one', () => {
    const { state, ids } = fresh()
    state.director.reputation = 2
    dismissDirector(state, ids, new Rng('sack'))
    expect(state.director.reputation).toBeGreaterThanOrEqual(1)
  })

  it('cannot be sacked twice from the same chair', () => {
    // The bug this whole system exists to fix: 169 dismissals in one career,
    // because the first one never let go of the club.
    // Two years of football to find out whether one thing happens twice: the
    // count is what matters, not the world it came from, so the count is what
    // is cached. Re-simulated whenever engine code moves.
    const { sackings } = simulated('double-sack', () => {
      const { state, ids, names } = fresh('DOUBLESACK')
      const deps = { ids, names }
      let count = 0
      for (let week = 0; week < 120; week++) {
        const tick = advanceWeek(state, deps)
        if (tick.sacked) count++
        if (state.playerClubId === null) break
      }
      return { sackings: count }
    })
    expect(sackings, 'sacked more than once without being re-hired').toBeLessThanOrEqual(1)
  })
})

describe('the jobs board while out of work', () => {
  let state: GameState
  let ids: IdFactory

  it('is sparse — this is not the start of a career', () => {
    const world = fresh('SPARSE')
    state = world.state
    ids = world.ids
    dismissDirector(state, ids, new Rng('sack'))
    const vacancies = state.director.jobOffers
    expect(vacancies.length).toBeGreaterThan(0)
    expect(vacancies.length, 'a whole pyramid of options is not a job search')
      .toBeLessThanOrEqual(5)
  })

  it('lists no club twice', () => {
    const world = fresh('DUPES')
    dismissDirector(world.state, world.ids, new Rng('sack'))
    const ids2 = world.state.director.jobOffers.map((o) => o.clubId)
    expect(new Set(ids2).size).toBe(ids2.length)
  })

  it('shifts when a month passes', () => {
    const world = fresh('SHIFT')
    dismissDirector(world.state, world.ids, new Rng('sack'))
    const before = world.state.director.jobOffers.map((o) => o.clubId)

    // Several months, because any single one may happen to change nothing.
    let changed = false
    for (let month = 0; month < 6 && !changed; month++) {
      advanceSearch(world.state, world.ids, new Rng(`month${month}`))
      const after = world.state.director.jobOffers.map((o) => o.clubId)
      changed = after.length !== before.length || after.some((id, i) => id !== before[i])
    }
    expect(changed, 'the board never moved in six months').toBe(true)
  })

  it('never empties the board completely', () => {
    const world = fresh('NEVEREMPTY')
    dismissDirector(world.state, world.ids, new Rng('sack'))
    for (let month = 0; month < 12; month++) {
      advanceSearch(world.state, world.ids, new Rng(`m${month}`))
      expect(world.state.director.jobOffers.length,
        `nothing to apply for after ${month + 1} months`).toBeGreaterThan(0)
    }
  })

  it('offers something to an unproven director', () => {
    const world = fresh('UNPROVEN')
    world.state.director.xp = 0
    const vacancies = openVacancies(world.state, world.ids, new Rng('v'))
    expect(vacancies.length).toBeGreaterThan(0)
  })
})

describe('the club that sacked you', () => {
  it('is top of the board, because its post is genuinely vacant', () => {
    const { state, ids } = fresh()
    const clubId = state.playerClubId!
    const name = state.clubs[clubId].name

    dismissDirector(state, ids, new Rng('sack'))

    const first = state.director.jobOffers[0]
    expect(first, 'nothing on the board at all').toBeTruthy()
    expect(first.clubId).toBe(clubId)
    expect(first.clubName).toBe(name)
  })

  it('is shown as closed to you, with a reason', () => {
    const { state, ids } = fresh()
    dismissDirector(state, ids, new Rng('sack'))

    const own = state.director.jobOffers[0]
    expect(own.barred).toBe(true)
    expect(own.barredReason, 'a greyed-out row explains nothing').toMatch(/dismissed you/)
  })

  it('cannot be applied for even if the call is made directly', () => {
    const { state, ids } = fresh()
    dismissDirector(state, ids, new Rng('sack'))
    const own = state.director.jobOffers[0]

    const result = acceptJobOffer(state, own.id)

    expect(result.ok).toBe(false)
    expect(state.playerClubId, 'walked straight back in').toBeNull()
  })

  it('never comes back around on a later draw', () => {
    const { state, ids } = fresh()
    const clubId = state.playerClubId!
    dismissDirector(state, ids, new Rng('sack'))

    // Twenty months of looking. The door stays shut for all of them.
    for (let month = 0; month < 20; month++) {
      const drawn = openVacancies(state, ids, new Rng(`draw:${month}`))
      expect(drawn.some((o) => o.clubId === clubId), `month ${month}`).toBe(false)
    }
  })

  it('leaves every other post on the board takeable', () => {
    const { state, ids } = fresh()
    dismissDirector(state, ids, new Rng('sack'))

    const others = state.director.jobOffers.filter((o) => !o.barred)
    expect(others.length, 'the whole board was barred').toBeGreaterThan(0)
    for (const offer of others) expect(offer.barredReason).toBeUndefined()
  })
})
