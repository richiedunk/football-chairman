/**
 * When a club has a place and money, why does it not sign a grown man?
 *
 * The question the rest of the drift work could not answer. A tier 5 club
 * settles at twenty players of whom 3.6 are aged 24 to 31, with seventeen
 * hundred free agents unsigned and £3.98m in the bank. Something is refusing
 * them, and there are six candidate gates in `recruitOne`.
 *
 * Guessing which has been wrong before, twice, in this exact system: the
 * ability ceiling was blamed and cleared by `stuckclubs.ts`, and the squad
 * target was blamed and cleared. So the gates count themselves, and this reads
 * the tally back per tier.
 *
 * Run: `SEASONS=12 npx tsx scripts/recruitgates.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { newRecruitStats, type RecruitStats } from '../src/engine/systems/aiSquad'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SETTLE = Number(process.env.SETTLE ?? 8)
const SEED = process.env.SEED ?? 'GATE1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

// Settle first. The interesting behaviour is at equilibrium, not during the
// six-to-twelve seasons the world spends finding its level.
for (let s = 0; s < SETTLE; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const stats: RecruitStats = newRecruitStats()
for (let s = 0; s < SEASONS - SETTLE; s++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names, recruitStats: stats })
  }
}

const seasons = SEASONS - SETTLE

console.log(`seasons ${SETTLE + 1}-${SEASONS}, seed ${SEED}, per season, BY TIER\n`)
console.log('tier  chances  no place  skipped  FOUND NOBODY   signed  of them 21+ |'
  + '   rejected: too good   unaffordable   would not come')
for (const tier of [...stats.byTier.keys()].sort((a, b) => a - b)) {
  const t = stats.byTier.get(tier)!
  const n = (x: number) => (x / seasons).toFixed(0).padStart(7)
  const pc = (x: number) => `${((x / Math.max(1, t.passes)) * 100).toFixed(0)}%`.padStart(4)
  console.log(
    `${String(tier).padStart(4)} ${n(t.passes)}   ${n(t.squadFull)}  ${n(t.didNotBother)}`
    + `  ${n(t.poolEmpty)} ${pc(t.poolEmpty)}  ${n(t.signed)}      ${n(t.signedAdult)} |`
    + `   ${n(t.aboveCeiling)}      ${n(t.unaffordable)}      ${n(t.unwilling)}`,
  )
}
