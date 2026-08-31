import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { acceptJobOffer } from '../src/engine/season'
import { cupWeeksFor, isTwoLegged, roundsRequired } from '../src/engine/sim/cups'
import {
  CONTINENTAL_DEFS, MIN_CONTINENTAL_FIELD, allocateFields, buildContinentalPrizeMoney,
  confederationsPresent, defFor, qualifiersFor,
} from '../src/engine/systems/continental'
import { CONTINENTAL_WEEKS } from '../src/engine/sim/schedule'
import { SAVE_VERSION, type GameState } from '../src/engine/types'

/**
 * Continental competition.
 *
 * Generating a world and playing a season is expensive, so one world is built
 * once and every structural assertion reads from it. The season is played to
 * week 46 — after the last continental round and before the roll — because a
 * competition that has not finished by then has not finished at all.
 */
let state: GameState
let firstSeasonWinners: Record<string, string | null> = {}

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'CONTEST', directorName: 'T', background: 'scout',
    worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  const deps = { ids: setup.ids, names: setup.names }
  while (state.date.week < 46) {
    advanceWeek(state, deps)
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
  }
  for (const cup of Object.values(state.cups)) {
    if (cup.type === 'continental') firstSeasonWinners[cup.name] = cup.winnerId
  }
}, 300_000)

const continental = () => Object.values(state.cups).filter((c) => c.type === 'continental')

describe('which competitions exist', () => {
  it('creates one for every confederation that can field one', () => {
    const withFields = confederationsPresent(state)
      .filter((c) => allocateFields(state, c).length > 0)
    expect(withFields.length).toBeGreaterThan(0)
    for (const confederation of withFields) {
      const cups = continental().filter((c) => c.confederation === confederation)
      expect(cups.length, `${confederation} has no competition`).toBeGreaterThan(0)
    }
  })

  it('never fields one below the minimum', () => {
    for (const cup of continental()) {
      expect(cup.entrantIds.length, cup.name).toBeGreaterThanOrEqual(MIN_CONTINENTAL_FIELD)
    }
  })

  it('leaves no league awarding a place to a competition that does not exist', () => {
    // The whole reason this was built rather than deferred again.
    for (const league of Object.values(state.leagues)) {
      if (league.continentalPlaces.length === 0) continue
      const nation = Object.values(state.nations).find((n) => n.leagueIds.includes(league.id))
      const has = continental().some((c) => c.confederation === nation?.confederation)
      expect(has, `${league.name} awards a place to nothing`).toBe(true)
    }
  })

  it('gives every competition a name of its own', () => {
    const names = continental().map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    // Real club names are used in this game; real competition names are not.
    for (const def of CONTINENTAL_DEFS) {
      expect(def.name).not.toMatch(/champions league|europa|libertadores|concacaf/i)
    }
  })
})

describe('qualifying', () => {
  it('draws the field from league tables', () => {
    for (const confederation of confederationsPresent(state)) {
      const q = qualifiersFor(state, confederation)
      for (const clubId of [...q.elite, ...q.secondary]) {
        expect(state.clubs[clubId], 'qualified a club that does not exist').toBeTruthy()
      }
    }
  })

  it('never puts one club in two competitions', () => {
    const seen = new Set<string>()
    for (const cup of continental()) {
      for (const clubId of cup.entrantIds) {
        expect(seen.has(clubId), `${state.clubs[clubId]?.name} is in two competitions`).toBe(false)
        seen.add(clubId)
      }
    }
  })

  it('only qualifies clubs from its own confederation', () => {
    for (const cup of continental()) {
      for (const clubId of cup.entrantIds) {
        const club = state.clubs[clubId]
        const nation = state.nations[club.nationId]
        expect(nation.confederation, `${club.name} is in the wrong continent's cup`)
          .toBe(cup.confederation)
      }
    }
  })
})

