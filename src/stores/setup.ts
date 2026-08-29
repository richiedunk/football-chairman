import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { prepareNewGame, startCareerAt, type NewGameOptions, type NewGameSetup } from '../engine/newGame'
import type { Club, GameState, ID } from '../engine/types'
import type { ContractOffer } from '../engine/systems/directorContract'

/**
 * New-game staging.
 *
 * World generation and club selection are two steps, and the generated world
 * has to survive between them without being committed as the live game — if
 * the player backs out at the club-selection screen, nothing should have been
 * saved. Held in a shallowRef for the same reason as the main game state:
 * making 18,000 players reactive would be ruinous.
 */
export const useSetupStore = defineStore('setup', () => {
  const pending = shallowRef<NewGameSetup | null>(null)

  function generate(options: Omit<NewGameOptions, 'startingSeason'>): NewGameSetup {
    const result = prepareNewGame({ ...options })
    pending.value = result
    return result
  }

  function candidates(): Club[] {
    return pending.value?.candidates ?? []
  }

  function commit(
    clubId: ID,
    contract?: ContractOffer,
  ): { state: GameState; setup: NewGameSetup } {
    const setup = pending.value
    if (!setup) throw new Error('No world has been generated.')
    const state = startCareerAt(setup, clubId, contract)
    return { state, setup }
  }

  function clear(): void {
    pending.value = null
  }

  return { pending, generate, candidates, commit, clear }
})
