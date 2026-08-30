import { describe, expect, it, beforeAll } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { simulateMatch } from '../src/engine/sim/match'
import { isAvailable, selectableSquad, selectTeam } from '../src/engine/sim/selection'
import { Rng } from '../src/engine/rng'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { sortTable } from '../src/engine/systems/board'
import { totalWageBill } from '../src/engine/systems/valuation'
import { loserOfTie, tieAggregate } from '../src/engine/sim/cups'
import { loanSuitorsFor, proposeLoanOut } from '../src/engine/systems/loans'
import { canTakeJobAt } from '../src/engine/systems/career'
import type { NewGameSetup } from '../src/engine/newGame'

/**
 * The first club an unproven director could actually be hired by.
 *
 * `prepareNewGame` now returns the whole jobs board, most of which is locked,
 * so taking `candidates[0]` would start every test at the biggest club in the
 * country — which is not what any of them mean to test.
 */
function firstEligible(setup: NewGameSetup): string {
  const club = setup.candidates.find((c) => canTakeJobAt(setup.state.director, c))
  if (!club) throw new Error('no club would hire an unproven director')
  return club.id
}
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
    const state = startCareerAt(setup, firstEligible(setup))
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
    const state = startCareerAt(setup, firstEligible(setup))
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
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 40; week++) advanceWeek(state, deps)

    const club = state.clubs[state.playerClubId]
    // Doing nothing should not bankrupt a club inside one season — the game
    // has to be survivable for a player who is still learning it.
    expect(club.finances.balance).toBeGreaterThanOrEqual(0)
    // And it must not drift into a transfer embargo, which would block the
    // recruitment loop the whole game is built around. This caught facility
    // upkeep being a flat per-level cost, which took 58% of a non-league
    // club's revenue and put most of the lower pyramid under embargo.
    expect(club.finances.inCrisis, 'the starting club fell into crisis doing nothing').toBe(false)

    const worldInCrisis = Object.values(state.clubs).filter((c) => c.finances.inCrisis).length
    expect(
      worldInCrisis / Object.keys(state.clubs).length,
      'too much of the world is under embargo',
    ).toBeLessThan(0.1)
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
    const state = startCareerAt(setup, firstEligible(setup))
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

    // Each round must halve the field. Counted in *ties*, not fixtures — a
    // two-legged round has two fixtures per tie.
    const ties = cup.rounds.map((r) => (r.twoLegged ? r.fixtureIds.length / 2 : r.fixtureIds.length))
    for (let i = 1; i < ties.length; i++) {
      // The first round is the one that squares the field off, so it is the
      // only one whose successor is not simply half of it.
      const expected = i === 1 ? 32 : ties[i - 1] / 2
      expect(ties[i], `round ${i} did not halve the field`).toBe(expected)
    }
    expect(ties[ties.length - 1], 'the final was not a single tie').toBe(1)
  })

  it('never leaves a knockout tie drawn', () => {
    const setup = prepareNewGame({
      seed: 'KNOCKOUT', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 46; week++) advanceWeek(state, deps)

    // Single-leg ties only: a leg of a two-legged tie is allowed to finish
    // level, because the tie is settled on aggregate afterwards.
    const singleLegTies = state.fixtures.filter(
      (f) => f.competitionType === 'cup' && f.result && !f.legOf,
    )
    expect(singleLegTies.length).toBeGreaterThan(0)
    for (const fixture of singleLegTies) {
      const r = fixture.result!
      const decided = r.homeGoals !== r.awayGoals || Boolean(r.penalties)
      expect(decided, 'a single-leg cup tie finished level with no shootout').toBe(true)
    }
  })
})

