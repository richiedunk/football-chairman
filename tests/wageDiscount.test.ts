import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { Rng } from '../src/engine/rng'
import { minWageDiscount, runAiSquadManagement } from '../src/engine/systems/aiSquad'
import { computeWageDemand } from '../src/engine/systems/valuation'
import type { GameState, Player } from '../src/engine/types'

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'WAGEDISC', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}, 180_000)

function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

/**
 * Cut a player loose so the softening applies to him.
 *
 * Made good enough that nobody will sign him: `recruitOne` will not touch a
 * player above its club's ability ceiling at any price, so he stays on the
 * market for the length of the test. Without that the first version of these
 * tests had him signed within a month and measured nothing.
 */
function release(state: GameState, player: Player): Player {
  const club = player.clubId ? state.clubs[player.clubId] : null
  if (club) club.squad = club.squad.filter((id) => id !== player.id)
  player.clubId = null
  player.contract = null
  player.isAcademy = false
  player.injury = null
  player.currentAbility = 200
  player.weeksUnattached = 0
  player.wageDiscount = 1
  return player
}

describe('the guard rail', () => {
  it('barely moves for a good young player', () => {
    const state = world()
    const p = Object.values(state.players)[0]
    p.age = 22
    p.currentAbility = 150
    // Someone wants him and he knows it: a fifth off, and no further.
    expect(minWageDiscount(p)).toBeGreaterThan(0.75)
  })

  it('lets a journeyman veteran come most of the way down', () => {
    const state = world()
    const p = Object.values(state.players)[0]
    p.age = 34
    p.currentAbility = 85
    expect(minWageDiscount(p)).toBeLessThan(0.55)
    expect(minWageDiscount(p)).toBeGreaterThanOrEqual(0.45)
  })

  it('never lets anybody fall through the floor', () => {
    const state = world()
    for (const p of Object.values(state.players).slice(0, 300)) {
      expect(minWageDiscount(p)).toBeGreaterThanOrEqual(0.45)
      expect(minWageDiscount(p)).toBeLessThanOrEqual(0.9)
    }
  })
})

describe('coming down while nobody calls', () => {
  it('falls with time out of the game, and stops at his floor', () => {
    const state = world()
    const player = release(state, Object.values(state.players).find(
      (p) => p.clubId && !p.isAcademy && p.age >= 30,
    )!)
    expect(player.clubId).toBeNull()
    const floor = minWageDiscount(player)

    // A year and a half of nobody calling.
    for (let w = 0; w < 78; w++) {
      runAiSquadManagement(state, { rng: new Rng(`w${w}`), ids: { next: () => `n${w}` } as never })
    }
    expect(player.clubId, 'he was signed, so nothing was measured').toBeNull()
    expect(player.wageDiscount!).toBeLessThan(1)
    expect(player.wageDiscount!).toBeGreaterThanOrEqual(floor)
  })

  it('asks the market rate less the discount, computed fresh each time', () => {
    // The bug this replaced: the softened figure was stored, so a released
    // academy boy carried a sixteen-year-old's wage into the adult market and
    // undercut every professional in the queue.
    const state = world()
    const player = release(state, Object.values(state.players).find(
      (p) => p.clubId && !p.isAcademy,
    )!)
    const nation = state.nations[player.nationalityId]
    expect(player.clubId).toBeNull()

    for (let w = 0; w < 40; w++) {
      runAiSquadManagement(state, { rng: new Rng(`x${w}`), ids: { next: () => `m${w}` } as never })
    }
    const market = computeWageDemand(player, null, nation)
    expect(player.wageDemand).toBeCloseTo(
      Math.max(90, Math.round(market * player.wageDiscount!)), -1,
    )
  })

  it('does not discount a player who has a club', () => {
    const state = world()
    const employed = Object.values(state.players).find((p) => p.clubId && !p.isAcademy)!
    const before = employed.wageDiscount ?? 1
    for (let w = 0; w < 20; w++) {
      runAiSquadManagement(state, { rng: new Rng(`y${w}`), ids: { next: () => `k${w}` } as never })
    }
    expect(employed.wageDiscount ?? 1).toBe(before)
  })
})
