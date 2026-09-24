import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { IdFactory } from '../src/engine/ids'
import { Rng } from '../src/engine/rng'
import {
  allVerdicts, reportSuccessorVerdicts, signingsFromSpell, verdictFor, VERDICTS_PER_SEASON,
} from '../src/engine/systems/successor'
import type { CompletedTransfer, GameState, ID } from '../src/engine/types'

/**
 * What became of the players you signed at a club you no longer run.
 *
 * The system exists to deliver a judgement once, so most of these are about
 * what it stays quiet about: a player still doing his job is not news, a club
 * you are still at is not a past club, and nothing is ever said twice.
 */

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'SUCCESSOR', directorName: 'D', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id, undefined, { openingSigning: false })  // counts signings from a clean slate
}, 180_000)

function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

function deps() {
  return { ids: new IdFactory(900_000), rng: new Rng('successor-test') }
}

/**
 * A career that has moved on: the old club is left behind in 2025, the
 * director is somewhere else, and the clock has reached 2027.
 */
function withPastSpell(state: GameState) {
  const oldClubId = state.playerClubId!
  const entry = state.director.careerHistory.find((e) => e.clubId === oldClubId)!
  entry.fromSeason = 2024
  entry.toSeason = 2025
  entry.outcome = 'Sacked'

  const elsewhere = Object.values(state.clubs).find((c) => c.id !== oldClubId)!
  state.playerClubId = elsewhere.id
  state.date.season = 2027
  return { oldClubId, oldClub: state.clubs[oldClubId], elsewhere }
}

/** Record a transfer into the old club during the spell. */
function signFor(state: GameState, clubId: ID, playerId: ID, fee: number, season = 2024) {
  const player = state.players[playerId]
  const transfer: CompletedTransfer = {
    id: `t-${playerId}`,
    season,
    week: 3,
    playerId,
    playerName: player?.knownAs ?? 'Someone',
    fromClubId: null,
    fromClubName: 'Elsewhere',
    toClubId: clubId,
    toClubName: state.clubs[clubId].name,
    fee,
    kind: 'permanent',
  }
  state.completedTransfers.push(transfer)
  if (player) player.clubId = clubId
  return transfer
}

/** Record him leaving again. */
function sellFrom(state: GameState, from: ID, to: ID, playerId: ID, fee: number, season = 2026) {
  state.completedTransfers.push({
    id: `x-${playerId}`,
    season,
    week: 4,
    playerId,
    playerName: state.players[playerId]?.knownAs ?? 'Someone',
    fromClubId: from,
    fromClubName: state.clubs[from].name,
    toClubId: to,
    toClubName: state.clubs[to].name,
    fee,
    kind: 'permanent',
  })
  if (state.players[playerId]) state.players[playerId].clubId = to
}

describe('finding the signings of a past spell', () => {
  it('takes only transfers into that club inside those seasons', () => {
    const state = world()
    const { oldClubId, elsewhere } = withPastSpell(state)
    const squad = state.clubs[oldClubId].squad
    signFor(state, oldClubId, squad[0], 1_000_000, 2024)
    signFor(state, oldClubId, squad[1], 2_000_000, 2025)
    // Before the spell, and after it: neither is yours.
    signFor(state, oldClubId, squad[2], 3_000_000, 2020)
    signFor(state, elsewhere.id, squad[3], 4_000_000, 2024)

    const found = signingsFromSpell(state, oldClubId, 2024, 2025)
    expect(found.map((t) => t.playerId)).toEqual([squad[0], squad[1]])
  })

  it('counts a player signed twice only once', () => {
    const state = world()
    const { oldClubId } = withPastSpell(state)
    const id = state.clubs[oldClubId].squad[0]
    signFor(state, oldClubId, id, 1_000_000, 2024)
    signFor(state, oldClubId, id, 2_000_000, 2025)
    expect(signingsFromSpell(state, oldClubId, 2024, 2025)).toHaveLength(1)
  })
})

