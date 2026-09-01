/**
 * Does the wage budget keep pace with the world, or does it squeeze the squad?
 *
 * The live hypothesis for the young drift, and the one thing `docs/bugs.md`
 * says must be measured before anything in recruitment is touched again. Five
 * fixes have failed, and every one of them raised the inflow of professionals
 * only to see the outflow rise to match. That is the signature of a *budget*
 * constraint rather than a supply or willingness one: if a club can afford
 * about twenty-four players' wages, then cheap arrivals force existing
 * professionals out at renewal, and the age composition drifts young because
 * young players are cheap.
 *
 * So this measures the money, not the recruitment. Per season, per tier:
 *
 *   - revenue, the wage budget, and the wage bill, all weekly;
 *   - the budget as a share of revenue, which is where the squeeze would show;
 *   - what a squad place actually costs — the bill divided by the players;
 *   - the age split, so the two can be read against each other.
 *
 * If the budget keeps pace with revenue and the cost per place is flat, the
 * hypothesis is wrong and the drift is somewhere else. If the budget is
 * falling behind — or if the cost of an adult professional is rising faster
 * than the budget — then the squad is being priced down into its academy and
 * nothing in `aiSquad.ts` will ever fix it.
 *
 * Run: `SEASONS=12 npx tsx scripts/wagedrift.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { weeklyRevenue, facilityUpkeep } from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { Club, GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'WAGE1'
const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard'
// Deep mid-season: after recruiting has run all summer and before the roll
// empties every expiring contract on one afternoon. Reading a squad at week
// one is how this project has misdiagnosed the same thing twice.
const SAMPLE_WEEK = 26

interface Row {
  season: number
  tier: number
  clubs: number
  revenue: number
  budget: number
  bill: number
  upkeep: number
  squad: number
  adults: number
  adultWage: number
  youthWage: number
}

const rows: Row[] = []

function sample(state: GameState, season: number): void {
  const byTier = new Map<number, Club[]>()
  for (const club of Object.values(state.clubs)) {
    const league = state.leagues[club.leagueId]
    if (!league) continue
    const list = byTier.get(league.tier) ?? []
    list.push(club)
    byTier.set(league.tier, list)
  }

  for (const [tier, clubs] of [...byTier].sort((a, b) => a[0] - b[0])) {
    let revenue = 0, budget = 0, bill = 0, upkeep = 0, squad = 0, adults = 0
    let adultWageSum = 0, adultCount = 0, youthWageSum = 0, youthCount = 0

    for (const club of clubs) {
      revenue += weeklyRevenue(state, club)
      budget += club.finances.wageBudget
      bill += totalWageBill(state, club)
      upkeep += facilityUpkeep(state, club)
      for (const id of club.squad) {
        const p = state.players[id]
        if (!p || p.isAcademy) continue
        squad++
        const wage = p.contract?.wage ?? 0
        if (p.age >= 21) { adults++; adultWageSum += wage; adultCount++ }
        else { youthWageSum += wage; youthCount++ }
      }
    }

    const n = clubs.length
    rows.push({
      season, tier, clubs: n,
      revenue: revenue / n, budget: budget / n, bill: bill / n, upkeep: upkeep / n,
      squad: squad / n, adults: adults / n,
      adultWage: adultCount ? adultWageSum / adultCount : 0,
      youthWage: youthCount ? youthWageSum / youthCount : 0,
    })
  }
}

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (w === SAMPLE_WEEK) sample(state, s + 1)
  }
}

const money = (n: number) => Math.round(n).toLocaleString().padStart(9)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`.padStart(6)

console.log(`${SEASONS} seasons, seed ${SEED}, ${SIZE} world, sampled at week ${SAMPLE_WEEK}\n`)

const tiers = [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b)
for (const tier of tiers) {
  const mine = rows.filter((r) => r.tier === tier)
  console.log(`=== tier ${tier} (${mine[0].clubs} clubs) — weekly, per club`)
  console.log('  season   revenue    upkeep    budget      bill  bud/rev  bill/bud'
    + '   squad  21+   £/adult   £/youth')
  for (const r of mine) {
    console.log(
      `  ${String(r.season).padStart(6)}`
      + ` ${money(r.revenue)} ${money(r.upkeep)} ${money(r.budget)} ${money(r.bill)}`
      + `  ${pct(r.budget / Math.max(1, r.revenue))}   ${pct(r.bill / Math.max(1, r.budget))}`
      + `  ${r.squad.toFixed(1).padStart(5)} ${r.adults.toFixed(1).padStart(4)}`
      + ` ${money(r.adultWage)} ${money(r.youthWage)}`,
    )
  }
  const first = mine[0], last = mine[mine.length - 1]
  console.log(
    `  change   ${pct(last.revenue / Math.max(1, first.revenue) - 1)} revenue`
    + `   ${pct(last.budget / Math.max(1, first.budget) - 1)} budget`
    + `   ${pct(last.adultWage / Math.max(1, first.adultWage) - 1)} adult wage`
    + `   ${(last.adults - first.adults).toFixed(1)} adults\n`,
  )
}
