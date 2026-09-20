import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { applySnubs, onARun, runMultiplier, runWord, snubCost, speaksUpAt } from '../src/engine/systems/snub'
import { selectTeam } from '../src/engine/sim/selection'
import { simulateMatch, quickSimulate } from '../src/engine/sim/match'
import { IdFactory } from '../src/engine/ids'
import { Rng } from '../src/engine/rng'
import type { Club, GameState, Player, SquadStatus } from '../src/engine/types'

/**
 * The player who was good enough to start and did not.
 *
 * `unluckyOmissions` was computed for every match in the world and read by
 * nothing. These tests are the guard on it staying wired: the selector says
 * who had a claim, the result carries it, and the week spends it.
 */
let state: GameState
let club: Club
let squad: Player[]

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'SNUBTEST', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
  squad = seniorSquad(state, club)
}, 180_000)

const ids = () => new IdFactory()
/** Never refuses, so a test measures the rule rather than the dice. */
const always = { chance: () => true } as unknown as Rng

function reset() {
  for (const p of squad) {
    p.snubbedRun = 0
    p.morale = 70
  }
  state.inbox = []
}

describe('what the selector already knew', () => {
  it('names somebody who had a claim and did not start', () => {
    const team = selectTeam(state, club, new Rng('sel'))
    const starters = new Set(team.starters.map((s) => s.playerId))
    for (const id of team.unluckyOmissions) {
      expect(starters.has(id), 'an omission that actually started').toBe(false)
    }
  })

  it('puts them on a detailed result, where the week can reach them', () => {
    // Asserted against the selector's own answer rather than against the
    // shape of the field. An earlier version of this test walked
    // `result.homeSnubbed ?? []`, which passes just as happily when the
    // result carries nothing at all — and it did pass with the wiring torn
    // out. The team is picked with a fresh Rng on the same seed, which is
    // what `simulateMatch` does first, so the two selections are the same one.
    const ctx = { suspendedIds: new Set<string>(), mustHaveWinner: false }
    const opponents = Object.values(state.clubs).filter((c) => c.id !== club.id)

    for (const opponent of opponents.slice(0, 12)) {
      const seed = `m:${opponent.id}`
      const expected = selectTeam(state, club, new Rng(seed), {
        suspendedIds: ctx.suspendedIds, week: state.date.week,
      }).unluckyOmissions
      if (expected.length === 0) continue

      const result = simulateMatch(state, club, opponent, new Rng(seed), ctx, true)
      expect(result.homeSnubbed, 'the selector named somebody and the result did not carry him')
        .toEqual(expected)
      for (const id of result.homeSnubbed!) expect(result.homeLineup).not.toContain(id)
      return
    }
    throw new Error('no fixture in twelve left anybody out — the test cannot prove anything')
  })

  it('leaves them off a match nobody will ever open', () => {
    const a = Object.values(state.clubs).filter((c) => c.id !== club.id)
    const result = quickSimulate(
      state, a[0], a[1], new Rng('m2'),
      { suspendedIds: new Set<string>(), mustHaveWinner: false },
    )
    expect(result.homeSnubbed).toBeUndefined()
    expect(result.awaySnubbed).toBeUndefined()
  })
})

describe('the cost of being left out', () => {
  it('costs a man morale', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'firstTeam' || x.desiredStatus === 'star')!
    const before = p.morale
    applySnubs(state, club, [], [p.id], ids(), always)
    expect(p.morale).toBeLessThan(before)
    expect(p.snubbedRun).toBe(1)
  })

  it('costs a star more than a backup', () => {
    const star = { desiredStatus: 'star' as SquadStatus } as Player
    const backup = { desiredStatus: 'backup' as SquadStatus } as Player
    expect(snubCost(star, 1)).toBeGreaterThan(snubCost(backup, 1) * 3)
  })

  it('costs a man who wants nothing nothing at all', () => {
    reset()
    const p = squad[0]
    p.desiredStatus = 'surplus'
    const before = p.morale
    applySnubs(state, club, [], [p.id], ids(), always)
    expect(p.morale).toBe(before)
  })

  it('bites harder the longer it goes on, up to a ceiling', () => {
    expect(runMultiplier(3)).toBeGreaterThan(runMultiplier(1))
    expect(runMultiplier(20)).toBe(runMultiplier(6))
  })

  it('forgets it the week he plays', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'star' || x.desiredStatus === 'firstTeam')!
    applySnubs(state, club, [], [p.id], ids(), always)
    applySnubs(state, club, [], [p.id], ids(), always)
    expect(p.snubbedRun).toBe(2)
    applySnubs(state, club, [p.id], [], ids(), always)
    expect(p.snubbedRun).toBe(0)
  })

  it('ignores a player who is not ours', () => {
    reset()
    const theirs = Object.values(state.players).find((p) => p.clubId && p.clubId !== club.id)!
    const before = theirs.morale
    applySnubs(state, club, [], [theirs.id], ids(), always)
    expect(theirs.morale).toBe(before)
    expect(theirs.snubbedRun ?? 0).toBe(0)
  })
})

