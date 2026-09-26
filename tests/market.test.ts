import { describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { Rng } from '../src/engine/rng'
import { firstTeamStandard, generateIncomingOffers } from '../src/engine/systems/transfers'
import { generateOpportunities } from '../src/engine/systems/deadlineDay'
import { clearRatingCache } from '../src/engine/world/attributes'
import type { GameState } from '../src/engine/types'

/** A career at a club in the given English tier, in the summer window. */
function careerInTier(seed: string, tier: number): { state: GameState; setup: ReturnType<typeof prepareNewGame> } {
  clearRatingCache()
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'analyst', worldSize: 'compact',
    homeNationId: 'eng', startingSeason: 2025,
  })
  const league = Object.values(setup.state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)!
  const state = startCareerAt(setup, league.clubIds[Math.floor(league.clubIds.length / 2)])
  state.date.week = 2
  return { state, setup }
}

describe('the market around a lower-league club', () => {
  it('never passes on a £0 bid, and only from clubs he would play for', () => {
    for (const seed of ['MKT1', 'MKT2', 'MKT3']) {
      const { state, setup } = careerInTier(seed, 4)
      const club = state.clubs[state.playerClubId!]
      // Make everyone available so the market has something to answer.
      for (const id of club.squad) state.players[id].listedForTransfer = true
      const ctx = { rng: new Rng(`offers-${seed}`), ids: setup.ids }
      const offers = Array.from({ length: 6 }, () => generateIncomingOffers(state, ctx)).flat()
      expect(offers.length).toBeGreaterThan(0)
      for (const offer of offers) {
        expect(offer.fee, `${offer.buyer.name} for ${offer.player.knownAs}`).toBeGreaterThan(0)
        expect(
          offer.player.currentAbility,
          `${offer.buyer.name} (standard ${firstTeamStandard(state, offer.buyer)}) bid for a CA ${offer.player.currentAbility}`,
        ).toBeGreaterThanOrEqual(firstTeamStandard(state, offer.buyer) * 0.92)
      }
    }
  })

  it('offers deadline-day players who would get in the side, not all on the floor wage', () => {
    const wages = new Set<number>()
    for (const seed of ['DL1', 'DL2', 'DL3']) {
      const { state } = careerInTier(seed, 4)
      const club = state.clubs[state.playerClubId!]
      club.finances.transferBudget = 5_000_000
      club.finances.wageBudget *= 3
      const standard = firstTeamStandard(state, club)
      const offers = generateOpportunities(state, club, new Rng(`deadline-${seed}`))
      expect(offers.length).toBeGreaterThan(0)
      for (const o of offers) {
        expect(state.players[o.playerId].currentAbility).toBeGreaterThanOrEqual(standard * 0.97)
        wages.add(o.wage)
      }
    }
    expect(wages.size).toBeGreaterThan(3)
  })
})
