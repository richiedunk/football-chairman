/**
 * Clubs are given money to spend. Why does it stay in the bank?
 *
 * `scripts/hoardcheck.ts` established the hoard — 300-odd weeks of revenue
 * sitting in the account after thirty seasons — and stadium building turned
 * out to absorb only a fraction of it. The obvious next suspect was that the
 * wage budget is a share of *revenue* and therefore cannot see a bank balance
 * at all, which is true, but it is not the whole story: `recalculateBudgets`
 * already releases 15-75% of reserves into the transfer budget, so on paper
 * these clubs are handed a fortune every season.
 *
 * Guessing which constraint binds has been wrong twice in this project
 * already, so this counts rather than reasons. Per tier, at equilibrium:
 * what the board granted, what was actually spent, and what the wage room
 * looks like — because a transfer budget is worthless to a club that cannot
 * fit another wage in.
 *
 * Run: `SEASONS=14 npx tsx scripts/spendcheck.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { weeklyRevenue, facilityUpkeep } from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 14)
const SETTLE = Number(process.env.SETTLE ?? 10)
const SEED = process.env.SEED ?? 'HOARD1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

interface Tally {
  n: number
  granted: number
  spentIn: number
  soldOut: number
  wageBudget: number
  wageBill: number
  balance: number
  revenue: number
  upkeep: number
  headroomZero: number
  inCrisis: number
  debt: number
}

const tallies = new Map<number, Tally>()
const blank = (): Tally => ({
  n: 0, granted: 0, spentIn: 0, soldOut: 0, wageBudget: 0, wageBill: 0,
  balance: 0, revenue: 0, upkeep: 0, headroomZero: 0, inCrisis: 0, debt: 0,
})

function sample(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const tier = state.leagues[club.leagueId]?.tier
    if (!tier) continue
    const t = tallies.get(tier) ?? blank()
    const bill = totalWageBill(state, club)
    t.n++
    t.granted += club.finances.transferBudget
    t.spentIn += club.finances.season.transfersIn
    t.soldOut += club.finances.season.transfersOut
    t.wageBudget += club.finances.wageBudget
    t.wageBill += bill
    t.balance += club.finances.balance
    t.revenue += weeklyRevenue(state, club)
    t.upkeep += facilityUpkeep(state, club)
    t.debt += club.finances.debt
    if (club.finances.inCrisis) t.inCrisis++
    // A club whose bill is at or over its allowance has no room for anybody,
    // whatever the transfer budget says.
    if (bill >= club.finances.wageBudget * 0.98) t.headroomZero++
    tallies.set(tier, t)
  }
}

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (s >= SETTLE && w === 50) sample(state)
  }
}

const m = (n: number) => Math.round(n).toLocaleString()

console.log(`${SEASONS} seasons, seed ${SEED}, sampled at week 50 from season ${SETTLE + 1}\n`)
for (const [tier, t] of [...tallies].sort((a, b) => a[0] - b[0])) {
  const per = (v: number) => v / t.n
  console.log(`=== tier ${tier}   (${t.n} club-seasons sampled)`)
  console.log(`  transfer budget granted   ${m(per(t.granted)).padStart(14)}`)
  console.log(`  actually spent, in        ${m(per(t.spentIn)).padStart(14)}`
    + `   (${((per(t.spentIn) / Math.max(1, per(t.granted))) * 100).toFixed(0)}% of it)`)
  console.log(`  recouped, out             ${m(per(t.soldOut)).padStart(14)}`)
  console.log(`  balance                   ${m(per(t.balance)).padStart(14)}`)
  console.log(`  weekly revenue            ${m(per(t.revenue)).padStart(14)}`)
  console.log(`  weekly upkeep             ${m(per(t.upkeep)).padStart(14)}`)
  console.log(`  weekly wage budget        ${m(per(t.wageBudget)).padStart(14)}`)
  console.log(`  weekly wage bill          ${m(per(t.wageBill)).padStart(14)}`
    + `   (${((per(t.wageBill) / Math.max(1, per(t.wageBudget))) * 100).toFixed(0)}% of the allowance)`)
  console.log(`  wage budget as % revenue  ${((per(t.wageBudget) / Math.max(1, per(t.revenue))) * 100).toFixed(0).padStart(13)}%`)
  console.log(`  no wage room at all       ${((t.headroomZero / t.n) * 100).toFixed(0).padStart(13)}% of clubs`)
  console.log(`  in financial crisis       ${((t.inCrisis / t.n) * 100).toFixed(0).padStart(13)}% of clubs`)
  console.log(`  debt                      ${m(per(t.debt)).padStart(14)}\n`)
}
