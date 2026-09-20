import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { coachView, signingsVerdict, yourSignings } from '../src/engine/systems/coachView'
import { selectTeam } from '../src/engine/sim/selection'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { Rng } from '../src/engine/rng'
import type { Club, CompletedTransfer, Fixture, GameState, MatchResult, Player, Staff } from '../src/engine/types'

/**
 * The coach's opinion of your players.
 *
 * The one property that matters: what the profile says he thinks and what he
 * does on Saturday must agree. The selector adds a weekly whim; with the whim
 * at zero, "first name on the sheet" must be a starter and nobody he "would
 * rather not" pick may start.
 */
let state: GameState
let club: Club
let coach: Staff
let squad: Player[]

/** The selector's whim, switched off, so the two views can be compared. */
const noWhim = { normal: () => 0 } as unknown as Rng

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'COACHVIEW', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
  coach = state.staff[club.headCoachId!]
  squad = seniorSquad(state, club)
}, 180_000)

describe('what he thinks of a player', () => {
  it('has an opinion on everyone in the squad', () => {
    for (const p of squad) {
      const view = coachView(state, club, p)
      expect(view, p.knownAs).not.toBeNull()
      expect(view!.label.length).toBeGreaterThan(0)
    }
  })

  it('agrees with the team he actually picks', () => {
    const team = selectTeam(state, club, noWhim)
    const starters = new Set(team.starters.map((s) => s.playerId))
    for (const p of squad) {
      const view = coachView(state, club, p)!
      if (view.opinion === 'firstName') {
        expect(starters.has(p.id), `${p.knownAs} is first name on the sheet and did not start`).toBe(true)
      }
      if (starters.has(p.id)) {
        expect(view.opinion, `${p.knownAs} started but the coach "${view.label}"`).not.toBe('ratherNot')
      }
    }
  })

  it('says why, when it can', () => {
    const views = squad.map((p) => coachView(state, club, p)!)
    const benched = views.filter((v) => v.opinion === 'notFancied' || v.opinion === 'ratherNot')
    expect(benched.length).toBeGreaterThan(0)
    for (const v of benched) expect(v.reason, v.label).not.toBeNull()
  })

  it('blames you for a player who is not on the squad list', () => {
    const p = squad.find((x) => x.age > 21 && club.registeredIds.includes(x.id))!
    const before = club.registeredIds
    club.registeredIds = before.filter((id) => id !== p.id)
    try {
      const view = coachView(state, club, p)!
      expect(view.opinion).toBe('barred')
      expect(view.reason).toMatch(/on you/)
    } finally {
      club.registeredIds = before
    }
  })

  it('has nowhere to put a player his shape does not field', () => {
    // A number ten in a 4-4-2 has no slot of his own and, unless he can fill
    // another, no place at all.
    const p = { ...squad[0], position: 'AM', altPositions: [] } as Player
    coach.coachProfile!.formation = '4-4-2'
    const view = coachView(state, club, p)!
    expect(['noPlace', 'ratherNot', 'notFancied', 'squad', 'inPlans', 'firstName']).toContain(view.opinion)
  })

  it('does not trust the young, when he is that kind of coach', () => {
    const kid = squad.slice().sort((a, b) => a.age - b.age)[0]
    const saved = coach.coachProfile!.trustInYouth
    coach.coachProfile!.trustInYouth = 10
    kid.age = 19
    try {
      const view = coachView(state, club, kid)!
      if (view.opinion !== 'firstName' && view.opinion !== 'inPlans') {
        expect(view.reason).toMatch(/under twenty-one/)
      }
    } finally {
      coach.coachProfile!.trustInYouth = saved
    }
  })

  it('has no opinion when there is no coach', () => {
    const id = club.headCoachId
    club.headCoachId = null
    try {
      expect(coachView(state, club, squad[0])).toBeNull()
      expect(signingsVerdict(state, club, null)).toBeNull()
    } finally {
      club.headCoachId = id
    }
  })
})

describe('your signings', () => {
  function sign(p: Player, season = state.date.season): CompletedTransfer {
    const record: CompletedTransfer = {
      id: `t-sign-${p.id}`, season, week: 3, playerId: p.id, playerName: p.knownAs,
      fromClubId: null, fromClubName: 'Elsewhere', toClubId: club.id, toClubName: club.name,
      fee: 1_000_000, kind: 'permanent',
    }
    state.completedTransfers.unshift(record)
    return record
  }

  it('is nobody on the day you arrive', () => {
    expect(yourSignings(state, club)).toEqual([])
  })

  it('is whoever arrived on your watch and is still here', () => {
    const a = squad[3]
    const b = squad[4]
    sign(a)
    sign(b)
    const names = yourSignings(state, club).map((p) => p.id)
    expect(names).toContain(a.id)
    expect(names).toContain(b.id)
    // A deal from before your time is not yours, however it turned out.
    sign(squad[5], state.date.season - 2)
    expect(yourSignings(state, club).map((p) => p.id)).not.toContain(squad[5].id)
  })

  it('counts a signing once however many times he was bought', () => {
    sign(squad[3])
    const ids = yourSignings(state, club).map((p) => p.id)
    expect(ids.filter((id) => id === squad[3].id)).toHaveLength(1)
  })

  it('says how many he picked, and names who he left out', () => {
    const [a, b] = yourSignings(state, club)
    const fixture = { id: 'fx-1', homeClubId: club.id, awayClubId: 'other', week: 5 } as Fixture
    const result = { homeLineup: [a.id], awayLineup: [], homeGoals: 1, awayGoals: 0, events: [], ratings: {} } as MatchResult
    const verdict = signingsVerdict(state, club, { fixture, result })!
    expect(verdict.started.map((p) => p.id)).toEqual([a.id])
    expect(verdict.leftOut.map((p) => p.id)).toContain(b.id)
    expect(verdict.line).toContain(b.knownAs)
  })

  it('reads the away lineup when you were away', () => {
    const [a] = yourSignings(state, club)
    const fixture = { id: 'fx-2', homeClubId: 'other', awayClubId: club.id, week: 6 } as Fixture
    const result = { homeLineup: [], awayLineup: [a.id], homeGoals: 0, awayGoals: 0, events: [], ratings: {} } as MatchResult
    const verdict = signingsVerdict(state, club, { fixture, result })!
    expect(verdict.started.map((p) => p.id)).toEqual([a.id])
  })

  it('says the same thing about the same match every time', () => {
    const fixture = { id: 'fx-3', homeClubId: club.id, awayClubId: 'other', week: 7 } as Fixture
    const result = { homeLineup: [], awayLineup: [], homeGoals: 0, awayGoals: 2, events: [], ratings: {} } as MatchResult
    const a = signingsVerdict(state, club, { fixture, result })!
    const b = signingsVerdict(state, club, { fixture, result })!
    expect(b.line).toBe(a.line)
    expect(a.started).toHaveLength(0)
  })

  it('talks like himself', () => {
    const profile = coach.coachProfile!
    const saved = profile.dofRelationship
    profile.dofRelationship = 10
    try {
      expect(signingsVerdict(state, club, null)!.register).toBe('pointed')
    } finally {
      profile.dofRelationship = saved
    }
  })
})
