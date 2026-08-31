import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  PHILOSOPHIES, PHILOSOPHY_CHANGE_COST, PHILOSOPHY_LOCK_WEEKS, canChangePhilosophy,
  inferPhilosophy, philosophyAppeal, philosophyById, philosophyOf, setPhilosophy, targetSquadFor,
} from '../src/engine/systems/recruitment'
import type { Club, GameState, Player } from '../src/engine/types'

let state: GameState
let club: Club

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'RECRUIT', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
}, 180_000)

describe('a stated policy', () => {
  it('gives every club one', () => {
    for (const c of Object.values(state.clubs)) {
      expect(c.strategy.philosophy, `${c.name} has no policy`).toBeTruthy()
    }
  })

  it('sets the dials rather than sitting beside them', () => {
    setPhilosophy(state, club, 'starNames')
    expect(club.strategy.wageAggression).toBe(92)
    expect(club.strategy.youthEmphasis).toBe(10)

    setPhilosophy(state, club, 'developAndSell')
    expect(club.strategy.wageAggression).toBe(28)
    expect(club.strategy.youthEmphasis).toBe(82)
  })

  it('gives a division more than one way of recruiting', () => {
    // A world where every club recruits the same way is a market with no shape.
    const kinds = new Set(Object.values(state.clubs).map((c) => c.strategy.philosophy))
    expect(kinds.size).toBeGreaterThan(2)
  })

  it('describes what it costs as well as what it does', () => {
    for (const p of PHILOSOPHIES) {
      expect(p.summary.length, `${p.id} has no summary`).toBeGreaterThan(10)
      expect(p.tradeOff.length, `${p.id} gives nothing up`).toBeGreaterThan(10)
    }
  })
})

describe('changing it', () => {
  it('is free the first time, because the board are waiting to be told', () => {
    const fresh = { ...club, strategy: { ...club.strategy, philosophy: 'unstated' as const } }
    const verdict = canChangePhilosophy(state, fresh as Club, 'winNow')
    expect(verdict.ok).toBe(true)
    expect(verdict.confidenceCost).toBe(0)
  })

  it('is locked while the last one is still young', () => {
    setPhilosophy(state, club, 'homegrown')
    const verdict = canChangePhilosophy(state, club, 'winNow')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/will not tear it up/i)
  })

  it('costs board confidence once the lock has run', () => {
    setPhilosophy(state, club, 'homegrown')
    club.strategy.philosophySince = (state.date.season * 52 + state.date.week) - PHILOSOPHY_LOCK_WEEKS
    const verdict = canChangePhilosophy(state, club, 'winNow')
    expect(verdict.ok).toBe(true)
    expect(verdict.confidenceCost).toBe(PHILOSOPHY_CHANGE_COST)
  })

  it('refuses to restate what is already stated', () => {
    setPhilosophy(state, club, 'valueHunting')
    expect(canChangePhilosophy(state, club, 'valueHunting').ok).toBe(false)
  })
})

describe('everyone else can read it', () => {
  const at = (age: number, nationalityId: string, ability = 100): Player =>
    ({ age, nationalityId, currentAbility: ability } as Player)

  it('makes a develop-and-sell club attractive to the young and shut to the old', () => {
    setPhilosophy(state, club, 'developAndSell')
    expect(philosophyAppeal(club, at(20, club.nationId))).toBeGreaterThan(0)
    expect(philosophyAppeal(club, at(31, club.nationId))).toBeLessThan(0)
  })

  it('reverses that for a win-now club', () => {
    setPhilosophy(state, club, 'winNow')
    expect(philosophyAppeal(club, at(31, club.nationId))).toBeGreaterThan(0)
    expect(philosophyAppeal(club, at(20, club.nationId))).toBeLessThan(0)
  })

  it('makes a homegrown club a harder sell to a foreign player', () => {
    setPhilosophy(state, club, 'homegrown')
    expect(philosophyAppeal(club, at(24, club.nationId))).toBeGreaterThan(0)
    expect(philosophyAppeal(club, at(24, 'somewhere-else'))).toBeLessThan(0)
  })

  it('leaves an unstated club neutral, which is its own cost', () => {
    setPhilosophy(state, club, 'unstated')
    expect(philosophyAppeal(club, at(20, club.nationId))).toBe(0)
    expect(philosophyAppeal(club, at(33, 'somewhere-else'))).toBe(0)
  })
})

describe('the dials that were doing nothing', () => {
  it('makes targetSquadSize decide the squad a club works to', () => {
    // It was generated for every club in the world and read by nothing: the AI
    // worked to one constant, so every club wanted the same number of players.
    expect(targetSquadFor({ strategy: { targetSquadSize: 27 } } as Club, 24)).toBe(27)
    expect(targetSquadFor({ strategy: { targetSquadSize: 0 } } as Club, 24)).toBe(24)
    expect(targetSquadFor({ strategy: {} } as Club, 24)).toBe(24)
  })

  it('keeps a nonsense target inside something playable', () => {
    expect(targetSquadFor({ strategy: { targetSquadSize: 99 } } as Club, 24)).toBe(32)
    expect(targetSquadFor({ strategy: { targetSquadSize: 2 } } as Club, 24)).toBe(18)
  })
})

describe('reading a policy off an old save', () => {
  it('recognises a club that was already recruiting that way', () => {
    const dials = (over: Record<string, number>) =>
      ({ strategy: { youthEmphasis: 50, sellingClubStance: 50, wageAggression: 50, domesticBias: 50, ...over } } as unknown as Club)

    expect(inferPhilosophy(dials({ domesticBias: 85, youthEmphasis: 70 }))).toBe('homegrown')
    expect(inferPhilosophy(dials({ wageAggression: 88, youthEmphasis: 20 }))).toBe('starNames')
    expect(inferPhilosophy(dials({ youthEmphasis: 75, sellingClubStance: 70 }))).toBe('developAndSell')
    expect(inferPhilosophy(dials({ wageAggression: 70, sellingClubStance: 20 }))).toBe('winNow')
    expect(inferPhilosophy(dials({ domesticBias: 20, wageAggression: 30 }))).toBe('valueHunting')
  })

  it('says nothing rather than guessing when the dials say nothing', () => {
    expect(inferPhilosophy({ strategy: {} } as Club)).toBe('unstated')
  })

  it('falls back to a real policy for an unknown id', () => {
    expect(philosophyById(undefined).id).toBe('unstated')
    expect(philosophyOf({ strategy: {} } as Club).id).toBe('unstated')
  })
})
