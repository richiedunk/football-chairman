import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { Rng } from '../src/engine/rng'
import {
  CALL_UP_WEEKS, INTERNATIONAL_WEEKS, TOURNAMENT_STOCK_DECAY, TOURNAMENT_WEEK, awayCount,
  DUTY_INJURY_CHANCE, NATIONAL_SQUAD, callUpsFor, capsPremium, clubsAffected, dutyInjury,
  dutyInjuryChance, dutyTravel, isAwayOnDuty, isInternational, isTournamentSeason,
  nationalSquads, runTournament, sendOnDuty,
} from '../src/engine/systems/international'
import { computeValue, computeWageDemand } from '../src/engine/systems/valuation'
import { isAvailable } from '../src/engine/sim/selection'
import { FIRST_MATCH_WEEK, LAST_MATCH_WEEK } from '../src/engine/sim/schedule'
import type { Club, GameState, Player } from '../src/engine/types'

let state: GameState
let club: Club

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'INTLTEST', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
}, 180_000)

describe('the calendar', () => {
  it('takes players away during the season, not after it', () => {
    for (const week of INTERNATIONAL_WEEKS) {
      expect(week).toBeGreaterThanOrEqual(FIRST_MATCH_WEEK)
      expect(week).toBeLessThanOrEqual(LAST_MATCH_WEEK)
    }
  })

  it('leaves the run-in alone', () => {
    // A director can plan around a break. He cannot plan around losing three
    // players in the last fortnight of a promotion race, and being made to is
    // a cruelty with no decision attached to it.
    expect(Math.max(...INTERNATIONAL_WEEKS)).toBeLessThan(LAST_MATCH_WEEK - 4)
  })

  it('holds the tournament in the summer, where nothing else is happening', () => {
    expect(TOURNAMENT_WEEK).toBeGreaterThan(LAST_MATCH_WEEK)
  })

  it('runs a tournament every other year', () => {
    const seasons = [2025, 2026, 2027, 2028].filter(isTournamentSeason)
    expect(seasons).toEqual([2026, 2028])
  })
})

describe('who gets picked', () => {
  it('gives every nation a squad, however weak the nation', () => {
    // The bug this replaced: an ability bar scaled to the nation's league
    // standing made one per cent of the Scottish top flight international and
    // thirty-five per cent of Spain's. A weak nation does not stop picking a
    // side — it picks the best it has.
    const squads = nationalSquads(state)
    expect(squads.size).toBeGreaterThan(4)
    for (const [nationId, squad] of squads) {
      expect(squad.length).toBeLessThanOrEqual(NATIONAL_SQUAD)
      // Ordered best first, because that is what a manager does.
      for (let i = 1; i < squad.length; i++) {
        expect(squad[i - 1].currentAbility).toBeGreaterThanOrEqual(squad[i].currentAbility)
      }
      for (const p of squad) expect(p.nationalityId).toBe(nationId)
    }
  })

  it('picks the best of a country, not the best in the world', () => {
    const squads = nationalSquads(state)
    // Every nation with professionals in it fields somebody, so a small
    // country's squad player is away as often as a big one's — which is the
    // whole recruitment consequence.
    const sizes = [...squads.values()].map((s) => s.length)
    expect(Math.min(...sizes)).toBeGreaterThan(0)

    // Read off one build of the map rather than asking per player: the
    // convenience form rebuilds every squad in the world each time it is
    // called, which is fine for a profile screen and quadratic for a sweep.
    const picked = new Set([...squads.values()].flat().map((p) => p.id))
    const all = Object.values(state.players).filter((p) => p.clubId && !p.isAcademy)
    const internationals = all.filter((p) => picked.has(p.id))
    // A fixed squad per nation means the share is set by how many nations
    // there are, not by a bar — and it stays a minority of professionals.
    expect(internationals.length).toBeGreaterThan(0)
    expect(internationals.length / all.length).toBeLessThan(0.3)
  })

  it('does not call up a player who is already hurt', () => {
    const rng = new Rng('callups')
    const victim = Object.values(state.players).find((p) => isInternational(state, p) && p.clubId)!
    const before = victim.injury
    victim.injury = dutyInjury(new Rng('hurt'), false)
    const called = callUpsFor(state, rng).map((c) => c.player.id)
    expect(called).not.toContain(victim.id)
    victim.injury = before
  })

  it('takes a loanee from the club borrowing him, not the one that owns him', () => {
    // The real rule and the more interesting one: a young international on
    // loan is exactly the player who disappears every break, and the club
    // planning around it never chose him.
    const parent = Object.values(state.clubs)[0]
    const host = Object.values(state.clubs)[1]
    const player = Object.values(state.players).find(
      (p) => p.clubId === parent.id && !p.loanClubId && !p.isAcademy && p.age >= 18
        && !p.injury && p.suspendedWeeks === 0,
    )!
    const originalClub = player.clubId
    player.loanClubId = host.id
    host.loanedIn.push(player.id)
    player.currentAbility = 200

    // Seeded so he is picked: at 200 the only thing that can leave him out is
    // the roll, and a test that passes when he is not called tests nothing.
    const called = callUpsFor(state, new Rng('loanees2'))
    expect(called.map((c) => c.player.id)).toContain(player.id)

    const byClub = clubsAffected(called)
    expect(byClub.get(host.id)?.map((p) => p.id)).toContain(player.id)
    expect(byClub.get(parent.id)?.map((p) => p.id) ?? []).not.toContain(player.id)

    sendOnDuty(player, 9, false)
    expect(awayCount(state, host, 9)).toBeGreaterThan(0)
    // Not a loss to the club that owns him: he was never available to it.
    expect(awayCount(state, parent, 9)).toBe(0)
    player.internationalUntilWeek = null
    player.caps = 0

    player.loanClubId = null
    host.loanedIn = host.loanedIn.filter((id) => id !== player.id)
    player.clubId = originalClub
  })
})

