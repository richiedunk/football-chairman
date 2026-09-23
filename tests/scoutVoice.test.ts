import { describe, expect, it } from 'vitest'
import { positionWord, scoutPitch, scoutVerdict } from '../src/engine/systems/scoutVoice'
import { article } from '../src/engine/systems/voice'
import type { Player, PlayerAttributes, Staff } from '../src/engine/types'

const KEYS = [
  'passing', 'shooting', 'dribbling', 'tackling', 'heading', 'crossing', 'setPieces', 'firstTouch',
  'pace', 'strength', 'stamina', 'agility', 'composure', 'vision', 'workRate', 'positioning',
  'leadership', 'determination', 'temperament', 'reflexes', 'handling', 'distribution', 'command',
] as const

function attrs(over: Partial<PlayerAttributes> = {}): PlayerAttributes {
  return { ...Object.fromEntries(KEYS.map((k) => [k, 10])), ...over } as PlayerAttributes
}

const player = (id: string, over: Partial<Player> = {}): Player => ({
  id, knownAs: `Player ${id}`, age: 24, position: 'ST', traits: [],
  attributes: attrs(), ...over,
}) as Player

const scout = { id: 'S1' } as Staff

describe('the scout says what he saw', () => {
  it('leads a first look with the thing that jumped out', () => {
    const quick = scoutVerdict(player('A', { attributes: attrs({ pace: 19 }) }), 100, 110, 10, scout)
    const leaps = scoutVerdict(player('A', { attributes: attrs({ heading: 19 }) }), 100, 110, 10, scout)
    expect(quick).toMatch(/rapid|quick|pace/i)
    expect(leaps).toMatch(/air|leap|goes up/i)
  })

  it('does not claim to read a mind from one game', () => {
    // Temperament is his best attribute, but one viewing cannot show it.
    const line = scoutVerdict(player('A', { attributes: attrs({ temperament: 20 }) }), 100, 110, 10, scout)
    expect(line).not.toMatch(/head when everyone|would not bite|Very even/)
  })

  it('only names a weakness once he has seen enough', () => {
    const p = player('A', { attributes: attrs({ pace: 19, heading: 2 }) })
    expect(scoutVerdict(p, 110, 115, 30, scout)).not.toMatch(/air|anything high/i)
    expect(scoutVerdict(p, 110, 115, 50, scout)).toMatch(/air|anything high/i)
  })

  it('reads every trait a player can have, once the file is thick enough', () => {
    for (const trait of ['mercenary', 'loyal', 'bigGameplayer', 'homesick', 'versatile'] as const) {
      const thin = scoutVerdict(player('A', { traits: [trait] }), 110, 115, 50, scout)
      const thick = scoutVerdict(player('A', { traits: [trait] }), 110, 115, 70, scout)
      expect(thick.length, trait).toBeGreaterThan(thin.length)
    }
  })

  it('does not run out of things to say across a shortlist', () => {
    // Four sentences covered every first look, the commonest thirty times in
    // two seasons. Twenty different strikers now get far more than four.
    const lines = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const best = KEYS[i % 16]
      lines.add(scoutVerdict(player(`P${i}`, { attributes: attrs({ [best]: 18 }) }), 100, 110, 10, scout))
    }
    expect(lines.size).toBeGreaterThanOrEqual(15)
  })

  it('says the same thing every time the same report is opened', () => {
    const p = player('A', { attributes: attrs({ vision: 17 }), traits: ['leader'] })
    expect(scoutVerdict(p, 120, 140, 65, scout)).toBe(scoutVerdict(p, 120, 140, 65, scout))
  })

  it('tells you who and where before what he thinks', () => {
    const p = player('A', { knownAs: 'Fenwick', age: 18, position: 'DL' })
    const pitch = scoutPitch(p, 'Barnet', 'Verdict.', scout, 3)
    expect(pitch).toMatch(/Fenwick/)
    expect(pitch).toMatch(/Barnet/)
    expect(pitch).toMatch(/left-back/)
    expect(pitch.endsWith('Verdict.')).toBe(true)
    expect(pitch).not.toMatch(/a 18/)
  })

  it('has a word for every position', () => {
    for (const pos of ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST'] as const) {
      expect(positionWord(pos)).not.toBe(pos)
    }
  })
})

describe('the article in front of a number', () => {
  it('reads a number the way it is said', () => {
    expect(article('18-year-old')).toBe('an')
    expect(article('8-week')).toBe('an')
    expect(article('11-man')).toBe('an')
    expect(article('80-yard')).toBe('an')
    expect(article('17-year-old')).toBe('a')
    expect(article('1,800-seat')).toBe('a')
    expect(article('180-page')).toBe('a')
  })
})
