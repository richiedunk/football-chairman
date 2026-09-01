import { beforeAll, describe, expect, it } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { simulateMatch, setPieceCoaching } from '../src/engine/sim/match'
import { Rng } from '../src/engine/rng'
import { staffEffectiveness } from '../src/engine/world/staffGen'
import type { Club, GameState, Staff } from '../src/engine/types'

let state: GameState
let top: { clubIds: string[] }

beforeAll(() => {
  state = generateWorld({
    seed: 'SETPIECETEST', season: 2025, size: 'compact', homeNationId: 'eng',
    directorName: 'T', background: 'analyst',
  })
  top = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === 1)!
}, 180_000)

/** Play a division against itself and count where the goals came from. */
function sample(runs = 900) {
  const rng = new Rng('setpieces')
  let goals = 0
  let deadBall = 0
  let penalties = 0
  let pensAwarded = 0
  let byCentreBack = 0
  let n = 0
  for (let i = 0; i < runs; i++) {
    const ids = rng.sample(top.clubIds, 2)
    const r = simulateMatch(
      state, state.clubs[ids[0]], state.clubs[ids[1]], rng, { suspendedIds: new Set() }, true,
    )
    n++
    for (const e of r.events) {
      if (e.type === 'penaltyScored') { penalties++; pensAwarded++; goals++ }
      else if (e.type === 'penaltyMissed') pensAwarded++
      else if (e.type === 'goal') {
        goals++
        if (/delivery|set piece/.test(e.text)) deadBall++
        if (state.players[e.playerId]?.position === 'DC') byCentreBack++
      }
    }
  }
  return { goals, deadBall, penalties, pensAwarded, byCentreBack, matches: n }
}

describe('set pieces are a situation, not an attribute nobody reads', () => {
  it('produces a real share of the goals', () => {
    // A quarter to a third of real goals come from a dead ball. Anything much
    // below that and the mechanism is decoration; much above and it is a game
    // about corners.
    const s = sample()
    const share = (s.deadBall + s.penalties) / s.goals
    expect(share).toBeGreaterThan(0.2)
    expect(share).toBeLessThan(0.4)
  })

  it('awards about a quarter of a penalty a game, and mostly they go in', () => {
    const s = sample()
    expect(s.pensAwarded / s.matches).toBeGreaterThan(0.12)
    expect(s.pensAwarded / s.matches).toBeLessThan(0.45)
    // A penalty is the best chance in football and should convert like one.
    expect(s.penalties / s.pensAwarded).toBeGreaterThan(0.6)
  })

  it('puts centre-halves on the scoresheet', () => {
    // The whole reason a dead ball is worth modelling separately: it is the
    // one moment when the centre-half is the most dangerous man on the pitch.
    const s = sample()
    expect(s.byCentreBack / s.goals).toBeGreaterThan(0.04)
    expect(s.byCentreBack / s.goals).toBeLessThan(0.2)
  })

  it('leaves the shot count where it was calibrated', () => {
    // Set pieces are drawn out of the existing chances, not added on top.
    const rng = new Rng('shots')
    let shots = 0
    let n = 0
    for (let i = 0; i < 400; i++) {
      const ids = rng.sample(top.clubIds, 2)
      const r = simulateMatch(
        state, state.clubs[ids[0]], state.clubs[ids[1]], rng, { suspendedIds: new Set() }, false,
      )
      shots += r.shots!.home + r.shots!.away
      n++
    }
    expect(shots / n).toBeGreaterThan(22)
    expect(shots / n).toBeLessThan(30)
  })
})

describe('the set-piece coach', () => {
  it('is worth nothing at a club that has not hired one', () => {
    const bare = Object.values(state.clubs).find(
      (c) => !c.staff.some((id) => state.staff[id]?.role === 'setPieceCoach'),
    ) as Club
    expect(setPieceCoaching(state, bare)).toBe(1)
  })

  it('scales with the man rather than being a flat bonus', () => {
    const club = Object.values(state.clubs).find(
      (c) => c.staff.some((id) => state.staff[id]?.role === 'setPieceCoach'),
    )
    if (!club) return
    const coach = club.staff
      .map((id) => state.staff[id])
      .find((s): s is Staff => Boolean(s) && s.role === 'setPieceCoach')!
    const value = setPieceCoaching(state, club)
    expect(value).toBeGreaterThan(1)
    // A good one is worth more than a poor one, and neither is worth a lot.
    expect(value).toBeLessThan(1.13)
    expect(value).toBeCloseTo(1 + (staffEffectiveness(coach) / 100) * 0.12, 5)
  })

  it('does not inflate a division where everybody has one', () => {
    // Coaching enters as a ratio between the two sides, so equal coaching
    // cancels. A league of set-piece coaches is not a higher-scoring league —
    // the advantage is over the clubs who have not bothered.
    const a = Object.values(state.clubs).find(
      (c) => c.staff.some((id) => state.staff[id]?.role === 'setPieceCoach'),
    )
    const b = Object.values(state.clubs).find(
      (c) => c.id !== a?.id && c.staff.some((id) => state.staff[id]?.role === 'setPieceCoach'),
    )
    if (!a || !b) return

    const goalsFor = (home: Club, away: Club) => {
      let total = 0
      for (let i = 0; i < 300; i++) {
        const r = simulateMatch(
          state, home, away, new Rng(`n:${i}`), { suspendedIds: new Set() }, false,
        )
        total += r.homeGoals + r.awayGoals
      }
      return total / 300
    }

    const bothCoached = goalsFor(a, b)

    // Strip both and replay: the same fixture should score about the same.
    const stripped = JSON.parse(JSON.stringify(state)) as GameState
    for (const club of [stripped.clubs[a.id], stripped.clubs[b.id]]) {
      club.staff = club.staff.filter((id) => stripped.staff[id]?.role !== 'setPieceCoach')
    }
    let neither = 0
    for (let i = 0; i < 300; i++) {
      const r = simulateMatch(
        stripped, stripped.clubs[a.id], stripped.clubs[b.id],
        new Rng(`n:${i}`), { suspendedIds: new Set() }, false,
      )
      neither += r.homeGoals + r.awayGoals
    }
    expect(Math.abs(bothCoached - neither / 300)).toBeLessThan(0.15)
  })
})
