/**
 * Does a European run change a club's continental reputation?
 *
 * `continentalReputation` has been on every club since the world was first
 * generated. `awardContinentalStanding` was written to make it move on
 * results, and was never called — so until now it only ever drifted toward
 * domestic reputation, which made it a slightly laggy copy of a number the
 * club already had.
 *
 * This measures the spread: if the mechanism is doing anything, clubs that go
 * deep in Europe should end up rated above their domestic standing and clubs
 * that go out early should not.
 *
 * Run: `npx tsx scripts/contrepcheck.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'

const SEASONS = Number(process.env.SEASONS ?? 4)

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'CONT1', directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

for (let s = 0; s < SEASONS; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const clubs = Object.values(state.clubs)
const gaps = clubs.map((c) => c.continentalReputation - c.reputation)
const above = gaps.filter((g) => g > 0.5).length
const below = gaps.filter((g) => g < -0.5).length
const spread = Math.max(...gaps) - Math.min(...gaps)

console.log(`${SEASONS} seasons, ${clubs.length} clubs\n`)
console.log(`  continental reputation above domestic   ${above}`)
console.log(`  below                                   ${below}`)
console.log(`  level                                   ${clubs.length - above - below}`)
console.log(`  spread of the gap                       ${spread.toFixed(1)} points\n`)

const ranked = clubs.slice().sort(
  (a, b) => (b.continentalReputation - b.reputation) - (a.continentalReputation - a.reputation),
)
console.log('  most enhanced by Europe:')
for (const c of ranked.slice(0, 6)) {
  console.log(`    ${c.name.padEnd(26)} domestic ${String(c.reputation).padStart(3)}  `
    + `continental ${String(c.continentalReputation).padStart(3)}  (+${(c.continentalReputation - c.reputation).toFixed(0)})`)
}