describe('playing it', () => {
  it('converges to a single winner inside the season', () => {
    for (const cup of continental()) {
      expect(cup.winnerId, `${cup.name} did not produce a winner`).toBeTruthy()
      expect(state.clubs[cup.winnerId!], `${cup.name} winner does not exist`).toBeTruthy()
    }
  })

  it('plays every round two-legged except the final', () => {
    for (const cup of continental()) {
      const total = cupWeeksFor(cup.entrantIds.length, 'continental').length
      for (let round = 0; round < total - 1; round++) {
        expect(isTwoLegged(round, total, 'continental'), `${cup.name} round ${round}`).toBe(true)
      }
      expect(isTwoLegged(total - 1, total, 'continental'), `${cup.name} final`).toBe(false)
    }
  })

  it('keeps the domestic cup on its own shape', () => {
    // Only the semi-final, and never the final.
    expect(isTwoLegged(3, 5, 'domestic')).toBe(true)
    expect(isTwoLegged(4, 5, 'domestic')).toBe(false)
    expect(isTwoLegged(0, 5, 'domestic')).toBe(false)
  })

  it('leaves room between a second leg and the next round', () => {
    // The second leg lands three weeks after the first, so rounds closer than
    // four apart would play the next first leg on top of it.
    for (let i = 1; i < CONTINENTAL_WEEKS.length; i++) {
      expect(CONTINENTAL_WEEKS[i] - CONTINENTAL_WEEKS[i - 1]).toBeGreaterThan(3)
    }
  })

  it('adds fixtures for the clubs that qualified', () => {
    const cup = continental()[0]
    const played = state.fixtures.filter((f) => f.competitionId === cup.id && f.result)
    expect(played.length).toBeGreaterThan(0)
  })
})

describe('prize money', () => {
  it('ends the ladder on the prize for winning it', () => {
    // Built to a fixed six rungs, a five-round competition paid its winner the
    // semi-final figure, because settleRound clamps its index to the array end.
    for (const cup of continental()) {
      const def = defFor(cup)
      expect(def, `${cup.name} has no definition`).toBeTruthy()
      const rounds = roundsRequired(cup.entrantIds.length)
      expect(cup.prizeMoneyPerRound).toHaveLength(rounds)
      expect(cup.prizeMoneyPerRound[rounds - 1]).toBe(def!.prizeTop)
    }
  })

  it('rises every round', () => {
    for (const cup of continental()) {
      for (let i = 1; i < cup.prizeMoneyPerRound.length; i++) {
        expect(cup.prizeMoneyPerRound[i]).toBeGreaterThan(cup.prizeMoneyPerRound[i - 1])
      }
    }
  })

  it('handles a competition of a single round without dividing by zero', () => {
    expect(buildContinentalPrizeMoney(1_000, 1)).toEqual([1_000])
    expect(buildContinentalPrizeMoney(1_000, 0)).toEqual([1_000])
  })
})

describe('the v8 migration', () => {
  it('gives an existing save the competitions its leagues were promising', async () => {
    // The path a real career takes on upgrade: a save written before
    // continental competition existed, whose leagues have been awarding
    // qualification places into nothing for however many seasons.
    const { importSave } = await import('../src/storage/saves')

    const old = JSON.parse(JSON.stringify(state)) as GameState
    for (const id of Object.keys(old.cups)) {
      if (old.cups[id].type === 'continental') delete old.cups[id]
    }
    old.version = 7
    const before = Object.keys(old.cups).length

    const file = new File([JSON.stringify(old)], 'save.json', { type: 'application/json' })
    const migrated = await importSave(file)

    // SAVE_VERSION, not the literal 8: the point of this test is that an old
    // save is brought up to date, and pinning the number meant it broke the
    // next time a version was added rather than when migration broke.
    expect(migrated.version).toBe(SAVE_VERSION)
    const created = Object.values(migrated.cups).filter((c) => c.type === 'continental')
    expect(created.length, 'migration created no competitions').toBeGreaterThan(0)
    expect(Object.keys(migrated.cups).length).toBe(before + created.length)
    for (const cup of created) {
      expect(cup.entrantIds.length).toBeGreaterThanOrEqual(MIN_CONTINENTAL_FIELD)
      expect(cup.confederation).toBeTruthy()
    }
  })

  it('does not mint ids that collide with what the save already holds', async () => {
    const { importSave } = await import('../src/storage/saves')
    const old = JSON.parse(JSON.stringify(state)) as GameState
    for (const id of Object.keys(old.cups)) {
      if (old.cups[id].type === 'continental') delete old.cups[id]
    }
    old.version = 7

    const file = new File([JSON.stringify(old)], 'save.json', { type: 'application/json' })
    const migrated = await importSave(file)

    const ids = Object.values(migrated.cups).map((c) => c.id)
    expect(new Set(ids).size, 'two cups share an id').toBe(ids.length)
  })

  it('leaves a save that already has them alone', async () => {
    const { importSave } = await import('../src/storage/saves')
    const current = JSON.parse(JSON.stringify(state)) as GameState
    current.version = 7
    const before = Object.keys(current.cups).length

    const file = new File([JSON.stringify(current)], 'save.json', { type: 'application/json' })
    const migrated = await importSave(file)

    expect(Object.keys(migrated.cups).length, 'migration duplicated the competitions').toBe(before)
  })
})
