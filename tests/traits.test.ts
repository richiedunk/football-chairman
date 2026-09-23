import { describe, expect, it } from 'vitest'
import { TRAIT_LABELS, traitLabel, traitLine } from '../src/ui/traits'
import type { PlayerTrait } from '../src/engine/types'

describe('trait labels', () => {
  it('never prints an identifier', () => {
    // The dressing room printed "INJURYPRONE, BIGGAMEPLAYER" and the profile
    // printed "big gameplayer". Every label is words a person would say.
    for (const [trait, label] of Object.entries(TRAIT_LABELS)) {
      expect(label, trait).not.toMatch(/[a-z][A-Z]/)
      expect(label, trait).not.toBe(trait)
    }
    expect(traitLabel('bigGameplayer')).toBe('Big-game player')
  })

  it('says something human about a trait it has no label for', () => {
    expect(traitLabel('neverHeardOf' as PlayerTrait)).toBe('never heard of')
  })

  it('joins a player\'s traits into one line', () => {
    expect(traitLine(['leader', 'injuryProne'])).toBe('Leader, Injury-prone')
    expect(traitLine([])).toBe('')
  })
})
