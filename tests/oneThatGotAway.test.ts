import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { Rng } from '../src/engine/rng'
import {
  boardRemark, gotAwayStory, hasBecomeSomebody, reportOnesThatGotAway, scoredAgainstUs, stingOf,
} from '../src/engine/systems/oneThatGotAway'
import { abilityCeilingFor } from '../src/engine/world/playerGen'
import type { Club, GameState, Player } from '../src/engine/types'

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'GOTAWAY', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}, 180_000)

function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

/** A boy this club released, now at a bigger club and better than they can buy. */
function makeGhost(state: GameState, released: Club, now: Club, seasonsAgo = 4): Player {
  const player = Object.values(state.players).find((p) => p.clubId === now.id)!
  player.academyRelease = { clubId: released.id, season: state.date.season - seasonsAgo }
  player.gotAwayReported = false
  player.currentAbility = Math.round(abilityCeilingFor(released.reputation) + 25)
  return player
}

describe('becoming somebody', () => {
  it('is judged against the club that let him go, not against football', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const bigger = Object.values(state.clubs)
      .filter((c) => c.id !== released.id)
      .sort((a, b) => b.reputation - a.reputation)[0]
    const ghost = makeGhost(state, released, bigger)
    expect(hasBecomeSomebody(state, ghost)).toBe(true)

    // The same player is not a scandal for a club that could never have kept
    // him anyway — the bar moves with who did the releasing.
    ghost.gotAwayReported = false
    ghost.academyRelease = { clubId: bigger.id, season: state.date.season - 4 }
    ghost.currentAbility = Math.round(abilityCeilingFor(bigger.reputation) - 20)
    expect(hasBecomeSomebody(state, ghost)).toBe(false)
  })

  it('waits. A boy released in June is not the one that got away in August', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const other = Object.values(state.clubs).find((c) => c.id !== released.id)!
    const ghost = makeGhost(state, released, other, 1)
    expect(hasBecomeSomebody(state, ghost)).toBe(false)
    ghost.academyRelease = { clubId: released.id, season: state.date.season - 3 }
    expect(hasBecomeSomebody(state, ghost)).toBe(true)
  })

  it('is said once and then left alone', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const other = Object.values(state.clubs)
      .filter((c) => c.id !== released.id)
      .sort((a, b) => b.reputation - a.reputation)[0]
    makeGhost(state, released, other)

    const first = reportOnesThatGotAway(state, released, { ids: { next: () => `x${Math.random()}` } as never, rng: new Rng('a') })
    expect(first.length).toBe(1)
    const second = reportOnesThatGotAway(state, released, { ids: { next: () => `y${Math.random()}` } as never, rng: new Rng('b') })
    expect(second.length).toBe(0)
  })

  it('stings more the further past them he has gone', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const big = Object.values(state.clubs)
      .filter((c) => c.id !== released.id)
      .sort((a, b) => b.reputation - a.reputation)[0]
    const ghost = makeGhost(state, released, big)

    const modest = stingOf(state, ghost)
    ghost.currentAbility = Math.round(abilityCeilingFor(released.reputation) + 70)
    expect(stingOf(state, ghost)).toBeGreaterThan(modest)
    expect(stingOf(state, ghost)).toBeLessThanOrEqual(1)
  })
})

describe('what it costs', () => {
  it('takes it out on the fans', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const other = Object.values(state.clubs)
      .filter((c) => c.id !== released.id)
      .sort((a, b) => b.reputation - a.reputation)[0]
    makeGhost(state, released, other)
    released.fanMood = 70

    reportOnesThatGotAway(state, released, { ids: { next: () => `z${Math.random()}` } as never, rng: new Rng('c') })
    expect(released.fanMood).toBeLessThan(70)
  })

  it('gives the press a story with his old club named in it', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const other = Object.values(state.clubs)
      .filter((c) => c.id !== released.id)
      .sort((a, b) => b.reputation - a.reputation)[0]
    const ghost = makeGhost(state, released, other)
    const story = gotAwayStory(
      state, released, ghost, 0.8,
      { next: () => 'story1' } as never, new Rng('d'),
    )
    expect(story).toBeTruthy()
    expect(story!.kind).toBe('oneThatGotAway')
    expect(story!.headline).toContain(released.name.toUpperCase())
    expect(story!.truth).toBe('true')
    expect(story!.subjectPlayerIds).toContain(ghost.id)
  })

  it('is recognised when he scores against them, and not when anybody else does', () => {
    const state = world()
    const released = state.clubs[state.playerClubId!]
    const other = Object.values(state.clubs).find((c) => c.id !== released.id)!
    const ghost = makeGhost(state, released, other)

    expect(scoredAgainstUs(state, released, ghost.id)?.id).toBe(ghost.id)
    const stranger = Object.values(state.players).find(
      (p) => p.id !== ghost.id && !p.academyRelease,
    )!
    expect(scoredAgainstUs(state, released, stranger.id)).toBeNull()

    // And the chairman says something that names him and the years.
    const remark = boardRemark(ghost, state)
    expect(remark).toContain(ghost.knownAs)
    expect(remark).toMatch(/year/)
  })
})