describe('being away', () => {
  it('makes a player unpickable for the week and pickable after it', () => {
    const player = Object.values(state.players).find(
      (p) => p.clubId === club.id && !p.injury && p.suspendedWeeks === 0 && !p.loanClubId,
    )!
    const ctx = { suspendedIds: new Set<string>(), week: 10 }
    expect(isAvailable(player, club.id, ctx)).toBe(true)

    sendOnDuty(player, 10, false)
    expect(isAwayOnDuty(player, 10)).toBe(true)
    expect(isAvailable(player, club.id, ctx)).toBe(false)

    expect(isAwayOnDuty(player, 10 + CALL_UP_WEEKS)).toBe(false)
    expect(isAvailable(player, club.id, { ...ctx, week: 10 + CALL_UP_WEEKS })).toBe(true)

    player.internationalUntilWeek = null
    player.caps = 0
  })

  it('counts the ones a director actually feels — his own', () => {
    const ours = club.squad.map((id) => state.players[id]).filter(Boolean).slice(0, 3)
    for (const p of ours) sendOnDuty(p, 20, false)
    expect(awayCount(state, club, 20)).toBe(ours.length)
    expect(awayCount(state, club, 21)).toBe(0)
    for (const p of ours) { p.internationalUntilWeek = null; p.caps = 0 }
  })

  it('groups a week of call-ups by the clubs that lose them', () => {
    const called = callUpsFor(state, new Rng('grouping'))
    const byClub = clubsAffected(called)
    let total = 0
    for (const [clubId, players] of byClub) {
      expect(state.clubs[clubId]).toBeTruthy()
      total += players.length
    }
    expect(total).toBe(called.length)
  })
})

describe('what a cap is worth', () => {
  it('costs nothing until he has one', () => {
    expect(capsPremium(0)).toBe(1)
  })

  it('rises with caps and then stops mattering', () => {
    expect(capsPremium(10)).toBeGreaterThan(capsPremium(1))
    expect(capsPremium(50)).toBeGreaterThan(capsPremium(10))
    // Ten more caps at the start of a career move the price enormously; ten
    // more at the end barely move it, because by then he is priced on being
    // an international rather than on the count.
    const early = capsPremium(11) - capsPremium(1)
    const late = capsPremium(90) - capsPremium(80)
    expect(late).toBeLessThan(early / 10)
  })

  it('moves the price and the wage together, which is what makes him expensive to keep', () => {
    const player = { ...Object.values(state.players).find((p) => p.clubId === club.id)! }
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]

    player.caps = 0
    player.tournamentStock = 0
    const bareValue = computeValue(player, league, nation, state.date.season)
    const bareWage = computeWageDemand(player, league, nation)

    player.caps = 40
    expect(computeValue(player, league, nation, state.date.season)).toBeGreaterThan(bareValue)
    expect(computeWageDemand(player, league, nation)).toBeGreaterThan(bareWage)
  })
})

