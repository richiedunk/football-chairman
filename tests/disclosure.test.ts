import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { discloseFee, newspaperRound, reportingError } from '../src/engine/systems/disclosure'
import type { CompletedTransfer, GameState, MediaOutlet } from '../src/engine/types'

/**
 * For an undisclosed fee.
 *
 * The rule under test: a fee you were not party to is never shown, a paper's
 * figure for it is wrong by an amount that depends on the paper, and the same
 * deal reads the same way every time the screen is opened.
 */
let state: GameState
let myClubId: string

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'FEETEST', directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
  myClubId = state.playerClubId!
}, 180_000)

function record(over: Partial<CompletedTransfer> = {}): CompletedTransfer {
  const clubs = Object.values(state.clubs).filter((c) => c.id !== myClubId)
  return {
    id: 't-fee-1', season: 2025, week: 4, playerId: 'p1', playerName: 'A. Player',
    fromClubId: clubs[0].id, fromClubName: clubs[0].name,
    toClubId: clubs[1].id, toClubName: clubs[1].name,
    fee: 4_183_000, kind: 'permanent',
    ...over,
  } as CompletedTransfer
}

describe('what the reader is told', () => {
  it('shows the real fee on a deal your club was in', () => {
    const bought = discloseFee(state, record({ toClubId: myClubId }), myClubId)
    expect(bought.disclosed).toBe(true)
    expect(bought.fee).toBe(4_183_000)
    const sold = discloseFee(state, record({ fromClubId: myClubId }), myClubId)
    expect(sold.fee).toBe(4_183_000)
  })

  it('never shows the fee on anyone else\'s deal', () => {
    const d = discloseFee(state, record(), myClubId)
    expect(d.disclosed).toBe(false)
    expect(d.fee).toBeNull()
    expect(d.label).toBe('Undisclosed')
  })

  it('calls a free transfer free and a loan a loan, because those are public', () => {
    expect(discloseFee(state, record({ fee: 0 }), myClubId).label).toBe('Free')
    expect(discloseFee(state, record({ kind: 'loan', fee: 0 }), myClubId).label).toBe('Loan')
  })

  it('attributes a figure to a paper, in the buying club\'s country', () => {
    const d = discloseFee(state, record(), myClubId)
    expect(d.reported).not.toBeNull()
    const outlet = state.outlets[d.reported!.outletId]
    expect(outlet).toBeDefined()
    expect(outlet.nationId).toBe(state.clubs[record().toClubId].nationId)
    expect(d.reported!.outletName).toBe(outlet.name)
    expect(d.reported!.verb.length).toBeGreaterThan(0)
  })

  it('prints the same paper and the same figure every time', () => {
    const a = discloseFee(state, record(), myClubId)
    const b = discloseFee(state, record(), myClubId)
    expect(b).toEqual(a)
  })

  it('has different deals land in different papers', () => {
    const outlets = new Set<string>()
    for (let i = 0; i < 40; i++) {
      outlets.add(discloseFee(state, record({ id: `t-${i}` }), myClubId).reported!.outletId)
    }
    expect(outlets.size).toBeGreaterThan(1)
  })
})

describe('how wrong the papers are', () => {
  const tabloid: Pick<MediaOutlet, 'credibility' | 'sensationalism'> = { credibility: 30, sensationalism: 90 }
  const record_: Pick<MediaOutlet, 'credibility' | 'sensationalism'> = { credibility: 90, sensationalism: 10 }

  const sample = (o: Pick<MediaOutlet, 'credibility' | 'sensationalism'>) =>
    Array.from({ length: 200 }, (_, i) => reportingError(o, i / 200))

  it('gives a tabloid a wider band than a paper of record', () => {
    const width = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    expect(width(sample(tabloid))).toBeGreaterThan(width(sample(record_)) * 2)
  })

  it('has the tabloid inflate on average, and the record paper roughly level', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(sample(tabloid))).toBeGreaterThan(0.05)
    expect(Math.abs(mean(sample(record_)))).toBeLessThan(0.03)
  })

  it('is never right to the pound, even from the best paper', () => {
    for (const e of sample(record_)) expect(Math.abs(e)).toBeGreaterThan(0)
  })

  it('keeps every figure within the range a reader would believe', () => {
    for (const e of [...sample(tabloid), ...sample(record_)]) {
      expect(e).toBeGreaterThan(-0.5)
      expect(e).toBeLessThan(0.7)
    }
  })
})

describe('the way a paper writes a number', () => {
  it('rounds to two significant figures', () => {
    expect(newspaperRound(4_183_000)).toBe(4_200_000)
    expect(newspaperRound(12_760_000)).toBe(13_000_000)
    expect(newspaperRound(875_400)).toBe(880_000)
    expect(newspaperRound(0)).toBe(0)
  })
})