describe('two-legged ties', () => {
  it('resolves semi-finals on aggregate, not per leg', () => {
    const setup = prepareNewGame({
      seed: 'TWOLEG', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    const cup = Object.values(state.cups).find((c) => c.nationId === 'eng')!

    for (let week = 0; week < 48; week++) advanceWeek(state, deps)

    const semi = cup.rounds.find((r) => r.twoLegged)
    expect(semi, 'no two-legged round was scheduled').toBeDefined()
    // Two ties, two legs each.
    expect(semi!.fixtureIds.length).toBe(4)

    const legs = semi!.fixtureIds
      .map((id) => state.fixtures.find((f) => f.id === id)!)
      .filter(Boolean)

    // Every leg carries a tie id and a leg number, and each tie has both.
    const ties = new Map<string, typeof legs>()
    for (const leg of legs) {
      expect(leg.legOf, 'a leg of a two-legged tie has no tie id').toBeDefined()
      const list = ties.get(leg.legOf!.tieId) ?? []
      list.push(leg)
      ties.set(leg.legOf!.tieId, list)
    }
    for (const [, tieLegs] of ties) {
      expect(tieLegs.length).toBe(2)
      const first = tieLegs.find((l) => l.legOf!.leg === 1)!
      const second = tieLegs.find((l) => l.legOf!.leg === 2)!
      // The venue must reverse, or the tie is not fair.
      expect(second.homeClubId).toBe(first.awayClubId)
      expect(second.awayClubId).toBe(first.homeClubId)
      // Individual legs are allowed to be drawn.
      expect(first.result).toBeDefined()
      expect(second.result).toBeDefined()
    }

    // Exactly one club per tie goes through, and the aggregate decides it.
    for (const [tieId, tieLegs] of ties) {
      const loser = loserOfTie(tieId, tieLegs)
      const agg = tieAggregate(tieLegs)!
      expect(loser).toBeTruthy()
      if (agg.goalsA > agg.goalsB) expect(loser).toBe(agg.clubB)
      else if (agg.goalsB > agg.goalsA) expect(loser).toBe(agg.clubA)
      else expect([agg.clubA, agg.clubB]).toContain(loser)
    }

    expect(cup.winnerId, 'the cup still produced a winner').toBeTruthy()
  })

  it('settles a tie the same way every time it is asked', () => {
    // A level aggregate is decided by a shootout seeded from the tie id. If it
    // rolled fresh each call, two screens could disagree about who went
    // through.
    const setup = prepareNewGame({
      seed: 'STABLE', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    const cup = Object.values(state.cups).find((c) => c.nationId === 'eng')!
    for (let week = 0; week < 48; week++) advanceWeek(state, deps)

    const semi = cup.rounds.find((r) => r.twoLegged)!
    const legs = semi.fixtureIds.map((id) => state.fixtures.find((f) => f.id === id)!)
    const tieId = legs[0].legOf!.tieId
    const tieLegs = legs.filter((l) => l.legOf!.tieId === tieId)

    const first = loserOfTie(tieId, tieLegs)
    for (let i = 0; i < 20; i++) {
      expect(loserOfTie(tieId, tieLegs)).toBe(first)
    }
  })
})

describe('loans', () => {
  it('lets the borrowing club field a loanee and stops the parent doing so', () => {
    const setup = prepareNewGame({
      seed: 'LOANSIM', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const parent = state.clubs[state.playerClubId]
    const player = parent.squad
      .map((id) => state.players[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p) && !p.isAcademy && !p.injury)
      .sort((a, b) => a.currentAbility - b.currentAbility)[0]

    const suitors = loanSuitorsFor(state, player)
    expect(suitors.length, 'nobody would take a loanee').toBeGreaterThan(0)

    // Cover the whole wage so the loan is as attractive as it can be.
    const result = proposeLoanOut(
      state, { rng: new Rng('loan'), ids: setup.ids },
      player.id, suitors[0].club.id, 1, 1,
    )
    expect(result.ok, result.message).toBe(true)

    const borrower = suitors[0].club
    expect(player.loanClubId).toBe(borrower.id)
    // Ownership does not move.
    expect(player.clubId).toBe(parent.id)
    expect(parent.squad).toContain(player.id)
    expect(borrower.loanedIn).toContain(player.id)

    // Availability does move.
    expect(isAvailable(player, borrower.id)).toBe(true)
    expect(isAvailable(player, parent.id)).toBe(false)
    expect(selectableSquad(state, borrower).map((p) => p.id)).toContain(player.id)
  })

  it('splits the wage between the two clubs', () => {
    const setup = prepareNewGame({
      seed: 'LOANWAGE', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const parent = state.clubs[state.playerClubId]
    // A fringe player: the sort a club actually loans out, and one who will
    // not refuse the move.
    const player = parent.squad
      .map((id) => state.players[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p) && !p.isAcademy && !p.injury)
      .sort((a, b) => a.currentAbility - b.currentAbility)[0]
    const wage = player.contract!.wage

    const parentBillBefore = totalWageBill(state, parent)
    const suitors = loanSuitorsFor(state, player)
    expect(suitors.length).toBeGreaterThan(0)
    const borrower = suitors[0].club
    const borrowerBillBefore = totalWageBill(state, borrower)

    // Whether a given club says yes is a die roll; the wage split is not, and
    // that is what this test is about. Retry until the loan lands rather than
    // depending on one seeded roll — which made the test fail the moment an
    // unrelated change shifted the world's RNG stream.
    let outcome = { ok: false, message: 'not attempted' }
    for (let attempt = 0; attempt < 40 && !outcome.ok; attempt++) {
      outcome = proposeLoanOut(
        state, { rng: new Rng(`w${attempt}`), ids: setup.ids }, player.id, borrower.id, 0.6, 1,
      )
    }
    expect(outcome.ok, outcome.message).toBe(true)

    // The parent keeps 60%, the borrower picks up 40%. Neither pays it twice.
    expect(totalWageBill(state, parent)).toBeCloseTo(parentBillBefore - wage * 0.4, 0)
    expect(totalWageBill(state, borrower)).toBeCloseTo(borrowerBillBefore + wage * 0.4, 0)
  })

  it('returns loanees at the end of the season', () => {
    const setup = prepareNewGame({
      seed: 'LOANEND', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 52; week++) advanceWeek(state, deps)

    // After the roll, nobody should still be sitting in a loanedIn list on an
    // expired loan — that is how a borrowed player ends up on a team sheet for
    // ever.
    for (const club of Object.values(state.clubs)) {
      for (const id of club.loanedIn) {
        const player = state.players[id]
        expect(player, `${club.name} holds a missing loanee`).toBeDefined()
        expect(player.loanClubId, `${player.knownAs} is listed as borrowed but has no loan`).toBe(club.id)
      }
    }
    // And no player claims a loan the borrower does not know about.
    for (const player of Object.values(state.players)) {
      if (!player.loanClubId) continue
      const borrower = state.clubs[player.loanClubId]
      expect(borrower?.loanedIn, `${player.knownAs}'s loan is one-sided`).toContain(player.id)
    }
  })

  it('lets AI clubs be injured in matches, not just the player\'s', () => {
    // Match injuries reach a squad by replaying the events a match recorded,
    // and for a long time only the player's own matches recorded any — so the
    // player was the only club in the world whose players could be hurt in a
    // game. Over a season that came to exactly twice the injuries of every AI
    // club, an invisible handicap nobody chose.
    //
    // Asserting on the mechanism rather than on a ratio: one club against two
    // hundred is a small integer against an average, and swings enough between
    // seeds to make a ratio test flaky. Under the bug this count is exactly
    // nought, which nothing else in the model can produce.
    const setup = prepareNewGame({
      seed: 'INJURYFAIR', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 20; week++) advanceWeek(state, deps)

    // Counting distinct clubs, not players, and demanding a majority. A few
    // AI matches are simulated in full anyway — the ones involving a player on
    // your shortlist — so "at least one" was satisfied under the bug too.
    // Measured, the two behaviours are 194 of 237 clubs against 1.
    const aiClubs = Object.values(state.clubs).filter((c) => c.id !== state.playerClubId)
    const hurt = aiClubs.filter((club) =>
      club.squad.some((id) => state.players[id]?.injury?.type === 'Match injury'),
    ).length
    expect(hurt, `only ${hurt} of ${aiClubs.length} AI clubs have a match injury`)
      .toBeGreaterThan(aiClubs.length / 4)
  })

  it('leaves clubs with a believable number of players unavailable', () => {
    // Around two to three out of a senior squad is what a real club carries.
    // Nought would make squad depth pointless; six would make it the game.
    const setup = prepareNewGame({
      seed: 'INJURYLOAD', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 30; week++) advanceWeek(state, deps)

    const out = Object.values(state.clubs).map(
      (c) => c.squad.filter((id) => state.players[id]?.injury).length,
    )
    const average = out.reduce((a, b) => a + b, 0) / out.length
    // The floor is 1.8 rather than 1: when match injuries reached only the
    // player's club the world sat at 1.0-1.2, and a bound that passes on that
    // is not a bound.
    expect(average, `clubs are missing ${average.toFixed(2)} players`).toBeGreaterThan(1.8)
    expect(average, `clubs are missing ${average.toFixed(2)} players`).toBeLessThan(4)
  })

  it('generates loan activity across the world', () => {
    const setup = prepareNewGame({
      seed: 'LOANWORLD', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, firstEligible(setup))
    const deps = { ids: setup.ids, names: setup.names }
    for (let week = 0; week < 10; week++) advanceWeek(state, deps)

    const loans = state.completedTransfers.filter((t) => t.kind === 'loan')
    expect(loans.length, 'the AI never loans anyone out').toBeGreaterThan(0)
  })
})
