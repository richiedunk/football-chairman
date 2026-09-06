/**
 * Which gate stops a non-league club signing a grown man?
 *
 * Four of five divisions now meet the acceptance target of eight players aged
 * 24-31 per club. Tier 5 sits at 5.7, with 10.8 under-21s in a 22.9-man squad
 * — 47% teenagers, in a division whose real counterpart is mostly full-time
 * professionals. `recruitgates.ts` says those clubs go looking 1,150 times a
 * season and find nobody 79% of the time.
 *
 * `recruitOne` carries an explicit instruction, put there after the ability
 * ceiling was lifted once on bad evidence and had to be reverted:
 *
 *   "Do not lift it again without a measurement that says which clubs it
 *    blocks."
 *
 * That is what this is. The rejection tallies in `recruitgates.ts` cannot
 * answer it — they count rejections across repeated scans of the same pool, so
 * one unsignable player rejected a thousand times looks like a thousand
 * problems. This counts *distinct players* instead, against a *specific club*,
 * gate by gate in the order `recruitOne` applies them:
 *
 *   in the pool -> aged 24-31 -> under the ability ceiling -> affordable
 *
 * Tier 4 is reported alongside as the control. It clears the target on the
 * same pool through the same code, so whatever separates the two divisions is
 * the answer, and anything true of both is not.
 *
 * Run: `SEASONS=14 npx tsx scripts/primesupply.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { abilityCeilingFor } from '../src/engine/world/playerGen'
import { computeWageDemand, totalWageBill } from '../src/engine/systems/valuation'
import type { GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 14)
const SETTLE = Number(process.env.SETTLE ?? 10)
const SEED = process.env.SEED ?? 'AGE1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

interface Gates {
  clubs: number
  free: number
  prime: number
  underCeiling: number
  affordable: number
  ceiling: number
  headroom: number
  squadBest: number
}

const gates = new Map<number, Gates>()
const blank = (): Gates => ({
  clubs: 0, free: 0, prime: 0, underCeiling: 0, affordable: 0,
  ceiling: 0, headroom: 0, squadBest: 0,
})

function sample(state: GameState): void {
  const free = Object.values(state.players).filter((p) => !p.clubId)
  const prime = free.filter((p) => p.age >= 24 && p.age <= 31)

  for (const club of Object.values(state.clubs)) {
    const tier = state.leagues[club.leagueId]?.tier
    if (!tier) continue
    const g = gates.get(tier) ?? blank()
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]
    const ceiling = abilityCeilingFor(club.reputation)
    const wageBill = totalWageBill(state, club)
    const room = club.finances.wageBudget - wageBill

    // The same two gates `recruitOne` applies, in the same order, to the same
    // pool — but counting players rather than rejections.
    const under = prime.filter((p) => p.currentAbility <= ceiling * 1.02)
    const afford = under.filter(
      (p) => wageBill + Math.max(90, Math.round(computeWageDemand(p, league, nation)))
        <= club.finances.wageBudget,
    )

    const squad = seniorSquad(state, club)
    const best = squad.reduce((m, p) => Math.max(m, p.currentAbility), 0)

    g.clubs++
    g.free += free.length
    g.prime += prime.length
    g.underCeiling += under.length
    g.affordable += afford.length
    g.ceiling += ceiling
    g.headroom += room
    g.squadBest += best
    gates.set(tier, g)
  }
}

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (s >= SETTLE && w === 30) sample(state)
  }
}

console.log(`seasons ${SETTLE + 1}-${SEASONS}, seed ${SEED}, mid-season`)
console.log('distinct free agents aged 24-31 that a club of this division could actually sign\n')
console.log('  tier   in the pool   aged 24-31   under ceiling   affordable |'
  + '   its ceiling   best player   wage room')
for (const [tier, g] of [...gates].sort((a, b) => a[0] - b[0])) {
  const per = (v: number) => (v / g.clubs).toFixed(0).padStart(11)
  console.log(
    `  ${String(tier).padStart(4)}${per(g.free)}${per(g.prime)}${per(g.underCeiling)}`
    + `${per(g.affordable)} |${(g.ceiling / g.clubs).toFixed(0).padStart(13)}`
    + `${(g.squadBest / g.clubs).toFixed(0).padStart(14)}`
    + `${Math.round(g.headroom / g.clubs).toLocaleString().padStart(12)}`,
  )
}
