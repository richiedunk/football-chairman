import { Rng } from '../rng'
import type { Nation } from '../types'
import { NAME_POOLS, NICKNAME_SUFFIXES, SHORT_FORMS, type NamePool } from './pools'

/**
 * Person-name generation.
 *
 * The generator is stateful only in that it remembers which full names it has
 * already issued, so a single world does not end up with three Marco Rinaldis
 * in the same division. That register is rebuilt on load rather than saved —
 * it is derivable from the people already in the world.
 */
export interface GeneratedName {
  firstName: string
  lastName: string
  /** What the UI shows: usually "F. Lastname" or a mononym/nickname. */
  knownAs: string
}

export class NameGenerator {
  private used = new Set<string>()

  constructor(private rng: Rng) {}

  /** Re-seed the duplicate register from names already in the world. */
  registerExisting(names: Iterable<string>): void {
    for (const n of names) this.used.add(n.toLowerCase())
  }

  /**
   * Generate a name appropriate to `nation`, honouring its diaspora weighting.
   * `youthProspect` biases toward the secondary pools, since academy intakes in
   * most European nations skew more diverse than the senior population.
   */
  forNation(nation: Nation, opts: { youthProspect?: boolean } = {}): GeneratedName {
    const pool = this.choosePool(nation, opts.youthProspect ?? false)
    for (let attempt = 0; attempt < 12; attempt++) {
      const name = this.fromPool(pool)
      const key = `${name.firstName} ${name.lastName}`.toLowerCase()
      if (!this.used.has(key)) {
        this.used.add(key)
        return name
      }
    }
    // Twelve collisions means the pool is saturated; disambiguate rather than
    // loop forever. Real squads do carry two players with the same surname.
    const fallback = this.fromPool(pool)
    const initial = this.rng.pick('ABCDEFGHIJKLMNOPRSTVW'.split(''))
    const disambiguated: GeneratedName = {
      ...fallback,
      lastName: `${fallback.lastName}`,
      knownAs: `${initial}. ${fallback.lastName}`,
    }
    this.used.add(`${disambiguated.firstName} ${disambiguated.lastName}`.toLowerCase())
    return disambiguated
  }

  /** Generate directly from a named pool, ignoring nation weighting. */
  fromPoolId(poolId: string): GeneratedName {
    const pool = NAME_POOLS[poolId] ?? NAME_POOLS.english
    return this.fromPool(pool)
  }

  private choosePool(nation: Nation, youthProspect: boolean): NamePool {
    const primary = NAME_POOLS[nation.namePool] ?? NAME_POOLS.english
    if (nation.secondaryPools.length === 0) return primary

    // Youth intakes lean further into the secondary pools than the senior
    // population does — roughly the shift you see comparing a French U19 squad
    // to a French squad from thirty years ago.
    const diasporaBoost = youthProspect ? 1.6 : 1
    const items: NamePool[] = [primary]
    const weights: number[] = [100]
    for (const sec of nation.secondaryPools) {
      const p = NAME_POOLS[sec.pool]
      if (!p) continue
      items.push(p)
      weights.push(sec.weight * diasporaBoost)
    }
    return this.rng.weighted(items, weights)
  }

  private fromPool(pool: NamePool): GeneratedName {
    const firstName = this.rng.pick(pool.forenames)
    let lastName = this.rng.pick(pool.surnames)

    // Particles: Dutch "van der", Portuguese "dos", German "von".
    if (pool.conventions.includes('particle') && pool.particles) {
      for (const particle of pool.particles) {
        if (this.rng.chance(particle.chance)) {
          lastName = `${particle.text} ${lastName}`
          break
        }
      }
    }

    // Spanish and Portuguese paternal + maternal surnames. Kept to a minority
    // of players because in football most are known by one of the two anyway.
    if (pool.conventions.includes('doubleSurname') && this.rng.chance(0.28)) {
      const second = this.rng.pick(pool.surnames)
      if (!lastName.endsWith(second)) lastName = `${lastName} ${second}`
    }

    const knownAs = this.deriveKnownAs(pool, firstName, lastName)
    return { firstName, lastName, knownAs }
  }

  private deriveKnownAs(pool: NamePool, firstName: string, lastName: string): string {
    // Brazilian and Iberian mononyms — a meaningful share of players are known
    // by a single name or a diminutive rather than forename plus surname.
    if (pool.conventions.includes('mononym') && this.rng.chance(0.34)) {
      const base = this.rng.chance(0.55) ? firstName : lastName.split(' ').pop() ?? lastName
      if (this.rng.chance(0.35)) {
        const suffix = this.rng.pick(NICKNAME_SUFFIXES)
        return applySuffix(base, suffix)
      }
      return base
    }

    if (pool.conventions.includes('surnameFirst')) {
      // East Asian ordering: surname precedes given name.
      return `${lastName} ${firstName}`
    }

    if (pool.conventions.includes('nickname')) {
      const short = SHORT_FORMS[firstName]
      if (short && this.rng.chance(0.4)) return `${short} ${lastName}`
    }

    if (pool.conventions.includes('initialFirst') && this.rng.chance(0.08)) {
      return `${firstName[0]}. ${lastName}`
    }

    return `${firstName} ${lastName}`
  }
}

/**
 * Attach a diminutive suffix the way Portuguese does: trim a trailing vowel
 * before adding "-inho" so Ronald + inho reads Ronaldinho, not Ronaldoinho.
 */
function applySuffix(base: string, suffix: string): string {
  const trimmed = /[aeiou]$/i.test(base) ? base.slice(0, -1) : base
  return trimmed + suffix
}

/** Staff and agents use the same machinery but never take mononyms. */
export function formalName(name: GeneratedName): string {
  return `${name.firstName} ${name.lastName}`
}
