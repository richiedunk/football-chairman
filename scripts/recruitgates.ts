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
const per = (n: number) => (n / seasons).toFixed(0).padStart(9)
const share = (n: number) => `${((n / Math.max(1, stats.passes)) * 100).toFixed(1)}%`.padStart(7)

console.log(`seasons ${SETTLE + 1}-${SEASONS}, seed ${SEED}, world-wide, per season\n`)
console.log(`  chances to sign                 ${per(stats.passes)}`)
console.log(`  ...no registration place free   ${per(stats.squadFull)}  ${share(stats.squadFull)}`)
console.log(`  ...did not bother this week     ${per(stats.didNotBother)}  ${share(stats.didNotBother)}`)
console.log(`  ...looked, found nobody at all  ${per(stats.poolEmpty)}  ${share(stats.poolEmpty)}`)
console.log(`  ...SIGNED SOMEBODY              ${per(stats.signed)}  ${share(stats.signed)}`)
console.log(`        of them aged 21+          ${per(stats.signedAdult)}`)
console.log(`  emergencies (budget suspended)  ${per(stats.emergencies)}`)
console.log('\n  rejections, counted per candidate looked at rather than per pass:')
console.log(`    too good for the club         ${per(stats.aboveCeiling)}`)
console.log(`    beneath the club's standard   ${per(stats.belowFloor)}`)
console.log(`    WAGE WOULD NOT FIT BUDGET     ${per(stats.unaffordable)}`)
console.log(`    would not come                ${per(stats.unwilling)}`)
