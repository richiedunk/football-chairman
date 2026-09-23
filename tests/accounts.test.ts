import { describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { canTakeJobAt } from '../src/engine/systems/career'
import type { GameState } from '../src/engine/types'

/**
 * The balance in the status bar jumped between the first week and the second
 * — −£324k, then £58k — with nothing anywhere to say why. Two causes: a club
 * generated overdrawn had the overdraft folded into its debt by the first
 * week's finances, and every note the finance pass wrote "for the inbox" was
 * discarded by its caller, so the director was never told that, nor that an
 * embargo had been imposed.
 */

function career(seed: string) {
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'scout', worldSize: 'compact',
    homeNationId: 'eng', startingSeason: 2025,
  })
  const open = setup.candidates.filter((c) => canTakeJobAt(setup.state.director, c))
  return { setup, open }
}

function answerEverything(state: GameState): void {
  for (const item of state.inbox) {
    const d = item.decision
    if (!d || d.chosenId) continue
    const option = d.options.find((o) => o.available)
    if (option) d.chosenId = option.id
  }
}

describe('the accounts', () => {
  it('never opens a career overdrawn', () => {
    for (const seed of ['BAL0', 'BAL1', 'BAL2']) {
      const { setup, open } = career(seed)
      for (const club of open.slice(0, 4)) {
        const fresh = career(seed).setup
        const state = startCareerAt(fresh, club.id)
        expect(state.clubs[club.id].finances.balance, `${club.name} opens overdrawn`).toBeGreaterThanOrEqual(0)
      }
      void setup
    }
  })

  it('says so when the money runs out, and says it once', () => {
    const { setup, open } = career('BAL3')
    const state = startCareerAt(setup, open[0].id)
    const club = state.clubs[open[0].id]
    // Nobody rich enough to cover it, and barely anything in the bank.
    club.board.owner.wealth = 0
    club.finances.balance = 1
    // And a loss this week whatever the gate: a debt whose interest alone
    // outruns the income.
    club.finances.debt = 200_000_000
    club.finances.weeklyInterestRate = 0.002
    const deps = { ids: setup.ids, names: setup.names }

    answerEverything(state)
    advanceWeek(state, deps)
    const told = state.inbox.filter((i) => i.subject === 'The accounts' && /debt/.test(i.body))
    expect(told.length, 'the overdraft became debt without a word').toBe(1)
    expect(told[0].body).toMatch(/£/)

    answerEverything(state)
    advanceWeek(state, deps)
    const after = state.inbox.filter((i) => i.subject === 'The accounts' && /account is empty/.test(i.body))
    expect(after.length, 'told again the following week').toBe(1)
  }, 60_000)
})