describe('what counts as a verdict', () => {
  it('says nothing about a player still there and doing his job', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    state.players[id].currentAbility = 110
    const transfer = signFor(state, oldClubId, id, 5_000_000, 2024)
    expect(verdictFor(state, transfer, oldClub.name)).toBeNull()
  })

  it('reports a player who is still there years later and good', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    state.players[id].currentAbility = 150
    const transfer = signFor(state, oldClubId, id, 5_000_000, 2024)
    expect(verdictFor(state, transfer, oldClub.name)?.kind).toBe('stillThere')
  })

  it('reports a retirement, which no flag on the player could survive', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    const transfer = signFor(state, oldClubId, id, 5_000_000, 2024)
    delete state.players[id]
    const verdict = verdictFor(state, transfer, oldClub.name)
    expect(verdict?.kind).toBe('retired')
  })

  it('reports a release', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    const transfer = signFor(state, oldClubId, id, 5_000_000, 2024)
    state.players[id].clubId = null
    expect(verdictFor(state, transfer, oldClub.name)?.kind).toBe('released')
  })

  it('calls it a loss when he went for less than half what you paid', () => {
    const state = world()
    const { oldClubId, oldClub, elsewhere } = withPastSpell(state)
    const id = oldClub.squad[0]
    const transfer = signFor(state, oldClubId, id, 8_000_000, 2024)
    sellFrom(state, oldClubId, elsewhere.id, id, 900_000)
    const verdict = verdictFor(state, transfer, oldClub.name)!
    expect(verdict.kind).toBe('soldAtLoss')
    expect(verdict.paid).toBe(8_000_000)
    expect(verdict.soldFor).toBe(900_000)
    // The figures, not one phrasing of them: the line is prose and will be
    // rewritten, but what he cost and what he went for are the verdict.
    expect(verdict.line).toContain(state.players[id].knownAs)
  })

  it('does not call a free transfer sold for nothing a loss', () => {
    // A free signing moved on for nothing is how a free signing ends. Calling
    // that a loss would put a needless sting on the most ordinary event in
    // the game.
    const state = world()
    const { oldClubId, oldClub, elsewhere } = withPastSpell(state)
    const id = oldClub.squad[0]
    const transfer = signFor(state, oldClubId, id, 0, 2024)
    sellFrom(state, oldClubId, elsewhere.id, id, 0)
    expect(verdictFor(state, transfer, oldClub.name)?.kind).not.toBe('soldAtLoss')
  })

  it('notices when he has gone up in the world', () => {
    const state = world()
    const { oldClubId, oldClub, elsewhere } = withPastSpell(state)
    const id = oldClub.squad[0]
    oldClub.reputation = 30
    elsewhere.reputation = 80
    const transfer = signFor(state, oldClubId, id, 1_000_000, 2024)
    sellFrom(state, oldClubId, elsewhere.id, id, 4_000_000)
    expect(verdictFor(state, transfer, oldClub.name)?.kind).toBe('thriving')
  })
})

describe('reporting', () => {
  it('says nothing about the club you are still at', () => {
    const state = world()
    const clubId = state.playerClubId!
    signFor(state, clubId, state.clubs[clubId].squad[0], 8_000_000, 2024)
    state.players[state.clubs[clubId].squad[0]].clubId = null
    expect(reportSuccessorVerdicts(state, deps())).toEqual([])
  })

  it('waits a season after you leave before passing judgement', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    state.date.season = 2025
    const id = oldClub.squad[0]
    signFor(state, oldClubId, id, 8_000_000, 2024)
    state.players[id].clubId = null
    expect(reportSuccessorVerdicts(state, deps())).toEqual([])
  })

  it('never reports the same signing twice', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    signFor(state, oldClubId, id, 8_000_000, 2024)
    state.players[id].clubId = null

    const first = reportSuccessorVerdicts(state, deps())
    expect(first).toHaveLength(1)
    expect(state.reportedSignings).toContain(id)

    const second = reportSuccessorVerdicts(state, deps())
    expect(second).toEqual([])
  })

  it('caps what arrives in one season', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    for (const id of oldClub.squad.slice(0, 6)) {
      signFor(state, oldClubId, id, 8_000_000, 2024)
      state.players[id].clubId = null
    }
    expect(reportSuccessorVerdicts(state, deps())).toHaveLength(VERDICTS_PER_SEASON)
  })

  it('leads with the one that stings', () => {
    const state = world()
    const { oldClubId, oldClub, elsewhere } = withPastSpell(state)
    const [a, b, c] = oldClub.squad

    // An ordinary sale, a retirement, and a fee that went backwards.
    signFor(state, oldClubId, a, 2_000_000, 2024)
    sellFrom(state, oldClubId, elsewhere.id, a, 2_100_000)
    signFor(state, oldClubId, b, 1_000_000, 2024)
    delete state.players[b]
    signFor(state, oldClubId, c, 9_000_000, 2024)
    sellFrom(state, oldClubId, elsewhere.id, c, 500_000)

    const reported = reportSuccessorVerdicts(state, deps())
    expect(reported[0].kind).toBe('soldAtLoss')
    expect(reported[0].playerId).toBe(c)
  })

  it('costs the director reputation when he got one badly wrong', () => {
    const state = world()
    const { oldClubId, oldClub, elsewhere } = withPastSpell(state)
    const id = oldClub.squad[0]
    state.director.reputation = 50
    signFor(state, oldClubId, id, 9_000_000, 2024)
    sellFrom(state, oldClubId, elsewhere.id, id, 400_000)

    reportSuccessorVerdicts(state, deps())
    expect(state.director.reputation).toBeLessThan(50)
  })

  it('puts it in the inbox and the feed', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    const before = state.inbox.length
    signFor(state, oldClubId, id, 8_000_000, 2024)
    state.players[id].clubId = null

    reportSuccessorVerdicts(state, deps())
    expect(state.inbox.length).toBe(before + 1)
    expect(state.newsFeed.some((n) => n.text.includes('released'))).toBe(true)
  })

  it('collects what has been reported for a screen to show', () => {
    const state = world()
    const { oldClubId, oldClub } = withPastSpell(state)
    const id = oldClub.squad[0]
    signFor(state, oldClubId, id, 8_000_000, 2024)
    state.players[id].clubId = null

    expect(allVerdicts(state)).toEqual([])
    reportSuccessorVerdicts(state, deps())
    expect(allVerdicts(state).map((v) => v.playerId)).toEqual([id])
  })
})
