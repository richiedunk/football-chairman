import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  DATA_REFRESH_WEEKS, fitsPolicy, modelDue, modelNoise, modelValuation, pruneFindings, runModel,
  moveConfidence, shortlistSize,
} from '../src/engine/systems/dataDepartment'
import { setPhilosophy } from '../src/engine/systems/recruitment'
import { Rng } from '../src/engine/rng'
import type { Club, GameState, Player } from '../src/engine/types'

let state: GameState
let club: Club

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'DATADEPT', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
  club.finances.transferBudget = 50_000_000
}, 180_000)

describe('what investment buys', () => {
  it('buys accuracy — a bad department is wrong, not quiet', () => {
    expect(modelNoise(1)).toBeGreaterThan(modelNoise(20))
    expect(modelNoise(1)).toBeGreaterThan(0.3)
    expect(modelNoise(20)).toBeLessThan(0.1)
  })

  it('buys a longer list', () => {
    expect(shortlistSize(1)).toBeLessThan(shortlistSize(20))
    expect(shortlistSize(1)).toBeGreaterThanOrEqual(2)
    expect(shortlistSize(20)).toBeLessThanOrEqual(14)
  })

  it('produces higher confidence at a bigger department, for the same player', () => {
    const cheap = { ...club, facilities: { ...club.facilities, dataDepartment: 1 } } as Club
    const dear = { ...club, facilities: { ...club.facilities, dataDepartment: 20 } } as Club
    const cheapRun = runModel(state, cheap, new Rng('a'))
    const dearRun = runModel(state, dear, new Rng('a'))
    const mean = (rows: { confidence: number }[]) =>
      rows.length ? rows.reduce((a, r) => a + r.confidence, 0) / rows.length : 0
    expect(mean(dearRun)).toBeGreaterThan(mean(cheapRun))
  })
})

describe('the edge it looks for', () => {
  it('values a player in the buyer\'s market, not the seller\'s', () => {
    // The arbitrage the whole department exists to exploit: the same player is
    // priced differently either side of a transfer.
    const outside = Object.values(state.players).find(
      (p) => p.clubId && p.clubId !== club.id && !p.isAcademy,
    )!
    const valued = modelValuation(state, outside, club)
    expect(valued).toBeGreaterThan(0)
  })

  it('is less certain the bigger the move, in either direction', () => {
    // Climbing asks whether he can cope; dropping asks whether he will bother.
    // Counting only the climb made every finding at a small club come back at
    // the ceiling, so the figure told the reader nothing about the player.
    // Sampled one per league rather than off the top of the player list —
    // players are generated league by league, so the first 200 all come from
    // the same division and every confidence came back identical.
    const perLeague = Object.values(state.leagues)
      .map((league) => Object.values(state.players).find(
        (p) => p.clubId && !p.isAcademy && state.clubs[p.clubId]?.leagueId === league.id,
      ))
      .filter((p): p is Player => Boolean(p))
    expect(perLeague.length, 'not enough leagues to compare').toBeGreaterThan(2)
    const confidences = perLeague.map((p) => moveConfidence(state, p, club))
    expect(Math.min(...confidences)).toBeLessThan(Math.max(...confidences))
    for (const c of confidences) {
      expect(c).toBeGreaterThanOrEqual(0.25)
      expect(c).toBeLessThanOrEqual(0.92)
    }
  })

  it('never claims certainty, however good the department', () => {
    club.facilities.dataDepartment = 20
    for (const finding of runModel(state, club, new Rng('sure'))) {
      expect(finding.confidence).toBeLessThan(1)
    }
  })
})

describe('expressed in the club\'s own terms', () => {
  const aged = (age: number, ability: number, nationalityId = club.nationId) =>
    ({ age, currentAbility: ability, nationalityId } as Player)

  it('does not spend a develop-and-sell club\'s time on players it will not sign', () => {
    setPhilosophy(state, club, 'developAndSell')
    expect(fitsPolicy(club, aged(21, 100))).toBe(true)
    expect(fitsPolicy(club, aged(29, 140))).toBe(false)
  })

  it('reverses that for a win-now club', () => {
    setPhilosophy(state, club, 'winNow')
    expect(fitsPolicy(club, aged(28, club.reputation * 1.3))).toBe(true)
    expect(fitsPolicy(club, aged(19, club.reputation * 0.9))).toBe(false)
  })

  it('keeps a homegrown club at home', () => {
    setPhilosophy(state, club, 'homegrown')
    expect(fitsPolicy(club, aged(24, 120))).toBe(true)
    expect(fitsPolicy(club, aged(24, 120, 'elsewhere'))).toBe(false)
  })

  it('lets a value hunter look everywhere, which is the point of it', () => {
    setPhilosophy(state, club, 'valueHunting')
    expect(fitsPolicy(club, aged(19, 60))).toBe(true)
    expect(fitsPolicy(club, aged(33, 60, 'elsewhere'))).toBe(true)
  })
})

describe('the list itself', () => {
  beforeAll(() => setPhilosophy(state, club, 'valueHunting'))

  it('never exceeds what the department can carry', () => {
    for (const level of [1, 6, 12, 20]) {
      club.facilities.dataDepartment = level
      expect(runModel(state, club, new Rng(`n${level}`)).length)
        .toBeLessThanOrEqual(shortlistSize(level))
    }
  })

  it('never lists a player the club already owns', () => {
    club.facilities.dataDepartment = 20
    for (const finding of runModel(state, club, new Rng('own'))) {
      expect(state.players[finding.playerId].clubId).not.toBe(club.id)
    }
  })

  it('does not invent names to fill the list', () => {
    // A club with no money should be shown nothing, not padding.
    const broke = {
      ...club,
      finances: { ...club.finances, transferBudget: 0 },
    } as Club
    expect(runModel(state, broke, new Rng('broke'))).toHaveLength(0)
  })

  it('runs on a cadence rather than every week', () => {
    const weeks = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter((week) => modelDue({ ...state, date: { ...state.date, week } } as GameState))
    expect(weeks.length).toBeGreaterThan(0)
    expect(weeks.length).toBeLessThanOrEqual(12 / DATA_REFRESH_WEEKS)
  })

  it('drops a finding once the player is ours', () => {
    const player = Object.values(state.players).find((p) => p.clubId !== club.id)!
    state.dataFindings = [{
      playerId: player.id, modelValue: 1, marketValue: 1,
      confidence: 0.5, rationale: '', week: 1, season: 2025,
    }]
    expect(pruneFindings(state, club)).toHaveLength(1)

    const owned = { ...state, players: { ...state.players, [player.id]: { ...player, clubId: club.id } } }
    expect(pruneFindings(owned as GameState, club)).toHaveLength(0)
  })
})
