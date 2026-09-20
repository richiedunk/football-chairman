import { describe, expect, it } from 'vitest'
import { outletCharacter, reach } from '../src/ui/press'

/**
 * An outlet's character, from the numbers the engine already keeps.
 *
 * The point of showing it at all is that a reader learns to discount one paper
 * and believe another. That only works if the mapping is stable — a paper that
 * reads as a tabloid one week and a paper of record the next teaches nothing —
 * and if the two inputs do different jobs rather than collapsing into one.
 */
describe('how an outlet reads', () => {
  it('sets the voice from sensationalism, not credibility', () => {
    // The same shouting paper, trustworthy and not. Both are tabloids: how
    // loud a paper is and whether it is right are different questions.
    expect(outletCharacter(90, 85).voice).toBe('tabloid')
    expect(outletCharacter(10, 85).voice).toBe('tabloid')
    // And a quiet paper stays quiet however well or badly sourced it is.
    expect(outletCharacter(90, 5).voice).toBe('record')
    expect(outletCharacter(10, 5).voice).toBe('record')
  })

  it('separates the loud-and-right from the loud-and-wrong', () => {
    // The distinction worth drawing: a sensational outlet with real
    // credibility is the dangerous one, because it will run anything and
    // people believe it.
    expect(outletCharacter(80, 80).standing).not.toBe(outletCharacter(20, 80).standing)
    expect(outletCharacter(80, 10).standing).not.toBe(outletCharacter(20, 10).standing)
  })

  it('gives every outlet in range a voice and a standing', () => {
    // No gap in the bands: an outlet with no description is an outlet the
    // reader cannot learn anything about.
    for (let c = 0; c <= 100; c += 5) {
      for (let s = 0; s <= 100; s += 5) {
        const character = outletCharacter(c, s)
        expect(character.voice, `no voice at ${c}/${s}`).toBeTruthy()
        expect(character.standing, `no standing at ${c}/${s}`).toBeTruthy()
        expect(character.className).toBe(`cutting--${character.voice}`)
      }
    }
  })

  it('never changes voice without sensationalism changing', () => {
    // Stability is the whole point. Holding sensationalism still and sweeping
    // credibility must not move an outlet between voices.
    for (let s = 0; s <= 100; s += 5) {
      const voices = new Set<string>()
      for (let c = 0; c <= 100; c += 5) voices.add(outletCharacter(c, s).voice)
      expect(voices.size, `sensationalism ${s} produced ${voices.size} voices`).toBe(1)
    }
  })

  it('describes how far a story travelled, across the whole range', () => {
    expect(reach(90)).toBe('BACK PAGE')
    expect(reach(10)).toBe('BURIED')
    const seen = new Set<string>()
    for (let p = 0; p <= 100; p += 5) seen.add(reach(p))
    // Four bands, all reachable — a band nothing can land in is a band that
    // should not exist.
    expect(seen.size).toBe(4)
  })
})
