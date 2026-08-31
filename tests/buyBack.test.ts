import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  BUY_BACK_DELAY_SEASONS, BUY_BACK_WINDOW_SEASONS, FREE_BUY_BACK_MULTIPLE,
  MIN_BUY_BACK_MULTIPLE, buyBackAcceptable, buyBackAskingPrice, buyBackConcession,
  buyBackDiscountedFee, clauseState, clauseUpside, clausesHeldBy, createClause, exerciseBuyBack,
  liveClausesFor,
} from '../src/engine/systems/buyBack'
import type { Club, GameState, Player } from '../src/engine/types'

let state: GameState
let club: Club

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'BUYBACK', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  club = state.clubs[state.playerClubId!]
}, 180_000)

describe('what a buy-back costs the club granting it', () => {
  it('costs most when the price is lowest', () => {
    const cheap = buyBackConcession(1_000_000, 1_400_000)
    const dear = buyBackConcession(1_000_000, 3_500_000)
    expect(cheap).toBeGreaterThan(dear)
  })

  it('costs nothing at all once the price is high enough', () => {
    // At four times the fee he would have to become a different player.
    expect(buyBackConcession(1_000_000, 1_000_000 * FREE_BUY_BACK_MULTIPLE)).toBe(0)
    expect(buyBackConcession(1_000_000, 9_000_000)).toBe(0)
  })

  it('costs nothing when no clause is asked for', () => {
    expect(buyBackConcession(1_000_000, 0)).toBe(0)
    expect(buyBackConcession(0, 500_000)).toBe(0)
  })

  it('refuses a price a buying club would never wear', () => {
    expect(buyBackAcceptable(1_000_000, 1_000_000 * MIN_BUY_BACK_MULTIPLE)).toBe(true)
    expect(buyBackAcceptable(1_000_000, 1_100_000)).toBe(false)
    expect(buyBackAcceptable(1_000_000, 0)).toBe(true)
  })

  it('quotes the same price the sale actually creates', () => {
    // These are read by the inbox option and by the code that completes the
    // sale; if they ever disagree the player is offered one deal and given
    // another.
    const fee = 4_000_000
    const price = buyBackAskingPrice(fee)
    expect(buyBackAcceptable(buyBackDiscountedFee(fee), price)).toBe(true)
    expect(buyBackDiscountedFee(fee)).toBeLessThan(fee)
  })
})

describe('the clause a sale creates', () => {
  it('opens a season later and runs for a fixed window', () => {
    const clause = createClause(club, 2_000_000, 5_000_000, 2025)
    expect(clause).toBeTruthy()
    expect(clause!.fromSeason).toBe(2025 + BUY_BACK_DELAY_SEASONS)
    expect(clause!.untilSeason).toBe(2025 + BUY_BACK_DELAY_SEASONS + BUY_BACK_WINDOW_SEASONS - 1)
    expect(clause!.soldFor).toBe(2_000_000)
  })

  it('is not created at a price the buyer would refuse', () => {
    expect(createClause(club, 2_000_000, 2_100_000, 2025)).toBeNull()
    expect(createClause(club, 2_000_000, 0, 2025)).toBeNull()
  })

  it('cannot be exercised in the season he was sold', () => {
    // Otherwise it is a loan with extra steps.
    const clause = createClause(club, 1_000_000, 3_000_000, 2025)!
    expect(clauseState(clause, 2025)).toBe('waiting')
    expect(clauseState(clause, 2026)).toBe('live')
  })

  it('lapses at the end of its window and stays lapsed', () => {
    const clause = createClause(club, 1_000_000, 3_000_000, 2025)!
    expect(clauseState(clause, clause.untilSeason)).toBe('live')
    expect(clauseState(clause, clause.untilSeason + 1)).toBe('lapsed')
    expect(clauseState(clause, clause.untilSeason + 9)).toBe('lapsed')
  })
})

describe('exercising it', () => {
  const sold = (over: Partial<Player> = {}): Player => {
    const player = Object.values(state.players).find((p) => p.clubId !== club.id)!
    return { ...player, buyBack: createClause(club, 1_000_000, 3_000_000, 2024), ...over } as Player
  }

  it('brings him back when the window is open and the money is there', () => {
    club.finances.transferBudget = 10_000_000
    const result = exerciseBuyBack({ ...state, date: { ...state.date, season: 2025 } }, sold(), club)
    expect(result.ok).toBe(true)
  })

  it('will not run before the window opens', () => {
    club.finances.transferBudget = 10_000_000
    const result = exerciseBuyBack({ ...state, date: { ...state.date, season: 2024 } }, sold(), club)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/does not open/i)
  })

  it('will not run after it has lapsed', () => {
    club.finances.transferBudget = 10_000_000
    const result = exerciseBuyBack({ ...state, date: { ...state.date, season: 2031 } }, sold(), club)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/lapsed/i)
  })

  it('does not override the budget', () => {
    // A right is not money. This is the constraint that makes a clause
    // something to plan for rather than a free player.
    club.finances.transferBudget = 100_000
    const result = exerciseBuyBack({ ...state, date: { ...state.date, season: 2025 } }, sold(), club)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/budget/i)
  })

  it('cannot be exercised by a club that does not hold it', () => {
    const other = Object.values(state.clubs).find((c) => c.id !== club.id)!
    other.finances.transferBudget = 10_000_000
    const result = exerciseBuyBack({ ...state, date: { ...state.date, season: 2025 } }, sold(), other)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/another club/i)
  })

  it('says nothing to exercise when there is no clause', () => {
    const player = Object.values(state.players)[0]
    expect(exerciseBuyBack(state, { ...player, buyBack: null } as Player, club).ok).toBe(false)
  })
})

describe('what the right is worth', () => {
  it('is the difference between his value and the agreed price', () => {
    const player = {
      value: 8_000_000, buyBack: createClause(club, 1_000_000, 3_000_000, 2024),
    } as Player
    expect(clauseUpside(player)).toBe(5_000_000)
  })

  it('goes negative when he has not kicked on, and says so rather than hiding it', () => {
    const player = {
      value: 900_000, buyBack: createClause(club, 1_000_000, 3_000_000, 2024),
    } as Player
    expect(clauseUpside(player)).toBeLessThan(0)
  })

  it('is nothing at all without a clause', () => {
    expect(clauseUpside({ value: 5_000_000, buyBack: null } as Player)).toBe(0)
  })
})

describe('finding the ones you hold', () => {
  it('lists none at the start of a career', () => {
    expect(clausesHeldBy(state, club.id)).toHaveLength(0)
    expect(liveClausesFor(state, club.id)).toHaveLength(0)
  })

  it('separates the live ones from those still waiting', () => {
    const players = Object.values(state.players).filter((p) => p.clubId !== club.id).slice(0, 2)
    players[0].buyBack = createClause(club, 1_000_000, 3_000_000, state.date.season - 1)
    players[1].buyBack = createClause(club, 1_000_000, 3_000_000, state.date.season)

    expect(clausesHeldBy(state, club.id)).toHaveLength(2)
    expect(liveClausesFor(state, club.id)).toHaveLength(1)

    for (const p of players) p.buyBack = null
  })
})
