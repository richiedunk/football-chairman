import { describe, expect, it } from 'vitest'
import { makeCareerRecord, readCareerRecord, careerAppearances } from '../src/engine/systems/careerRecord'
import type { PlayerSeasonStats } from '../src/engine/types'

/**
 * A career record is a tuple, which means its fields are held in place by
 * position and nothing else.
 *
 * That is the whole risk of the change. A transposed pair typechecks — every
 * slot but two is a number — round-trips the right count of fields, and turns
 * a player's goals into his assists on every screen that ever reads them. The
 * compiler cannot see it and neither can a reviewer counting commas.
 *
 * So the values here are deliberately all different. Equal values would let a
 * swap pass.
 */
const STATS: PlayerSeasonStats = {
  appearances: 31,
  starts: 27,
  minutes: 2431,
  goals: 12,
  assists: 7,
  cleanSheets: 3,
  yellowCards: 5,
  redCards: 1,
  ratingSum: 219.4,
  motmAwards: 4,
}

describe('a season in a career', () => {
  it('reads back exactly what was written', () => {
    const record = makeCareerRecord(STATS, 2029, 'club-42', 'Harrogate Town', 'League Two')
    expect(readCareerRecord(record)).toEqual({
      ...STATS,
      season: 2029,
      clubId: 'club-42',
      clubName: 'Harrogate Town',
      leagueName: 'League Two',
    })
  })

  it('keeps every field distinct, so a transposition cannot hide', () => {
    const values = Object.values(STATS)
    expect(new Set(values).size, 'the fixture reuses a value, which would let a swap pass')
      .toBe(values.length)
  })

  it('reads appearances without expanding the record', () => {
    const record = makeCareerRecord(STATS, 2029, 'club-42', 'Harrogate Town', 'League Two')
    expect(careerAppearances(record)).toBe(STATS.appearances)
    expect(careerAppearances(record)).toBe(readCareerRecord(record).appearances)
  })

  it('is smaller than the object it replaced', () => {
    // The entire reason it is a tuple. If this stops being true the change has
    // lost its purpose and should be reverted rather than kept for its looks.
    const record = makeCareerRecord(STATS, 2029, 'club-42', 'Harrogate Town', 'League Two')
    const asObject = readCareerRecord(record)
    const tupleBytes = JSON.stringify(record).length
    const objectBytes = JSON.stringify(asObject).length
    expect(tupleBytes).toBeLessThan(objectBytes * 0.5)
  })
})
