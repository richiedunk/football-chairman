import { describe, expect, it } from 'vitest'
import { article, contact, phrase, withArticle } from '../src/engine/systems/voice'

/**
 * Picking how somebody phrases something.
 *
 * The whole world is rebuilt from a seed, so a message that reads one way on
 * one run and another way on the next would break the one guarantee this
 * project actually makes. Variation that is not deterministic is worse than no
 * variation at all.
 */
const POOL = ['first', 'second', 'third'] as const

describe('choosing a phrasing', () => {
  it('gives the same key the same line, every time', () => {
    const once = phrase('plr_7:week_12', POOL)
    for (let i = 0; i < 50; i++) expect(phrase('plr_7:week_12', POOL)).toBe(once)
  })

  it('actually varies across keys', () => {
    // A picker that always returns the first line is a picker doing nothing,
    // and would pass the determinism test above perfectly.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(phrase(`plr_${i}:week_3`, POOL))
    expect(seen.size).toBe(POOL.length)
  })

  it('spreads reasonably evenly rather than favouring one line', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 900; i++) {
      const line = phrase(`plr_${i}:week_${i % 40}`, POOL)
      counts.set(line, (counts.get(line) ?? 0) + 1)
    }
    // 300 each if perfect. A picker that is merely deterministic could still
    // put 890 of them on one line.
    for (const [line, n] of counts) {
      expect(n, `"${line}" came up ${n} times in 900`).toBeGreaterThan(180)
    }
  })

  it('always returns a line from the pool it was given', () => {
    for (let i = 0; i < 100; i++) {
      expect(POOL).toContain(phrase(`whatever:${i}`, POOL))
    }
  })

  it('copes with a pool of one, and with none', () => {
    expect(phrase('k', ['only'])).toBe('only')
    expect(phrase('k', [])).toBe('')
  })
})

describe('putting an article in front of a generated word', () => {
  it('uses an before a vowel and a before a consonant', () => {
    // "It's a ankle sprain for Marcus Drinkwell" reached a screenshot.
    expect(withArticle('ankle sprain')).toBe('an ankle sprain')
    expect(withArticle('hamstring strain')).toBe('a hamstring strain')
    expect(withArticle('dead leg')).toBe('a dead leg')
    expect(withArticle('injury')).toBe('an injury')
  })

  it('is not fooled by leading space or capitals', () => {
    expect(article('  Ankle sprain')).toBe('an')
    expect(article('Groin strain')).toBe('a')
  })

  it('never returns nothing, whatever it is handed', () => {
    for (const odd of ['', ' ', '7-week layoff', "'keeper"]) {
      expect(['a', 'an']).toContain(article(odd))
    }
  })
})

describe('how a contact is saved', () => {
  it('puts the role in brackets after a name', () => {
    expect(contact('Jude Holloway', 'Scout')).toBe('Jude Holloway (Scout)')
  })

  it('falls back to the role alone when nobody is named', () => {
    // A phone that does not know who the competition secretary is saves them
    // as "Competition Secretary", and that is a perfectly good contact.
    expect(contact(null, 'Competition Secretary')).toBe('Competition Secretary')
    expect(contact(undefined, 'Head Coach')).toBe('Head Coach')
    expect(contact('   ', 'Physio')).toBe('Physio')
  })
})
