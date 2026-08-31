/**
 * What actually happens to an academy player?
 *
 * The academy is the largest single flow in the game — roughly 1,340 players a
 * season across 238 clubs, 5.6 per club — and it is the upstream tap feeding
 * both the young drift and the ~1,700 permanently unemployed. Before changing
 * how many arrive, or adding a yearly cull, it is worth knowing where they go,
 * because the fix is completely different depending on the answer.
 *
 * Three questions:
 *   1. Of the boys who arrive, how many ever play a senior game? If almost
 *      none do, the intake is a fiction with a cost and the volume is the
 *      problem. If a reasonable share do, it is doing its job.
 *   2. How long do they stay? Real academies cut players every year and most
 *      are gone by sixteen. Here the only exits are the season-roll churn and
 *      a contract running out, which is a three-year sentence either way.
 *   3. Who is actually in the free-agent pool — released academy boys who
 *      never played, or professionals with a career behind them? A cull only
 *      helps the first case.
 *
 * Run: `npx tsx scripts/academycheck.ts` (SIZE, SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import type { GameState, Player } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 8)

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'ACAD1', directorName: 'A', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state: GameState = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

interface Fate {
  bornSeason: number
  promotedSeason: number | null
  playedSenior: boolean
  leftSeason: number | null
  /** How he left: released to the free market, or removed from the world. */
  leftAs: 'free' | 'gone' | null
}

const fates = new Map<string, Fate>()
const seen = new Set<string>()

function scan(season: number) {
  // New academy players.
  for (const p of Object.values(state.players)) {
    if (!seen.has(p.id) && p.isAcademy) {
      seen.add(p.id)
      fates.set(p.id, {
        bornSeason: season, promotedSeason: null, playedSenior: false,
        leftSeason: null, leftAs: null,
      })
    }
    const fate = fates.get(p.id)
    if (!fate) continue
    if (!p.isAcademy && fate.promotedSeason === null && p.clubId) fate.promotedSeason = season
    // A senior appearance is the only thing that makes an academy worth having.
    const apps = p.stats.appearances
      + p.careerStats.reduce((sum, r) => sum + r.appearances, 0)
    if (apps > 0) fate.playedSenior = true
    if (!p.clubId && fate.leftSeason === null && fate.promotedSeason === null) {
      fate.leftSeason = season
      fate.leftAs = 'free'
    }
  }
  // Anyone who has vanished from the world entirely.
  for (const [id, fate] of fates) {
    if (fate.leftSeason !== null) continue
    if (state.players[id]) continue
    fate.leftSeason = season
    fate.leftAs = 'gone'
  }
}

scan(state.date.season)
for (let s = 0; s < SEASONS; s++) {
  const season = state.date.season
  for (let w = 0; w < 52; w++) advanceWeek(state, deps)
  scan(season)
}

const all = [...fates.values()]
const promoted = all.filter((f) => f.promotedSeason !== null)
const played = all.filter((f) => f.playedSenior)
const releasedFree = all.filter((f) => f.leftAs === 'free')
const deleted = all.filter((f) => f.leftAs === 'gone')
const still = all.filter((f) => f.leftSeason === null && f.promotedSeason === null)

const pct = (n: number) => `${((n / all.length) * 100).toFixed(1)}%`

console.log(`world ${SIZE}: ${Object.keys(state.clubs).length} clubs, ${SEASONS} seasons\n`)
console.log(`academy players created:      ${all.length}`)
console.log(`  promoted to the seniors:    ${promoted.length}  ${pct(promoted.length)}`)
console.log(`  ever played a senior game:  ${played.length}  ${pct(played.length)}`)
console.log(`  released to the free market: ${releasedFree.length}  ${pct(releasedFree.length)}`)
console.log(`  removed from the world:     ${deleted.length}  ${pct(deleted.length)}`)
console.log(`  still in an academy:        ${still.length}  ${pct(still.length)}`)

const years = promoted
  .map((f) => (f.promotedSeason ?? 0) - f.bornSeason)
  .filter((n) => n >= 0)
if (years.length) {
  years.sort((a, b) => a - b)
  console.log(`\nyears in the academy before promotion: median ${years[Math.floor(years.length / 2)]}`
    + `, max ${years[years.length - 1]}`)
}

// Who is actually unemployed out there?
const free = Object.values(state.players).filter((p) => !p.clubId && !p.isAcademy)
const neverPlayed = free.filter((p: Player) =>
  p.stats.appearances + p.careerStats.reduce((s, r) => s + r.appearances, 0) === 0)
console.log(`\nfree agents right now: ${free.length}`)
console.log(`  never played a senior game: ${neverPlayed.length}`
  + ` (${((neverPlayed.length / Math.max(1, free.length)) * 100).toFixed(0)}%)`)
console.log(`  professionals with a career behind them: ${free.length - neverPlayed.length}`)
const ages = free.map((p) => p.age).sort((a, b) => a - b)
if (ages.length) {
  console.log(`  age: median ${ages[Math.floor(ages.length / 2)]},`
    + ` under 23 ${((ages.filter((a) => a < 23).length / ages.length) * 100).toFixed(0)}%`)
}

const academyNow = Object.values(state.clubs).map((c) =>
  c.squad.filter((id) => state.players[id]?.isAcademy).length)
console.log(`\nacademy players per club right now:`
  + ` mean ${(academyNow.reduce((a, b) => a + b, 0) / academyNow.length).toFixed(1)},`
  + ` max ${Math.max(...academyNow)}`)