describe('a tournament summer', () => {
  it('reprices some of the players who went, and not all of them', () => {
    const before = new Map(Object.values(state.players).map((p) => [p.id, p.tournamentStock ?? 0]))
    const results = runTournament(state, new Rng('summer'))
    expect(results.length).toBeGreaterThan(0)

    const called = Object.values(state.players).filter((p) => isAwayOnDuty(p, TOURNAMENT_WEEK))
    // Going is common, having the summer that gets you noticed is not: most
    // players come back exactly as valuable as they left.
    expect(results.length).toBeLessThan(called.length * 0.35)
    expect(results.length).toBeGreaterThan(called.length * 0.05)
    for (const { player, boost } of results) {
      expect(boost).toBeGreaterThan(0)
      expect(player.tournamentStock).toBeGreaterThan(before.get(player.id)!)
    }

    for (const p of Object.values(state.players)) {
      p.tournamentStock = before.get(p.id) ?? 0
      p.internationalUntilWeek = null
    }
  })

  it('fades, which is why the window to sell is a real window', () => {
    // Two summers on, a premium nobody cashed in is most of the way gone.
    const stock = 0.2
    const afterOne = stock * TOURNAMENT_STOCK_DECAY
    const afterTwo = afterOne * TOURNAMENT_STOCK_DECAY
    expect(afterOne).toBeLessThan(stock)
    expect(afterTwo).toBeLessThan(stock * 0.35)
  })

  it('is a price the market pays, not an ability the player gained', () => {
    const player = { ...Object.values(state.players).find((p) => p.clubId === club.id)! }
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]
    const ability = player.currentAbility

    player.tournamentStock = 0
    const before = computeValue(player, league, nation, state.date.season)
    player.tournamentStock = 0.2
    const after = computeValue(player, league, nation, state.date.season)

    expect(after).toBeGreaterThan(before)
    expect(player.currentAbility).toBe(ability)
  })
})

describe('injury on somebody else’s pitch', () => {
  it('is a whole injury, not a number of weeks', () => {
    const injury = dutyInjury(new Rng('duty'), false)
    expect(injury.weeksRemaining).toBeGreaterThan(0)
    expect(['knock', 'minor', 'moderate', 'serious', 'severe']).toContain(injury.severity)
    expect(injury.lingeringEffect).toBeGreaterThanOrEqual(0)
  })

  it('describes itself so nobody has to guess where it happened', () => {
    expect(dutyInjury(new Rng('duty2'), false).type).toMatch(/international/i)
  })

  it('costs more when it happens at a tournament than at a friendly', () => {
    const friendly: number[] = []
    const tournament: number[] = []
    for (let i = 0; i < 200; i++) {
      friendly.push(dutyInjury(new Rng(`f${i}`), false).weeksRemaining)
      tournament.push(dutyInjury(new Rng(`t${i}`), true).weeksRemaining)
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(tournament)).toBeGreaterThan(mean(friendly))
  })

  it('is likelier the further he had to go', () => {
    // The complaint was never about the football, it was about the flight.
    const club = Object.values(state.clubs).find((c) => c.squad.length > 0)!
    const clubNation = state.nations[club.nationId]
    const player = state.players[club.squad[0]]

    player.nationalityId = clubNation.id
    expect(dutyTravel(state, player)).toBe('home')
    const home = dutyInjuryChance(state, player)

    const abroad = Object.values(state.nations).find(
      (n) => n.confederation !== clubNation.confederation,
    )
    if (abroad) {
      player.nationalityId = abroad.id
      expect(dutyTravel(state, player)).toBe('intercontinental')
      expect(dutyInjuryChance(state, player)).toBeGreaterThan(home)
    }

    const sameConfederation = Object.values(state.nations).find(
      (n) => n.id !== clubNation.id && n.confederation === clubNation.confederation,
    )
    if (sameConfederation) {
      player.nationalityId = sameConfederation.id
      expect(dutyTravel(state, player)).toBe('continental')
      expect(dutyInjuryChance(state, player)).toBeGreaterThan(home)
    }

    player.nationalityId = clubNation.id
    // Still a rare thing per trip, however far he went — a fortnight is fewer
    // minutes than a month of club football.
    expect(dutyInjuryChance(state, player)).toBeLessThan(DUTY_INJURY_CHANCE * 2)
  })

  it('has a severity that matches how long he is out', () => {
    for (let i = 0; i < 300; i++) {
      const injury = dutyInjury(new Rng(`s${i}`), true)
      if (injury.weeksRemaining <= 2) expect(injury.severity).toBe('knock')
      if (injury.weeksRemaining > 12) expect(injury.severity).toBe('serious')
    }
  })
})
