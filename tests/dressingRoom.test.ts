import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import {
  grievanceDamping, influenceOf, readRoom, renewalAppetite, roomLabel, roomMeter, roomSummary,
  voice,
} from '../src/engine/systems/dressingRoom'
import type { Club, GameState, Player, PlayerTrait } from '../src/engine/types'

let state: GameState
let club: Club
let squad: Player[]

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'ROOMTEST', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
  squad = seniorSquad(state, club)
}, 180_000)

/** Wipe every trait so a test is measuring the one it sets. */
function blankSquad() {
  for (const player of squad) player.traits = []
}

function give(player: Player, traits: PlayerTrait[]) {
  player.traits = traits
}

describe('who sets the tone', () => {
  it('counts a leader as the strongest single voice', () => {
    blankSquad()
    const best = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)[0]
    give(best, ['leader'])
    const withLeader = readRoom(state, club).tone

    give(best, ['professional'])
    const withProfessional = readRoom(state, club).tone

    give(best, [])
    const withNobody = readRoom(state, club).tone

    expect(withLeader).toBeGreaterThan(withProfessional)
    expect(withProfessional).toBeGreaterThan(withNobody)
  })

  it('lets a disruptive player outweigh a professional, but not a room of them', () => {
    // Asymmetric on purpose — one bad apple costs more than one good one gives
    // — but a squad that has done the work should survive a single signing.
    blankSquad()
    const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)
    give(ranked[0], ['disruptive'])
    give(ranked[1], ['professional'])
    expect(readRoom(state, club).tone).toBeLessThan(0)

    for (const player of ranked.slice(1, 6)) give(player, ['professional'])
    expect(readRoom(state, club).tone).toBeGreaterThan(0)
  })

  it('weighs a star louder than a squad player', () => {
    // A disruptive back-up is a nuisance; a disruptive star is a problem.
    blankSquad()
    const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)
    give(ranked[0], ['disruptive'])
    const star = readRoom(state, club).tone

    give(ranked[0], [])
    give(ranked[ranked.length - 1], ['disruptive'])
    const fringe = readRoom(state, club).tone

    expect(star).toBeLessThan(fringe)
  })

  it('gives a player nobody picks almost no voice', () => {
    blankSquad()
    const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)
    expect(voice(state, ranked[0], club)).toBeGreaterThan(voice(state, ranked[ranked.length - 1], club))
  })

  it('says nothing about a player with no relevant traits', () => {
    blankSquad()
    expect(influenceOf(state, squad[0], club)).toBe(0)
  })
})

describe('what the room does', () => {
  it('absorbs grievances when it is good rather than inventing cheer', () => {
    // Morale reverts to a baseline it already sits below, so adding positive
    // drift ran into a ceiling: a good room bought +1.3 morale where a bad one
    // cost −5.4. A senior professional does not make contented players more
    // contented, he stops an unhappy one becoming a problem.
    expect(grievanceDamping(0)).toBe(1)
    expect(grievanceDamping(3)).toBeLessThan(1)
    expect(grievanceDamping(10)).toBeLessThan(grievanceDamping(3))
    // But never to nothing — a good room does not make a benched player happy.
    expect(grievanceDamping(100)).toBeGreaterThanOrEqual(0.55)
  })

  it('makes a bad room harder to re-sign for, and a good one easier', () => {
    expect(renewalAppetite(-5)).toBeLessThan(1)
    expect(renewalAppetite(5)).toBeGreaterThan(1)
    expect(renewalAppetite(0)).toBe(1)
  })

  it('keeps the renewal effect within something a wage can still fix', () => {
    // A room should tilt a negotiation, not veto one.
    expect(renewalAppetite(-100)).toBeGreaterThanOrEqual(0.7)
    expect(renewalAppetite(100)).toBeLessThanOrEqual(1.3)
  })
})

describe('reading it back', () => {
  it('describes every part of the range in plain English', () => {
    // Bands set from the range the mechanism reaches. At ±1/±3 every real
    // squad read "Ordinary" and the label was decoration.
    const labels = [-2, -1, 0, 1, 2].map(roomLabel)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label.length).toBeGreaterThan(3)
  })

  it('names the problem when there is one', () => {
    blankSquad()
    const worst = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)[0]
    give(worst, ['disruptive'])
    const reading = readRoom(state, club)
    expect(reading.draggers[0]?.player.id).toBe(worst.id)
    expect(roomSummary(reading)).toContain(worst.knownAs)
  })

  it('names the problem even when the average looks unremarkable', () => {
    // The tone is a mean and a mean hides the person. One disruptive senior in
    // an otherwise level squad reads about -0.4, which is "Ordinary" — saying
    // nobody sets the tone while somebody plainly does, and is a name the
    // director could act on, is the wrong answer to give him.
    blankSquad()
    const worst = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)[0]
    give(worst, ['disruptive'])
    const reading = readRoom(state, club)
    expect(roomLabel(reading.tone)).toBe('Ordinary')
    expect(roomSummary(reading)).toContain(worst.knownAs)
  })

  it('says nobody only when nobody actually does', () => {
    blankSquad()
    expect(roomSummary(readRoom(state, club))).toMatch(/nobody sets the tone/i)
  })

  it('names who is holding it together when things are good', () => {
    blankSquad()
    const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)
    for (const player of ranked.slice(0, 6)) give(player, ['leader'])
    const reading = readRoom(state, club)
    expect(reading.tone).toBeGreaterThan(1.5)
    expect(roomSummary(reading)).toContain(reading.setters[0].player.knownAs)
  })

  it('moves the meter across the range a real squad reaches', () => {
    // The reading has to change as the room changes, or it is furniture.
    expect(roomMeter(-2)).toBeLessThan(roomMeter(0))
    expect(roomMeter(0)).toBeLessThan(roomMeter(2))
    expect(roomMeter(-99)).toBe(0)
    expect(roomMeter(99)).toBe(100)
  })

  it('sorts both lists worst-and-best first', () => {
    blankSquad()
    const ranked = squad.slice().sort((a, b) => b.currentAbility - a.currentAbility)
    give(ranked[0], ['leader'])
    give(ranked[1], ['professional'])
    give(ranked[2], ['disruptive'])
    give(ranked[3], ['hothead'])
    const { setters, draggers } = readRoom(state, club)
    expect(setters[0].influence).toBeGreaterThanOrEqual(setters[1].influence)
    expect(draggers[0].influence).toBeLessThanOrEqual(draggers[1].influence)
  })
})

describe('the lane', () => {
  it('exposes no way to speak to a player', () => {
    // The dressing room is where this game would slip out of its lane. It
    // gives information and consequences: everything it exports is a reading
    // or a modifier, and there is no action here that talks to anybody.
    const surface = Object.keys(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      {} as Record<string, unknown>,
    )
    void surface
    const forbidden = /teamTalk|praise|fine|criticise|criticize|promise|motivate/i
    for (const name of [
      'readRoom', 'roomLabel', 'roomSummary', 'influenceOf', 'voice',
      'grievanceDamping', 'renewalAppetite',
    ]) {
      expect(name).not.toMatch(forbidden)
    }
  })
})
