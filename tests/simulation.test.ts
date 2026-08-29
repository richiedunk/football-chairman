import { describe, expect, it, beforeAll } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { simulateMatch } from '../src/engine/sim/match'
import { selectTeam } from '../src/engine/sim/selection'
import { Rng } from '../src/engine/rng'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { sortTable } from '../src/engine/systems/board'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { GameState } from '../src/engine/types'

describe('match engine', () => {
  let world: GameState

  beforeAll(() => {
    world = generateWorld({
      seed: 'MATCHTEST', season: 2025, size: 'compact', homeNationId: 'eng',
      directorName: 'T', background: 'analyst',
    })
  })

  it('produces results in line with real football', () => {
    const league = Object.values(world.leagues).find((l) => l.nationId === 'eng' && l.tier === 1)!
    const rng = new Rng('distribution')
    let home = 0
    let draw = 0
    let away = 0
    let goals = 0
    const n = 2000

    for (let i = 0; i < n; i++) {
      const [a, b] = rng.sample(league.clubIds, 2)
      const result = simulateMatch(
        world, world.clubs[a], world.clubs[b], rng, { suspendedIds: new Set() }, false,
      )
      if (result.homeGoals > result.awayGoals) home++
      else if (result.homeGoals === result.awayGoals) draw++
      else away++
      goals += result.homeGoals + result.awayGoals
    }

    // Real-world league football sits near 45/25/30 with 2.7 goals a game.
    expect(home / n).toBeGreaterThan(0.38)
    expect(home / n).toBeLessThan(0.52)
    expect(draw / n).toBeGreaterThan(0.15)
    expect(draw / n).toBeLessThan(0.32)
    expect(goals / n).toBeGreaterThan(2.2)
    expect(goals / n).toBeLessThan(3.2)
    // Home advantage must actually exist.
    expect(home).toBeGreaterThan(away)
  })

  it('holds those distributions at the bottom of the pyramid too', () => {
    // A regression guard for the bug where chance volume scaled with team
    // quality and the fifth tier averaged 0.66 goals a game.
    const league = Object.values(world.leagues).find((l) => l.nationId === 'eng' && l.tier === 5)!
    const rng = new Rng('lowdistribution')
    let goals = 0
    let draws = 0
    const n = 1500
    for (let i = 0; i < n; i++) {
      const [a, b] = rng.sample(league.clubIds, 2)
      const result = simulateMatch(
        world, world.clubs[a], world.clubs[b], rng, { suspendedIds: new Set() }, false,
      )
      goals += result.homeGoals + result.awayGoals
      if (result.homeGoals === result.awayGoals) draws++
    }
    expect(goals / n).toBeGreaterThan(2.2)
    expect(draws / n).toBeLessThan(0.32)
  })

  it('lets the better side win more often than not', () => {
    const league = Object.values(world.leagues).find((l) => l.nationId === 'eng' && l.tier === 1)!
    const clubs = league.clubIds.map((id) => world.clubs[id]).sort((a, b) => b.reputation - a.reputation)
    const best = clubs[0]
    const worst = clubs[clubs.length - 1]
    const rng = new Rng('mismatch')

    let bestWins = 0
    for (let i = 0; i < 400; i++) {
      const result = simulateMatch(world, best, worst, rng, { suspendedIds: new Set() }, false)
      if (result.homeGoals > result.awayGoals) bestWins++
    }
    expect(bestWins / 400).toBeGreaterThan(0.5)
  })

  it('fields eleven players with a goalkeeper', () => {
    const rng = new Rng('selection')
    for (const club of Object.values(world.clubs).slice(0, 40)) {
      const team = selectTeam(world, club, rng)
      expect(team.starters.length).toBe(11)
      expect(team.starters.filter((s) => s.position === 'GK').length).toBe(1)
      const ids = new Set(team.starters.map((s) => s.playerId))
      expect(ids.size, 'the same player was selected twice').toBe(11)
      for (const benched of team.bench) {
        expect(ids.has(benched), 'a starter is also on the bench').toBe(false)
      }
    }
  })

  it('never selects an injured or suspended player', () => {
    const rng = new Rng('availability')
    const club = Object.values(world.clubs)[0]
    const squad = club.squad.map((id) => world.players[id]).filter((p) => p && !p.isAcademy)
    squad[0].injury = { type: 'Test', weeksRemaining: 4, severity: 'moderate', lingeringEffect: 0 }
    squad[1].suspendedWeeks = 2

    const team = selectTeam(world, club, rng)
    const selected = new Set(team.starters.map((s) => s.playerId))
    expect(selected.has(squad[0].id)).toBe(false)
    expect(selected.has(squad[1].id)).toBe(false)

    squad[0].injury = null
    squad[1].suspendedWeeks = 0
  })

  it('records events that are consistent with the scoreline', () => {
    const rng = new Rng('events')
    const clubs = Object.values(world.clubs)
    for (let i = 0; i < 60; i++) {
      const result = simulateMatch(
        world, clubs[i * 2], clubs[i * 2 + 1], rng, { suspendedIds: new Set() }, true,
      )
      const goalEvents = result.events.filter(
        (e) => e.type === 'goal' || e.type === 'penaltyScored',
      )
      expect(goalEvents.length).toBe(result.homeGoals + result.awayGoals)
      for (const event of result.events) {
        expect(event.minute).toBeGreaterThanOrEqual(1)
        expect(event.minute).toBeLessThanOrEqual(90)
      }
      // Events must arrive in order, or the timeline reads as nonsense.
      const minutes = result.events.map((e) => e.minute)
      expect(minutes).toEqual(minutes.slice().sort((a, b) => a - b))
      // Nobody is booked twice without being sent off.
      const booked = new Map<string, number>()
      for (const e of result.events.filter((x) => x.type === 'yellowCard')) {
        booked.set(e.playerId, (booked.get(e.playerId) ?? 0) + 1)
      }
      for (const [playerId, count] of booked) {
        if (count > 1) {
          const sentOff = result.events.some(
            (e) => e.type === 'redCard' && e.playerId === playerId,
          )
          expect(sentOff, 'a player was booked twice and stayed on').toBe(true)
        }
      }
    }
  })

  it('rates every player who started', () => {
    const rng = new Rng('ratings')
    const clubs = Object.values(world.clubs)
    const result = simulateMatch(
      world, clubs[0], clubs[1], rng, { suspendedIds: new Set() }, true,
    )
    for (const id of [...result.homeLineup, ...result.awayLineup]) {
      expect(result.ratings[id]).toBeDefined()
      expect(result.ratings[id]).toBeGreaterThanOrEqual(2)
      expect(result.ratings[id]).toBeLessThanOrEqual(10)
    }
  })
})