describe('when he says something', () => {
  it('holds its tongue for the first two, then speaks', () => {
    expect(speaksUpAt(1)).toBe(false)
    expect(speaksUpAt(2)).toBe(false)
    expect(speaksUpAt(3)).toBe(true)
  })

  it('does not say it every week after that', () => {
    const spoke = [4, 5, 6, 7, 8, 9, 10, 11].filter(speaksUpAt)
    expect(spoke).toEqual([7, 11])
  })

  it('reaches the inbox, from the liaison, pointing at the man', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'star' || x.desiredStatus === 'firstTeam')!
    p.morale = 50
    for (let i = 0; i < 3; i++) applySnubs(state, club, [], [p.id], ids(), always)
    const item = state.inbox.find((m) => m.subject.includes(p.knownAs))
    expect(item, 'nothing in the inbox after three').toBeDefined()
    expect(item!.from).toBe('Player Liaison')
    expect(item!.link).toEqual({ view: 'player', id: p.id })
    expect(item!.decision, 'a snub is information, not man-management').toBeNull()
    expect(item!.urgent, 'it must never block the week').toBe(false)
    expect(item!.body).toContain(p.knownAs)
  })

  it('says nothing while he is still happy enough', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'star' || x.desiredStatus === 'firstTeam')!
    p.morale = 100
    for (let i = 0; i < 3; i++) applySnubs(state, club, [], [p.id], ids(), always)
    expect(state.inbox.some((m) => m.subject.includes(p.knownAs))).toBe(false)
  })

  it('counts the matches out loud once it has gone on', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'star' || x.desiredStatus === 'firstTeam')!
    p.morale = 50
    for (let i = 0; i < 7; i++) applySnubs(state, club, [], [p.id], ids(), always)
    const last = state.inbox.find((m) => m.body.includes('7'))
    expect(last, 'a seven-match run that never says seven').toBeDefined()
  })

  it('says the same thing every time it is asked the same question', () => {
    reset()
    const p = squad.find((x) => x.desiredStatus === 'star' || x.desiredStatus === 'firstTeam')!
    p.morale = 50
    for (let i = 0; i < 3; i++) applySnubs(state, club, [], [p.id], ids(), always)
    const first = state.inbox.find((m) => m.subject.includes(p.knownAs))!.body
    reset()
    p.morale = 50
    for (let i = 0; i < 3; i++) applySnubs(state, club, [], [p.id], ids(), always)
    expect(state.inbox.find((m) => m.subject.includes(p.knownAs))!.body).toBe(first)
  })
})

describe('how long he has been out, in words', () => {
  it('never answers with a figure', () => {
    // The dressing room is somebody's read, not a gauge, and the end-to-end
    // run asserts no digit appears in that column. It caught this exact
    // column the first time it was written as a number.
    for (let run = 1; run <= 20; run++) {
      expect(runWord(run), `runWord(${run})`).not.toMatch(/[0-9]/)
      expect(runWord(run).length).toBeGreaterThan(0)
    }
  })

  it('says something worse the longer it has gone on', () => {
    expect(runWord(2)).not.toBe(runWord(4))
    expect(runWord(4)).not.toBe(runWord(6))
    expect(runWord(6)).not.toBe(runWord(9))
  })
})

describe('who is on a run', () => {
  it('lists the worst first and leaves out a one-off', () => {
    reset()
    const [a, b, c] = squad.filter((p) => p.desiredStatus !== 'surplus')
    for (let i = 0; i < 4; i++) applySnubs(state, club, [], [a.id], ids(), always)
    for (let i = 0; i < 2; i++) applySnubs(state, club, [], [b.id], ids(), always)
    applySnubs(state, club, [], [c.id], ids(), always)
    const run = onARun(state, club)
    expect(run[0].id).toBe(a.id)
    expect(run.map((p) => p.id)).toContain(b.id)
    expect(run.map((p) => p.id)).not.toContain(c.id)
  })
})
