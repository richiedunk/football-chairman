import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { Rng } from '../src/engine/rng'
import {
  ELEVEN, canFieldEleven, conjureYouth, fieldable, fixAiSquad, signEmergencyFreeAgent,
} from '../src/engine/systems/matchday'
import { selectTeam } from '../src/engine/sim/selection'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { Club, GameState, Player } from '../src/engine/types'

let base: GameState
let deps: { ids: import('../src/engine/ids').IdFactory; names: import('../src/engine/names/generator').NameGenerator; rng: Rng }

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'MATCHDAY', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  deps = { ids: setup.ids, names: setup.names, rng: new Rng('matchday') }
}, 180_000)

/** A fresh copy, so one test stripping a squad cannot affect the next. */
function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

/** Reduce a club to `keep` players, the way a bad season really would. */
function stripTo(state: GameState, club: Club, keep: number): void {
  const squad = seniorSquad(state, club)
  for (const player of squad.slice(keep)) {
    club.squad = club.squad.filter((id) => id !== player.id)
    club.registeredIds = club.registeredIds.filter((id) => id !== player.id)
    player.clubId = null
    player.contract = null
  }
  // The academy too, unless a test puts it back.
  for (const id of [...club.squad]) {
    const p = state.players[id]
    if (p?.isAcademy) {
      club.squad = club.squad.filter((x) => x !== id)
      delete state.players[id]
    }
  }
}

describe('a side is eleven players', () => {
  it('never picks a man who is injured, suspended, away or at another club', () => {
    // The old fallback was every owned or borrowed player with no filter at
    // all, so a short club would field someone on loan elsewhere that week.
    const state = world()
    const club = state.clubs[state.playerClubId!]
    stripTo(state, club, 8)

    const squad = seniorSquad(state, club)
    squad[0].injury = { type: 'Broken leg', weeksRemaining: 6, severity: 'moderate', lingeringEffect: 0 }
    squad[1].suspendedWeeks = 2
    const other = Object.values(state.clubs).find((c) => c.id !== club.id)!
    squad[2].loanClubId = other.id

    const team = selectTeam(state, club, new Rng('pick'), { suspendedIds: new Set(), week: 10 })
    const picked = new Set(team.starters.map((s) => s.playerId))
    expect(picked.has(squad[0].id)).toBe(false)
    expect(picked.has(squad[1].id)).toBe(false)
    expect(picked.has(squad[2].id)).toBe(false)
  })

  it('knows when a club cannot field one', () => {
    const state = world()
    const club = state.clubs[state.playerClubId!]
    expect(canFieldEleven(state, club, 10)).toBe(true)
    stripTo(state, club, 7)
    expect(canFieldEleven(state, club, 10)).toBe(false)
    expect(fieldable(state, club, 10).length).toBe(7)
  })
})

describe('an AI club fixes itself', () => {
  it('reaches eleven from seven, whatever it takes', () => {
    const state = world()
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    stripTo(state, club, 7)
    expect(canFieldEleven(state, club, 10)).toBe(false)

    fixAiSquad(state, club, deps, 10)
    expect(fieldable(state, club, 10).length).toBeGreaterThanOrEqual(ELEVEN)
  })

  it('reaches eleven from nothing at all', () => {
    // No seniors, no academy, and it still has to play on Saturday.
    const state = world()
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    stripTo(state, club, 0)
    expect(fieldable(state, club, 10).length).toBe(0)

    fixAiSquad(state, club, deps, 10)
    expect(fieldable(state, club, 10).length).toBeGreaterThanOrEqual(ELEVEN)
  })

  it('takes the academy before it invents anybody', () => {
    const state = world()
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    const academyBefore = club.squad
      .map((id) => state.players[id])
      .filter((p) => p?.isAcademy).length
    // Strip seniors but leave the academy where it is.
    for (const player of seniorSquad(state, club).slice(6)) {
      club.squad = club.squad.filter((id) => id !== player.id)
      club.registeredIds = club.registeredIds.filter((id) => id !== player.id)
      player.clubId = null
      player.contract = null
    }
    expect(academyBefore).toBeGreaterThan(0)

    const fix = fixAiSquad(state, club, deps, 10)
    expect(fix.promoted.length).toBeGreaterThan(0)
    // A club with an academy does not need to invent a sixteen-year-old.
    expect(fix.conjured.length).toBe(0)
  })

  it('signs within a quarter of its own best player, not the best in the world', () => {
    const state = world()
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    stripTo(state, club, 4)
    const best = Math.max(...seniorSquad(state, club).map((p) => p.currentAbility))

    // Put a player plainly out of this club's reach on the free market. He is
    // not the answer, however desperate the club is.
    const star = Object.values(state.players).find((p) => !p.clubId && !p.isAcademy)
      ?? Object.values(state.players)[0]
    star.clubId = null
    star.isAcademy = false
    star.injury = null
    star.currentAbility = Math.round(best * 2)

    const signed = signEmergencyFreeAgent(state, club)
    if (signed) {
      expect(signed.currentAbility).toBeLessThanOrEqual(best * 1.25)
      expect(signed.id).not.toBe(star.id)
      expect(signed.clubId).toBe(club.id)
      expect(signed.contract).toBeTruthy()
    }
  })

  it('invents a local sixteen-year-old and nothing better', () => {
    const state = world()
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    const youth = conjureYouth(state, club, deps) as Player
    expect(youth).toBeTruthy()
    expect(youth.age).toBe(16)
    expect(youth.clubId).toBe(club.id)
    expect(youth.isAcademy).toBe(true)
    // Scraped together locally: nobody is flying a teenager in for this.
    expect(youth.nationalityId).toBe(club.nationId)
    // And he is not a prospect anybody would celebrate.
    expect(youth.currentAbility).toBeLessThan(70)
  })
})

describe('the human is answerable', () => {
  it('is not rescued by the secretary', async () => {
    // The club secretary used to sign free agents once the squad fell below
    // the floor. He does not any more: the failure has to be reachable.
    const { runAiSquadManagement } = await import('../src/engine/systems/aiSquad')
    const state = world()
    const club = state.clubs[state.playerClubId!]
    stripTo(state, club, 6)
    const before = seniorSquad(state, club).length

    runAiSquadManagement(state, { rng: new Rng('ai'), ids: deps.ids })
    expect(seniorSquad(state, club).length).toBe(before)
  })
})
