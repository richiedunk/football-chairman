import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  availableCards, careerCard, challengeCard, lastCompletedSeason, seasonCard,
} from '../src/engine/systems/shareCard'
import type { GameState } from '../src/engine/types'

/**
 * The card is the only part of this game most people will ever see.
 *
 * So the assertions are about what is on it rather than how it looks: that it
 * carries the coach and the fee rather than a points total, that it never
 * shows a blank where a career has not got there yet, and that it refuses to
 * exist rather than render something empty.
 */

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'CARD', directorName: 'Ray Vance', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id, undefined, { openingSigning: false })  // counts signings from a clean slate
}, 180_000)

function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

function withSeason(state: GameState, position: number, season = 2025, netSpend = 4_000_000) {
  const club = state.clubs[state.playerClubId!]
  club.history.push({
    season,
    leagueId: club.leagueId,
    leagueName: state.leagues[club.leagueId]?.name ?? 'League',
    position,
    played: 46,
    points: 71,
    goalsFor: 62,
    goalsAgainst: 44,
    cupResult: 'Fourth round',
    netSpend,
  })
  return club
}

describe('the season card', () => {
  it('does not exist before the season does', () => {
    const state = world()
    expect(seasonCard(state, state.playerClubId!, 2025)).toBeNull()
  })

  it('leads with where they finished, not with the points', () => {
    const state = world()
    withSeason(state, 3)
    const card = seasonCard(state, state.playerClubId!, 2025)!
    expect(card.headline.value).toBe('3rd')
    // A card whose biggest number is a points total says nothing about this
    // game. The points are present, but they are a row.
    expect(card.headline.value).not.toContain('71')
    expect(card.rows.some((r) => r.value.includes('71'))).toBe(true)
  })

  it('carries the club colours so it looks like the club', () => {
    const state = world()
    const club = withSeason(state, 3)
    const card = seasonCard(state, club.id, 2025)!
    expect(card.colors.primary).toBe(club.colors.primary)
  })

  it('puts the coach on it when he would not pick your signings', () => {
    const state = world()
    const club = withSeason(state, 3)
    // Two arrivals during the spell, one of whom he keeps leaving out.
    const [a, b] = club.squad
    for (const [i, id] of [a, b].entries()) {
      state.completedTransfers.push({
        id: `t${i}`, season: 2025, week: 2, playerId: id,
        playerName: state.players[id].knownAs,
        fromClubId: null, fromClubName: 'Elsewhere',
        toClubId: club.id, toClubName: club.name,
        fee: 1_000_000, kind: 'permanent',
      })
    }
    // As executeTransfer does, they go on the director's spell too.
    const spell = state.director.careerHistory.find((e) => e.clubId === club.id && e.toSeason === null)
    if (spell) spell.signedPlayerIds = [a, b]
    state.players[a].snubbedRun = 4
    state.players[b].snubbedRun = 3

    const card = seasonCard(state, club.id, 2025)!
    expect(card.rows.some((r) => r.label === 'Signings' && r.value.includes('would not pick')))
      .toBe(true)
    expect(card.line).toContain('could not get in the side')
  })

  it('says so plainly when there were no signings at all', () => {
    const state = world()
    const club = withSeason(state, 3)
    const card = seasonCard(state, club.id, 2025)!
    expect(card.rows.find((r) => r.label === 'Signings')?.value).toBe('None')
  })

  it('does not repeat the headline in a row', () => {
    // Six rows is the whole budget. One spent restating the position and the
    // division, which are already the largest thing on the card, is a row
    // that could have said something the reader did not know.
    const state = world()
    const club = withSeason(state, 3)
    const card = seasonCard(state, club.id, 2025)!
    expect(card.rows.some((r) => r.label === 'Finished')).toBe(false)
    expect(card.rows.some((r) => r.value.includes('3rd'))).toBe(false)
  })

  it('gives both goal columns rather than the difference', () => {
    const state = world()
    const club = withSeason(state, 3)
    const card = seasonCard(state, club.id, 2025)!
    expect(card.rows.find((r) => r.label === 'Goals')?.value).toBe('62 for, 44 against')
  })

  it('is speech, and says so', () => {
    const state = world()
    const club = withSeason(state, 3)
    expect(seasonCard(state, club.id, 2025)!.lineIsSpeech).toBe(true)
  })
})

describe('the career card', () => {
  it('leads with seasons served, because most careers win nothing', () => {
    const state = world()
    const card = careerCard(state)
    expect(card.headline.caption).toMatch(/SEASONS?/)
    expect(card.title).toBe('Ray Vance')
  })

  it('never leaves a row blank', () => {
    const state = world()
    const card = careerCard(state)
    for (const row of card.rows) {
      expect(row.value.length, `${row.label} was empty`).toBeGreaterThan(0)
    }
  })

  it('counts a career that is still running up to today', () => {
    const state = world()
    state.director.careerHistory[0].fromSeason = 2025
    state.director.careerHistory[0].toSeason = null
    state.date.season = 2029
    expect(careerCard(state).headline.value).toBe('5')
  })

  it('has a line for a career with nothing on the board', () => {
    const state = world()
    state.director.careerHistory[0].trophies = []
    state.director.careerHistory[0].outcome = 'In post'
    expect(careerCard(state).line.length).toBeGreaterThan(0)
  })
})

describe('the challenge card', () => {
  it('does not exist before there is anything to beat', () => {
    const state = world()
    expect(challengeCard(state, state.playerClubId!)).toBeNull()
  })

  it('carries the code that regenerates the world', () => {
    const state = world()
    const club = withSeason(state, 4)
    const card = challengeCard(state, club.id)!
    expect(card.challenge).toBeDefined()
    expect(card.challenge!.seed).toBe('CARD')
    expect(card.headline.value).toBe('4th')
    expect(card.headline.caption).toBe('BEAT THIS')
  })

  it('names who set it', () => {
    const state = world()
    const club = withSeason(state, 4)
    const card = challengeCard(state, club.id)!
    expect(card.rows.find((r) => r.label === 'Set by')?.value).toBe('Ray Vance')
  })

  it('tells a stranger what they would be inheriting', () => {
    const state = world()
    const club = withSeason(state, 4)
    const card = challengeCard(state, club.id)!
    const labels = card.rows.map((r) => r.label)
    expect(labels).toContain('Division')
    expect(labels).toContain('Squad')
    expect(labels).toContain('Wage bill')
    // And none of what the card already says elsewhere.
    expect(labels).not.toContain('Club')
    expect(card.rows.some((r) => r.value === card.headline.value)).toBe(false)
  })

  it('is an instruction, not something anybody said', () => {
    // The renderer quotes speech. "Better than 4th within one season" in
    // quotation marks reads as though a person had recited it.
    const state = world()
    const club = withSeason(state, 4)
    expect(challengeCard(state, club.id)!.lineIsSpeech).toBe(false)
  })
})

describe('what a save can currently send', () => {
  it('offers only the career card before a season is done', () => {
    const state = world()
    expect(availableCards(state)).toEqual(['career'])
  })

  it('offers the season and the challenge once one is', () => {
    const state = world()
    withSeason(state, 4)
    expect(availableCards(state).sort()).toEqual(['career', 'challenge', 'season'])
  })

  it('reports the last season the club actually completed', () => {
    const state = world()
    const club = state.clubs[state.playerClubId!]
    expect(lastCompletedSeason(state, club)).toBeNull()
    withSeason(state, 6, 2025)
    withSeason(state, 2, 2026)
    expect(lastCompletedSeason(state, club)).toBe(2026)
  })
})
