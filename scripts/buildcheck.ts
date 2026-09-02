/**
 * Do clubs build, and does it move the money?
 *
 * `scripts/hoardcheck.ts` established that AI clubs accumulate years of
 * turnover and spend almost none of it on the ground, and that the demand to
 * justify building is genuinely there in the top two tiers — a p90 fill of
 * 0.992 in tier 1, and the clamp in `computeAttendance` turning supporters
 * away. `expandStadium` is the answer to that. This checks it landed.
 *
 * Per tier, across a career: full houses per club per season, expansion
 * projects started, capacity at the end against capacity at the start, and the
 * balance in weeks of revenue — which is the number the whole exercise exists
 * to bring down.
 *
 * Run: `SEASONS=12 npx tsx scripts/buildcheck.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { weeklyRevenue } from '../src/engine/systems/finance'
import type { Club, GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'HOARD1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

const tierOf = (state: GameState, club: Club): number =>
  state.leagues[club.leagueId]?.tier ?? 0

const startCapacity = new Map<string, number>()
for (const club of Object.values(state.clubs)) {
  startCapacity.set(club.id, club.facilities.stadium.capacity)
}

/** Expansions counted as they start — a project is gone from the club once done. */
const expansions = new Map<number, number>()
const selloutTotals = new Map<number, number>()
const seen = new Set<string>()

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    for (const club of Object.values(state.clubs)) {
      const project = club.facilities.stadiumProject
      if (project && project.kind === 'expand' && !seen.has(project.id)) {
        seen.add(project.id)
        const tier = tierOf(state, club)
        expansions.set(tier, (expansions.get(tier) ?? 0) + 1)
      }
    }
    if (w === 50) {
      for (const club of Object.values(state.clubs)) {
        const tier = tierOf(state, club)
        const n = club.facilities.stadium.selloutsThisSeason
        selloutTotals.set(tier, (selloutTotals.get(tier) ?? 0) + n)
      }
    }
  }
}

const byTier = new Map<number, Club[]>()
for (const club of Object.values(state.clubs)) {
  const tier = tierOf(state, club)
  if (!tier) continue
  const list = byTier.get(tier) ?? []
  list.push(club)
  byTier.set(tier, list)
}

console.log(`${SEASONS} seasons, seed ${SEED}\n`)
console.log('  tier  clubs   sellouts/club/season   expansions   capacity now'
  + '   vs start   balance in weeks')
for (const [tier, clubs] of [...byTier].sort((a, b) => a[0] - b[0])) {
  const n = clubs.length
  const capNow = clubs.reduce((a, c) => a + c.facilities.stadium.capacity, 0) / n
  const capThen = clubs.reduce((a, c) => a + (startCapacity.get(c.id) ?? 0), 0) / n
  const weeks = clubs.reduce(
    (a, c) => a + c.finances.balance / Math.max(1, weeklyRevenue(state, c)), 0,
  ) / n
  console.log(
    `  ${String(tier).padStart(4)}${String(n).padStart(7)}`
    + `${((selloutTotals.get(tier) ?? 0) / n / SEASONS).toFixed(1).padStart(23)}`
    + `${String(expansions.get(tier) ?? 0).padStart(13)}`
    + `${Math.round(capNow).toLocaleString().padStart(15)}`
    + `${(capThen > 0 ? `${((capNow / capThen - 1) * 100).toFixed(1)}%` : '—').padStart(11)}`
    + `${weeks.toFixed(0).padStart(19)}`,
  )
}