describe('season simulation', () => {
  it('runs a full season without corrupting state', () => {
    const setup = prepareNewGame({
      seed: 'SEASONTEST', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    const deps = { ids: setup.ids, names: setup.names }

    const startingClubs = Object.keys(state.clubs).length
    const leagueSizes = new Map(
      Object.values(state.leagues).map((l) => [l.id, l.clubIds.length]),
    )

    for (let week = 0; week < 52; week++) advanceWeek(state, deps)

    // Divisions keep their size through promotion and relegation.
    expect(Object.keys(state.clubs).length).toBe(startingClubs)
    for (const league of Object.values(state.leagues)) {
      expect(league.clubIds.length, `${league.name} changed size`).toBe(leagueSizes.get(league.id))
    }

    // No club appears in two divisions.
    const placed = new Set<string>()
    for (const league of Object.values(state.leagues)) {
      for (const clubId of league.clubIds) {
        expect(placed.has(clubId), `${clubId} is in two divisions`).toBe(false)
        placed.add(clubId)
        expect(state.clubs[clubId].leagueId).toBe(league.id)
      }
    }

    // Every squad reference still resolves after a year of transfers,
    // retirements and released youth.
    for (const club of Object.values(state.clubs)) {
      for (const id of club.squad) {
        expect(state.players[id], `${club.name} references missing player`).toBeDefined()
        expect(state.players[id].clubId).toBe(club.id)
      }
    }

    // And no player is contracted to a club that does not list him.
    for (const player of Object.values(state.players)) {
      if (!player.clubId) continue
      const club = state.clubs[player.clubId]
      expect(club, `${player.knownAs} points at a missing club`).toBeDefined()
      expect(club.squad.includes(player.id), `${player.knownAs} is not in his club's squad`).toBe(true)
    }

    // Fifty-two ticks is exactly one season, so the calendar must have rolled
    // over precisely once.
    expect(state.date.season).toBe(2026)
    expect(state.date.week).toBe(1)
  })

  it('produces a league table that adds up', () => {
    const setup = prepareNewGame({
      seed: 'TABLETEST', directorName: 'T', background: 'analyst',
      worldSize: 'compact', homeNationId: 'eng',
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 30; week++) advanceWeek(state, deps)

    for (const league of Object.values(state.leagues)) {
      const table = sortTable(state.tables[league.id])
      let totalFor = 0
      let totalAgainst = 0
      for (const row of table) {
        expect(row.played).toBe(row.won + row.drawn + row.lost)
        expect(row.points).toBe(row.won * 3 + row.drawn)
        expect(row.form.length).toBeLessThanOrEqual(6)
        totalFor += row.goalsFor
        totalAgainst += row.goalsAgainst
      }
      // Every goal scored is a goal conceded by somebody.
      expect(totalFor).toBe(totalAgainst)
    }
  })

  it('keeps the player club solvent enough to be playable', () => {
    const setup = prepareNewGame({
      seed: 'SOLVENCY', directorName: 'T', background: 'financier',
      worldSize: 'compact', homeNationId: 'eng',
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 40; week++) advanceWeek(state, deps)

    const club = state.clubs[state.playerClubId]
    // Doing nothing should not bankrupt a club inside one season — the game
    // has to be survivable for a player who is still learning it.
    expect(club.finances.balance).toBeGreaterThanOrEqual(0)
    expect(totalWageBill(state, club)).toBeGreaterThan(0)
    const seniors = club.squad.map((id) => state.players[id]).filter((p) => p && !p.isAcademy)
    expect(seniors.length, 'squad shrank below a fieldable eleven').toBeGreaterThanOrEqual(11)
  })
})

describe('cup competitions', () => {
  it('converges from an odd field to a single winner', () => {
    const setup = prepareNewGame({
      seed: 'CUPTEST', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    const deps = { ids: setup.ids, names: setup.names }
    const cup = Object.values(state.cups).find((c) => c.nationId === 'eng')!
    const entrants = cup.entrantIds.length

    // A 114-club field is deliberately not a power of two: the bye maths has
    // to bring it to one after the first round, not before it.
    expect(entrants).toBeGreaterThan(64)
    expect(Math.log2(entrants) % 1).not.toBe(0)

    for (let week = 0; week < 46; week++) advanceWeek(state, deps)

    expect(cup.winnerId, 'the cup produced no winner').toBeTruthy()
    expect(state.clubs[cup.winnerId!]).toBeDefined()

    // Each round must exactly halve the field.
    const sizes = cup.rounds.map((r) => r.fixtureIds.length)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `round ${i} did not halve the field`).toBe(sizes[i - 1] === 50 ? 32 : sizes[i - 1] / 2)
    }
    expect(sizes[sizes.length - 1], 'the final was not a single tie').toBe(1)
  })

  it('never leaves a knockout tie drawn', () => {
    const setup = prepareNewGame({
      seed: 'KNOCKOUT', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, setup.candidates[0].id)
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 46; week++) advanceWeek(state, deps)

    const cupFixtures = state.fixtures.filter(
      (f) => f.competitionType === 'cup' && f.result,
    )
    expect(cupFixtures.length).toBeGreaterThan(0)
    for (const fixture of cupFixtures) {
      const r = fixture.result!
      const decided = r.homeGoals !== r.awayGoals || Boolean(r.penalties)
      expect(decided, `a cup tie finished level with no shootout`).toBe(true)
    }
  })
})
