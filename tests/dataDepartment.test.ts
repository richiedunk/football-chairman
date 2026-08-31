import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  DATA_REFRESH_WEEKS, fitsPolicy, modelDue, modelNoise, modelValuation, pruneFindings, runModel,
  modelTrust, moveConfidence, requiredEdgeFraction, shortlistSize,
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

describe('a department is never worse than not having one', () => {
  it('clears chance at every level, including the smallest', () => {
    // The first version filtered on a noisy estimate, which selects for
    // whoever drew the largest upward error — the winner's curse — and made a
    // level-1 department right one time in ten. A tool that is reliably wrong
    // is not a cheap tool, it is a trap.
    for (const level of [1, 5, 10, 15, 20]) {
      club.facilities.dataDepartment = level
      let right = 0
      let wrong = 0
      for (let run = 0; run < 12; run++) {
        for (const finding of runModel(state, club, new Rng(`chance:${level}:${run}`))) {
          const player = state.players[finding.playerId]
          if (!player) continue
          if (modelValuation(state, player, club) - player.value > 0) right++
          else wrong++
        }
      }
      const total = right + wrong
      if (total === 0) continue
      // Comfortably above chance, not marginally: the point is that the
      // department is worth consulting at any size, not that it scrapes past.
      expect(right / total, `level ${level} is right ${right} of ${total}`).toBeGreaterThan(0.6)
    }
  })

  it('never gets worse when you pay for it', () => {
    // The test that was missing. The old bar was picked as a curve over the
    // noise rather than derived from a target confidence, which left the
    // effective sigma sagging in the middle: level 8 sat at 1.90 where level 1
    // sat at 2.32, so a level-8 department was measurably *less* accurate than
    // a level-1 one. Asserting only "better than chance" did not catch it, and
    // a progression where spending money makes the tool worse is broken
    // whatever the accuracy floor.
    const accuracyAt = (level: number) => {
      club.facilities.dataDepartment = level
      let right = 0
      let wrong = 0
      // 150 rather than a handful: a small department produces two or three
      // names a run, so 25 runs put level 1 on a sample of 36 with a standard
      // error of six points — wide enough to fail on noise alone and to hide a
      // real regression. At this size the compact world is cleanly monotonic.
      for (let run = 0; run < 150; run++) {
        for (const finding of runModel(state, club, new Rng(`mono:${level}:${run}`))) {
          const player = state.players[finding.playerId]
          if (!player) continue
          if (modelValuation(state, player, club) - player.value > 0) right++
          else wrong++
        }
      }
      return right + wrong === 0 ? null : right / (right + wrong)
    }

    const levels = [1, 5, 8, 12, 16, 20]
    const scores = levels.map((level) => ({ level, accuracy: accuracyAt(level) }))
      .filter((row): row is { level: number; accuracy: number } => row.accuracy !== null)

    for (let i = 1; i < scores.length; i++) {
      const worstBelow = Math.min(...scores.slice(0, i).map((row) => row.accuracy))
      // A few points of sampling slack; the six-point drop that prompted this
      // is well outside it.
      expect(
        scores[i].accuracy,
        `level ${scores[i].level} (${(scores[i].accuracy * 100).toFixed(0)}%) is worse than a `
          + `cheaper department (${(worstBelow * 100).toFixed(0)}%)`,
      ).toBeGreaterThan(worstBelow - 0.03)
    }

    // And the whole range must actually go somewhere: the top is meaningfully
    // better than the bottom, not merely not-worse.
    expect(scores[scores.length - 1].accuracy - scores[0].accuracy).toBeGreaterThan(0.1)
  }, 120_000)

  it('holds itself to the same confidence at every level', () => {
    // The bar is derived from a target sigma rather than chosen, so the
    // false-positive rate is constant by construction. This is the property
    // that makes the accuracy curve well-behaved.
    const sigma = (level: number) =>
      requiredEdgeFraction(level) / (modelTrust(level) * modelNoise(level))
    for (const level of [1, 5, 8, 12]) {
      expect(sigma(level), `level ${level}`).toBeCloseTo(sigma(1), 5)
    }
    // At the top the floor binds instead, which only makes it stricter.
    expect(sigma(20)).toBeGreaterThan(sigma(1))
  })

  it('is never silent either — a department that says nothing is no use', () => {
    // The first fix overcorrected and levels 1 to 3 produced nothing at all.
    club.facilities.dataDepartment = 1
    let names = 0
    for (let run = 0; run < 12; run++) names += runModel(state, club, new Rng(`quiet:${run}`)).length
    expect(names, 'the smallest department never says anything').toBeGreaterThan(0)
  })

  it('says less rather than guessing when it cannot see clearly', () => {
    // What a small department buys is silence, not confident nonsense.
    const count = (level: number) => {
      club.facilities.dataDepartment = level
      let names = 0
      for (let run = 0; run < 12; run++) names += runModel(state, club, new Rng(`vol:${level}:${run}`)).length
      return names / 12
    }
    expect(count(1)).toBeLessThan(count(20))
  })
})

describe('the disruptive trait', () => {
  it('is not named after a disease', () => {
    // It was `clubhouseCancer`. Naming a person after an illness is a nasty
    // way to describe a footballer who is hard work.
    const source = Object.keys(state.players).slice(0, 1)
    expect(source.length).toBeGreaterThan(0)
    for (const player of Object.values(state.players)) {
      for (const trait of player.traits) {
        expect(String(trait)).not.toMatch(/cancer/i)
      }
    }
  })
})
