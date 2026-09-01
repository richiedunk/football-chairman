/**
 * Why does the world take longer and longer to climb out of the season roll?
 *
 * The roll empties every expiring contract on one afternoon, and the weeks
 * that follow are the world putting itself back together. `docs/bugs.md`
 * records the gap between the mid-season squad and the squad at the roll
 * widening from 0.3 players in season one to 3.1 by season twelve, and names
 * three candidates without choosing between them: contract lengths bunching at
 * world generation, the renewal pass letting too many players reach expiry at
 * all, and the per-week limits on free-agent recruitment.
 *
 * So this watches the recovery itself rather than its outcome. For each season
 * it records the drop at the roll and then, week by week, how fast the squads
 * refill — and alongside it the three things that could be throttling them:
 *
 *   - how many players are unattached and looking, which is supply;
 *   - how many contracts expired at the roll, which is the size of the hole;
 *   - how many clubs are at or over their wage budget, which is whether they
 *     can afford to fill it.
 *
 * If recovery slows while supply is plentiful and budgets are fine, the limit
 * is in the recruitment loop. If it slows while budgets are pinned, this is
 * the same wage-budget story `wagedrift.ts` found and not a separate defect.
 *
 * Run: `SEASONS=12 npx tsx scripts/rollcheck.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'ROLL1'
/** Weeks after the roll to watch the refill over. */
const WATCH = 16

function seniorSquads(state: GameState): number {
  let total = 0, clubs = 0
  for (const club of Object.values(state.clubs)) {
    clubs++
    for (const id of club.squad) {
      const p = state.players[id]
      if (p && !p.isAcademy) total++
    }
  }
  return total / Math.max(1, clubs)
}

function overBudget(state: GameState): number {
  let n = 0
  for (const club of Object.values(state.clubs)) {
    if (totalWageBill(state, club) >= club.finances.wageBudget) n++
  }
  return n
}

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

/**
 * One continuous weekly series rather than per-season buckets.
 *
 * The first version of this tried to start a watch at the roll and carry it
 * into the weeks after, and recorded nothing at all: the watch opened on the
 * last week of a season and the loop that would have filled it had already
 * ended. It also measured "weeks to recover" against the previous season's
 * peak, which in a world that shrinks year on year is a target that can never
 * be reached — every row read "never", which looks like a finding and is an
 * artefact of the question.
 */
interface Tick {
  season: number; week: number; squad: number; free: number; tight: number
  freeAdults: number; freeAdultWage: number; signedRate: number
}
const series: Tick[] = []

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    const pool = Object.values(state.players).filter((p) => !p.clubId && !p.isAcademy)
    const adults = pool.filter((p) => p.age >= 21)
    series.push({
      season: state.date.season - 2025 + 1,
      week: state.date.week,
      squad: seniorSquads(state),
      free: pool.length,
      tight: overBudget(state),
      freeAdults: adults.length,
      freeAdultWage: adults.length
        ? adults.reduce((sum, p) => sum + (p.wageDemand ?? 0), 0) / adults.length
        : 0,
      signedRate: 0,
    })
  }
}

const clubs = Object.keys(state.clubs).length
const bySeason = new Map<number, Tick[]>()
for (const t of series) {
  const list = bySeason.get(t.season) ?? []
  list.push(t)
  bySeason.set(t.season, list)
}

console.log(`${SEASONS} seasons, seed ${SEED}, ${clubs} clubs\n`)
console.log('season   peak   week 1   hole  wks back to peak-1   free agents  at/over budget')
const seasonList = [...bySeason.entries()].sort((a, b) => a[0] - b[0])
for (const [season, ticks] of seasonList) {
  const peak = Math.max(...ticks.map((t) => t.squad))
  const first = ticks.find((t) => t.week === 1)
  if (!first) continue
  // Back to within one player of this season's own peak, which is a target
  // that exists, unlike last season's.
  const target = peak - 1
  const idx = ticks.findIndex((t) => t.week > 1 && t.squad >= target)
  console.log(
    `${String(season).padStart(6)}  ${peak.toFixed(1).padStart(5)}`
    + `  ${first.squad.toFixed(1).padStart(7)}  ${(peak - first.squad).toFixed(1).padStart(5)}`
    + `  ${(idx === -1 ? 'never' : String(ticks[idx].week)).padStart(18)}`
    + `  ${String(first.free).padStart(12)}  ${`${first.tight}/${clubs}`.padStart(14)}`,
  )
}

console.log('\nsenior squad, week by week after each roll:')
console.log('season ' + Array.from({ length: WATCH }, (_, i) => String(i + 1).padStart(5)).join(''))
for (const [season, ticks] of seasonList) {
  const row = ticks.filter((t) => t.week <= WATCH).sort((a, b) => a.week - b.week)
  console.log(String(season).padStart(6) + ' ' + row.map((t) => t.squad.toFixed(1).padStart(5)).join(''))
}

// Who is left on the shelf once the market stops moving.
//
// The question the rest of this cannot answer: clubs stop signing while
// hundreds of players are still available, so either those players are
// unwanted or they are unaffordable. If the leftovers are overwhelmingly adult
// and their wage demands are high, this is the same wage-budget story as
// `wagedrift.ts` and not a second defect.
console.log('\nwho is left unattached at week 16, and what they want:')
console.log('season   unattached   of them 21+    share   mean adult demand')
for (const [season, ticks] of seasonList) {
  const t = ticks.find((x) => x.week === 16)
  if (!t) continue
  console.log(
    `${String(season).padStart(6)}   ${String(t.free).padStart(10)}`
    + `   ${String(t.freeAdults).padStart(11)}`
    + `   ${`${Math.round((t.freeAdults / Math.max(1, t.free)) * 100)}%`.padStart(6)}`
    + `   ${Math.round(t.freeAdultWage).toLocaleString().padStart(17)}`,
  )
}

console.log('\nfree agents still unattached, same weeks:')
console.log('season ' + Array.from({ length: WATCH }, (_, i) => String(i + 1).padStart(6)).join(''))
for (const [season, ticks] of seasonList) {
  const row = ticks.filter((t) => t.week <= WATCH).sort((a, b) => a.week - b.week)
  console.log(String(season).padStart(6) + ' ' + row.map((t) => String(t.free).padStart(6)).join(''))
}
