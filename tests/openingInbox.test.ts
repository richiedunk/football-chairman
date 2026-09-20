import { describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { MANDATE_BRIEFS } from '../src/engine/systems/board'
import type { GameState } from '../src/engine/types'

/**
 * The opening remit letter used to say "the board have set the following
 * priorities" and then set out none of them. The list lived on the board
 * screen and nowhere else, so the first thing a new director read was a
 * sentence with its own subject missing.
 */
function startAt(seed: string): GameState {
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  return startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}

describe('opening inbox', () => {
  it('spells out every mandate it says you will be judged on', () => {
    // Several worlds, because which mandates a club gets depends on its books.
    const seeds = ['REMIT-A', 'REMIT-B', 'REMIT-C', 'REMIT-D']
    let checked = 0

    for (const seed of seeds) {
      const state = startAt(seed)
      const club = state.clubs[state.playerClubId!]!
      const remit = state.inbox.find((item) => item.subject === 'Your remit')

      if (club.board.mandates.length === 0) {
        expect(remit).toBeUndefined()
        continue
      }

      expect(remit).toBeDefined()
      for (const mandate of club.board.mandates) {
        expect(remit!.body).toContain(MANDATE_BRIEFS[mandate])
      }
      checked += 1
    }

    expect(checked).toBeGreaterThan(0)
  })

  it('sends the remit from the chairman, like every other board letter', () => {
    const state = startAt('REMIT-A')
    const remit = state.inbox.find((item) => item.subject === 'Your remit')
    if (remit) expect(remit.from).toBe('Chairman')
  })
})
