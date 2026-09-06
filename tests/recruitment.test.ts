import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  PHILOSOPHIES, PHILOSOPHY_CHANGE_COST, PHILOSOPHY_LOCK_WEEKS, canChangePhilosophy,
  inferPhilosophy, philosophyAppeal, philosophyById, philosophyOf, setPhilosophy, targetSquadFor,
} from '../src/engine/systems/recruitment'
import { computeWageDemand } from '../src/engine/systems/valuation'
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

/**
 * The softening of a free agent's demands has to reach the code that prices
 * him, and for a long time it did not.
 *
 * `runAiSquadManagement` knocked 7% off `player.wageDemand` every fourth week
 * a player went unsigned, described as "the mechanism that lets a player
 * released by a second-tier club end up playing non-league". `recruitOne`
 * prices every candidate through `computeWageDemand`, which is derived from
 * ability and league and never read that field — so the discount reached the
 * transfer screen and the contract talks, where a *human* director saw it, and
 * never once reached an AI club. Measured at the time: of 95 free agents aged
 * 24-31, a fifth-tier club could afford two.
 *
 * A regression here is silent — the field would still be written, the screens
 * would still show it, and only a fourteen-season run would notice the lower
 * divisions filling up with teenagers again.
 */
describe('a man nobody has called for a year', () => {
  const priced = (weeks: number): number => {
    const template = Object.values(state.players).find((p) => p.age >= 24 && p.age <= 31)!
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]
    const candidate: Player = { ...template, weeksUnattached: weeks }
    return computeWageDemand(candidate, league, nation)
  }

  it('asks for less the longer he waits', () => {
    expect(priced(52), 'a year unattached cost the same as a week').toBeLessThan(priced(1))
  })

  it('has come down by about a third after half a season', () => {
    // Four weeks to a step, 7% a step: 26 weeks is six steps, ~0.65.
    const ratio = priced(26) / priced(0)
    expect(ratio).toBeGreaterThan(0.55)
    expect(ratio).toBeLessThan(0.75)
  })

  it('stops coming down, rather than falling to nothing', () => {
    // Otherwise a player unwanted for a decade signs for the minimum wage and
    // the bottom of the market stops meaning anything.
    expect(priced(520)).toBe(priced(1040))
    expect(priced(520) / priced(0)).toBeGreaterThan(0.4)
  })

  it('charges full price for a player who has a club', () => {
    expect(priced(0)).toBe(priced(-5))
  })
})
