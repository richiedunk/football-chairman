import { describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { canTakeJobAt } from '../src/engine/systems/career'
import { yourSignings } from '../src/engine/systems/coachView'
import type { GameState } from '../src/engine/types'

/**
 * The beat the game is about, guaranteed in the first hour.
 *
 * A reviewer's last complaint: the central "your signing doesn't play" moment
 * is not guaranteed in the first hours. scripts/openingcheck.ts measures it
 * across many careers; these pin one career so a change that breaks the
 * staging fails here rather than in a playtest.
 */

function career(seed: string, index = 1) {
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'scout', worldSize: 'compact',
    homeNationId: 'eng', startingSeason: 2025,
  })
  const clubId = setup.candidates.filter((c) => canTakeJobAt(setup.state.director, c))[index].id
  const state = startCareerAt(setup, clubId)
  return { state, club: state.clubs[clubId], deps: { ids: setup.ids, names: setup.names } }
}

function answerEverything(state: GameState): void {
  for (const item of state.inbox) {
    const d = item.decision
    if (!d || d.chosenId) continue
    const option = d.options.find((o) => o.id === d.defaultOptionId && o.available)
      ?? d.options.find((o) => o.available)
    if (option) d.chosenId = option.id
  }
}

describe('the signing the board made before you arrived', () => {
  it('is on the books, counted as yours, and paid for', () => {
    const { state, club } = career('OPEN0')
    const [signing] = yourSignings(state, club)
    expect(signing, 'no signing staged').toBeTruthy()
    expect(club.squad).toContain(signing.id)
    expect(club.registeredIds, 'staged but cannot be picked at all').toContain(signing.id)
    const deal = state.completedTransfers.find((t) => t.playerId === signing.id)
    expect(deal?.toClubId).toBe(club.id)
    expect(signing.desiredStatus, 'he was sold the move as a starter').toBe('firstTeam')
  })

  it('arrives with the chairman explaining it and the coach saying what he thinks', () => {
    const { state, club } = career('OPEN0')
    const [signing] = yourSignings(state, club)
    const fromChairman = state.inbox.find((i) => i.subject === `${signing.knownAs} has signed`)
    const fromCoach = state.inbox.find((i) => i.subject === `About ${signing.knownAs}`)
    expect(fromChairman?.from).toBe('Chairman')
    expect(fromCoach?.from).toMatch(/Head Coach/)
    expect(fromCoach?.link?.id, 'the coach is not talking about him').toBe(signing.id)
    // The welcome is still the first thing a new director reads.
    expect(state.inbox[0].subject).toMatch(/Welcome|remit/)
  })

  it('is left out of the first competitive match', () => {
    // A career openingcheck.ts shows benched: the staging makes this likely,
    // not certain, because the coach's whim is his own.
    const { state, club, deps } = career('OPEN0', 2)
    const [signing] = yourSignings(state, club)
    let lineup: string[] | null = null
    for (let w = 0; w < 12 && !lineup; w++) {
      answerEverything(state)
      advanceWeek(state, deps)
      const played = state.fixtures.find((f) =>
        f.result && (f.homeClubId === club.id || f.awayClubId === club.id))
      if (played?.result) {
        lineup = played.homeClubId === club.id ? played.result.homeLineup : played.result.awayLineup
      }
    }
    expect(lineup, 'no match played in twelve weeks').toBeTruthy()
    expect(lineup).not.toContain(signing.id)
  }, 120_000)

  it('stages the same player every time for the same seed', () => {
    const a = career('OPEN3', 0)
    const b = career('OPEN3', 0)
    expect(yourSignings(a.state, a.club).map((p) => p.id))
      .toEqual(yourSignings(b.state, b.club).map((p) => p.id))
  })
})
