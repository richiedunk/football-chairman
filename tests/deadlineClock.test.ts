import { describe, expect, it } from 'vitest'
import {
  WINDOW_HOURS, clockFace, frameAt, hasLapsed, hoursLeft, offerHoursLeft, windowMs,
} from '../src/engine/systems/deadlineClock'
import type { DeadlineOpportunity } from '../src/engine/systems/deadlineDay'

/**
 * The clock decides what is still on the table, so it is the one part of the
 * live window that can take something away from a player. Everything here is
 * about it not doing that wrongly: no offer may vanish before its time, the
 * day may not run backwards, and a clock that was never started may not
 * remove anything at all.
 */

function offer(hours: number, id = `p${hours}`): DeadlineOpportunity {
  return {
    kind: 'available',
    playerId: id,
    playerName: id,
    clubId: null,
    clubName: 'Free agent',
    fee: 0,
    wage: 0,
    hours,
    note: '',
  }
}

const TOTAL = windowMs(6)

describe('the day running down', () => {
  it('starts full and ends empty', () => {
    expect(hoursLeft(0, TOTAL)).toBe(WINDOW_HOURS)
    expect(hoursLeft(TOTAL, TOTAL)).toBe(0)
  })

  it('never runs past either end, however long the screen is left open', () => {
    expect(hoursLeft(TOTAL * 5, TOTAL)).toBe(0)
    expect(hoursLeft(-1000, TOTAL)).toBe(WINDOW_HOURS)
  })

  it('moves in fractions, so the face is not frozen between whole hours', () => {
    expect(hoursLeft(TOTAL / 2, TOTAL)).toBeCloseTo(12, 5)
    expect(hoursLeft(TOTAL / 4, TOTAL)).toBeCloseTo(18, 5)
  })

  it('survives a window of no length rather than dividing by it', () => {
    expect(hoursLeft(0, 0)).toBe(0)
    expect(frameAt([offer(5)], 0, 0).shut).toBe(true)
  })
})

describe('the clock face', () => {
  it('reads as a time, not as a decimal', () => {
    expect(clockFace(24)).toBe('24:00')
    expect(clockFace(4.5)).toBe('4:30')
    expect(clockFace(0.25)).toBe('0:15')
    expect(clockFace(0)).toBe('0:00')
  })
})

describe('an offer going', () => {
  it('stands while its hours are unused', () => {
    expect(hasLapsed(offer(12), 0, TOTAL)).toBe(false)
    expect(hasLapsed(offer(12), TOTAL * 0.4, TOTAL)).toBe(false)
  })

  it('goes once they are', () => {
    // Twelve of the day's hours used is half the window.
    expect(hasLapsed(offer(12), TOTAL * 0.5, TOTAL)).toBe(true)
  })

  it('takes the short ones first', () => {
    const quarter = TOTAL * 0.25
    expect(hasLapsed(offer(4), quarter, TOTAL)).toBe(true)
    expect(hasLapsed(offer(24), quarter, TOTAL)).toBe(false)
  })

  it('takes nothing at all before the clock has started', () => {
    // The guarantee behind the setting being off by default: a screen whose
    // clock never runs behaves exactly as it did before there was one.
    for (const hours of [1, 6, 12, 24]) {
      expect(hasLapsed(offer(hours), 0, TOTAL)).toBe(false)
    }
  })

  it('counts its own remaining hours down to zero and no further', () => {
    expect(offerHoursLeft(offer(12), 0, TOTAL)).toBeCloseTo(12, 5)
    expect(offerHoursLeft(offer(12), TOTAL * 0.25, TOTAL)).toBeCloseTo(6, 5)
    expect(offerHoursLeft(offer(12), TOTAL, TOTAL)).toBe(0)
  })
})

describe('a frame', () => {
  const offers = [offer(24, 'marquee'), offer(12, 'middling'), offer(3, 'scrap')]

  it('has everything live at the start', () => {
    const frame = frameAt(offers, 0, TOTAL)
    expect(frame.live).toHaveLength(3)
    expect(frame.gone).toHaveLength(0)
    expect(frame.shut).toBe(false)
  })

  it('moves them across as the day goes', () => {
    const frame = frameAt(offers, TOTAL * 0.5, TOTAL)
    expect(frame.live.map((o) => o.playerId)).toEqual(['marquee'])
    expect(frame.gone.map((o) => o.playerId)).toEqual(['middling', 'scrap'])
  })

  it('keeps the generated order, so nothing jumps about as it thins', () => {
    const frame = frameAt(offers, TOTAL * 0.2, TOTAL)
    expect(frame.live.map((o) => o.playerId)).toEqual(['marquee', 'middling'])
  })

  it('ends with the window shut and nothing standing', () => {
    const frame = frameAt(offers, TOTAL, TOTAL)
    expect(frame.shut).toBe(true)
    expect(frame.live).toHaveLength(0)
    expect(frame.face).toBe('0:00')
    expect(frame.progress).toBe(1)
  })
})
