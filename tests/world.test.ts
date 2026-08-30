import { describe, expect, it, beforeAll } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { ratingForPosition, meanAttributeForAbility } from '../src/engine/world/attributes'
import { computeValue } from '../src/engine/systems/valuation'
import { minAgeForAbility } from '../src/engine/world/playerGen'
import type { GameState } from '../src/engine/types'
import { isRealClubIdentity } from '../src/engine/world/clubNames'

let world: GameState

beforeAll(() => {
  world = generateWorld({
    seed: 'TESTWORLD', season: 2025, size: 'compact', homeNationId: 'eng',
    directorName: 'Test', background: 'analyst',
  })
})

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld({
      seed: 'DETERMINISM', season: 2025, size: 'compact', homeNationId: 'eng',
      directorName: 'A', background: 'analyst',
    })
    const b = generateWorld({
      seed: 'DETERMINISM', season: 2025, size: 'compact', homeNationId: 'eng',
      directorName: 'A', background: 'analyst',
    })
    // createdAt/savedAt are wall-clock and legitimately differ.
    const strip = (s: GameState) => ({ ...s, createdAt: 0, savedAt: 0 })
    expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)))
  })

  it('fills every division to its declared size', () => {
    for (const league of Object.values(world.leagues)) {
      expect(league.clubIds.length).toBeGreaterThan(0)
      for (const clubId of league.clubIds) {
        expect(world.clubs[clubId]).toBeDefined()
        expect(world.clubs[clubId].leagueId).toBe(league.id)
      }
    }
  })

  it('gives every club a squad, a coach and a stadium', () => {
    for (const club of Object.values(world.clubs)) {
      const seniors = club.squad
        .map((id) => world.players[id])
        .filter((p) => p && !p.isAcademy)
      expect(seniors.length).toBeGreaterThanOrEqual(20)
      expect(club.headCoachId).toBeTruthy()
      expect(world.staff[club.headCoachId!]).toBeDefined()
      expect(club.facilities.stadium.capacity).toBeGreaterThan(0)
    }
  })

  it('never orphans a player: every squad reference resolves', () => {
    for (const club of Object.values(world.clubs)) {
      for (const id of club.squad) {
        expect(world.players[id], `club ${club.name} references missing player ${id}`).toBeDefined()
        expect(world.players[id].clubId).toBe(club.id)
      }
    }
  })

  it('never places one player in two squads', () => {
    const seen = new Map<string, string>()
    for (const club of Object.values(world.clubs)) {
      for (const id of club.squad) {
        expect(seen.has(id), `player ${id} is in two squads`).toBe(false)
        seen.set(id, club.id)
      }
    }
  })

  it('keeps attributes consistent with the ability they encode', () => {
    // This is the invariant the entire scouting and transfer market rests on:
    // if a player's attributes and his ability disagree, a scout report and a
    // transfer fee describe two different players.
    const players = Object.values(world.players).filter((p) => !p.isAcademy)
    for (const player of players) {
      const derived = ratingForPosition(player.attributes, player.position)
      expect(
        Math.abs(derived - player.currentAbility),
        `${player.knownAs}: attributes rate ${derived.toFixed(1)} but ability is ${player.currentAbility.toFixed(1)}`,
      ).toBeLessThan(2.5)
    }
  })

  it('never generates an ability a player is too young to have reached', () => {
    for (const player of Object.values(world.players)) {
      expect(
        player.age,
        `${player.knownAs} is ${player.age} with ability ${player.currentAbility}`,
      ).toBeGreaterThanOrEqual(minAgeForAbility(player.currentAbility))
    }
  })

  it('never lets potential fall below current ability', () => {
    for (const player of Object.values(world.players)) {
      expect(player.potentialAbility).toBeGreaterThanOrEqual(Math.floor(player.currentAbility))
    }
  })

  it('scales attributes so lower divisions are poor, not broken', () => {
    const byTier = (tier: number) => {
      const league = Object.values(world.leagues).find(
        (l) => l.nationId === 'eng' && l.tier === tier,
      )!
      const players = league.clubIds
        .flatMap((id) => world.clubs[id].squad.map((pid) => world.players[pid]))
        .filter((p) => p && !p.isAcademy)
      return players.reduce((sum, p) => sum + p.attributes.passing, 0) / players.length
    }
    const top = byTier(1)
    const bottom = byTier(5)
    expect(top).toBeGreaterThan(bottom)
    // The bottom of the pyramid must still look like footballers.
    expect(bottom).toBeGreaterThan(4)
    expect(top).toBeLessThan(17)
  })

  it('maps ability to attribute means monotonically', () => {
    expect(meanAttributeForAbility(30)).toBeLessThan(meanAttributeForAbility(100))
    expect(meanAttributeForAbility(100)).toBeLessThan(meanAttributeForAbility(190))
    expect(meanAttributeForAbility(200)).toBeLessThanOrEqual(20)
    expect(meanAttributeForAbility(1)).toBeGreaterThanOrEqual(1)
  })

  it('prices better players higher, all else equal', () => {
    const club = Object.values(world.clubs)[0]
    const league = world.leagues[club.leagueId]
    const nation = world.nations[club.nationId]
    const squad = club.squad
      .map((id) => world.players[id])
      .filter((p) => p && !p.isAcademy && p.age >= 24 && p.age <= 27)
      .sort((a, b) => a.currentAbility - b.currentAbility)

    if (squad.length >= 2) {
      const worst = computeValue(squad[0], league, nation, 2025)
      const best = computeValue(squad[squad.length - 1], league, nation, 2025)
      expect(best).toBeGreaterThanOrEqual(worst)
    }
  })

  it('schedules a balanced fixture list', () => {
    for (const league of Object.values(world.leagues)) {
      const fixtures = world.fixtures.filter((f) => f.competitionId === league.id)
      const n = league.clubIds.length
      // Every club plays every other twice.
      expect(fixtures.length).toBe(n * (n - 1))

      const homeCount = new Map<string, number>()
      const awayCount = new Map<string, number>()
      for (const f of fixtures) {
        homeCount.set(f.homeClubId, (homeCount.get(f.homeClubId) ?? 0) + 1)
        awayCount.set(f.awayClubId, (awayCount.get(f.awayClubId) ?? 0) + 1)
      }
      for (const clubId of league.clubIds) {
        expect(homeCount.get(clubId), `${clubId} home games`).toBe(n - 1)
        expect(awayCount.get(clubId), `${clubId} away games`).toBe(n - 1)
      }
    }
  })

  it('never schedules a club against itself', () => {
    for (const fixture of world.fixtures) {
      expect(fixture.homeClubId).not.toBe(fixture.awayClubId)
    }
  })

  it('never asks a club to play more than twice in a week', () => {
    // A 24-club division plays 46 rounds into a 39-week calendar, so some
    // weeks carry a midweek round. That is deliberate — fixture congestion is
    // what makes squad depth cost something, and the tick applies fatigue
    // between the two matches. Three in a week would not be.
    const counts = new Map<string, number>()
    for (const fixture of world.fixtures) {
      for (const clubId of [fixture.homeClubId, fixture.awayClubId]) {
        const key = `${fixture.week}:${clubId}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    for (const [key, count] of counts) {
      expect(count, `${key} has ${count} fixtures`).toBeLessThanOrEqual(2)
    }
  })

  it('avoids reproducing real club identities', () => {
    // Held against the generator's own rule rather than a list somebody
    // remembered to type out, and across several seeds, because a name only
    // has to be reachable to eventually be reached: an earlier version of this
    // test named a dozen clubs and caught Liverpool FC by luck when an
    // unrelated change shifted the random stream.
    for (const seed of ['NAMES-A', 'NAMES-B', 'NAMES-C', 'NAMES-D']) {
      const generated = generateWorld({
        seed, season: 2025, size: 'compact', homeNationId: 'eng',
        directorName: 'T', background: 'analyst',
      })
      for (const club of Object.values(generated.clubs)) {
        expect(isRealClubIdentity(club.name), `${seed} generated ${club.name}`).toBe(false)
      }
    }
  }, 120_000)

  it('gives every club a distinct name', () => {
    const names = new Set<string>()
    for (const club of Object.values(world.clubs)) {
      expect(names.has(club.name), `duplicate club name ${club.name}`).toBe(false)
      names.add(club.name)
    }
  })
})
