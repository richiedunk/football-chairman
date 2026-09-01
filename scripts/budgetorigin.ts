/**
 * Where does a club's *opening* wage budget come from, and does it agree with
 * the one the board sets every season after that?
 *
 * `wagedrift.ts` shows the symptom: season one opens at 128% of revenue in
 * tier 3, 143% in tier 4 and 158% in tier 5, then collapses by around 60% in
 * season two. This says why. It generates a world, reads the budget world
 * generation handed out, then runs the ordinary board routine
 * (`recalculateBudgets`) over the very same untouched world and prints both.
 *
 * If the two agree, the opening budget is honest and the cliff is somewhere
 * else. If they disagree, the opening budget is being set by a formula that
 * nobody uses again, and the season-two "collapse" is simply the first time
 * the real one runs.
 *
 * The columns exist to identify *which* input is unrepresentative:
 *
 *   - `revenue` is `weeklyRevenue` — tv, sponsorship and matchday, the only
 *     income the board ever budgets against;
 *   - `scale` is the synthetic `revenueScale` world generation invents from
 *     reputation alone, recovered from the shirt deal it also sizes (9% of
 *     scale per season). If `scale` and `revenue` diverge by tier, then a
 *     fixed share of one is not a fixed share of the other;
 *   - `upkeep` is what the club spends before a penny reaches a player, which
 *     the board subtracts and world generation does not;
 *   - `floor` is the share of clubs whose budget lands on the floor under it —
 *     the wage bill they have already committed — rather than on an allowance
 *     their income could support. A club on the floor cannot sign anybody.
 *
 * Run: `npx esbuild --bundle --platform=node --format=esm scripts/budgetorigin.ts
 *       --outfile=/tmp/bo.mjs && node /tmp/bo.mjs`  (SEED, SIZE, SEEDS)
 */
import { prepareNewGame } from '../src/engine/newGame'
import {
  facilityUpkeep, recalculateBudgets, weeklyRevenue,
} from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { Club, GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard'
const SEEDS = Number(process.env.SEEDS ?? 10)
const SEED = process.env.SEED ?? 'BUD'

interface Acc {
  clubs: number
  revenue: number
  scale: number
  upkeep: number
  bill: number
  generated: number
  boardSet: number
  genTransfer: number
  boardTransfer: number
  onFloor: number
}

const tiers = new Map<number, Acc>()

function acc(tier: number): Acc {
  let a = tiers.get(tier)
  if (!a) {
    a = {
      clubs: 0, revenue: 0, scale: 0, upkeep: 0, bill: 0,
      generated: 0, boardSet: 0, genTransfer: 0, boardTransfer: 0,
      onFloor: 0,
    }
    tiers.set(tier, a)
  }
  return a
}

function measure(state: GameState): void {
  for (const club of Object.values(state.clubs) as Club[]) {
    const league = state.leagues[club.leagueId]
    if (!league) continue
    const a = acc(league.tier)

    const revenue = weeklyRevenue(state, club)
    const bill = totalWageBill(state, club)
    const generated = club.finances.wageBudget
    // `revenueScale` is not stored, but the shirt deal is exactly 9% of it,
    // rounded to the nearest thousand — close enough to name the culprit.
    const scale = club.finances.sponsorship.shirtValuePerSeason / 0.09

    a.clubs++
    a.revenue += revenue
    a.scale += scale / 52
    a.upkeep += facilityUpkeep(state, club)
    a.bill += bill
    a.generated += generated
    a.genTransfer += club.finances.transferBudget
    // The counterfactual: the board's own routine, on this same world, before
    // a single week has been played.
    recalculateBudgets(state, club)
    a.boardSet += club.finances.wageBudget
    a.boardTransfer += club.finances.transferBudget
    // A club whose budget lands on the wage floor has no room to sign anybody
    // and is being carried by its own existing contracts, not by its income.
    if (club.finances.wageBudget <= Math.round(bill * 1.05) + 1) a.onFloor++
  }
}

for (let i = 0; i < SEEDS; i++) {
  const setup = prepareNewGame({
    seed: `${SEED}${i}`, directorName: 'D', background: 'scout',
    worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
  })
  measure(setup.state)
}

const money = (n: number) => Math.round(n).toLocaleString().padStart(9)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`.padStart(7)

console.log(`${SEEDS} seeds, ${SIZE} world, measured at generation before any week is played\n`)
console.log('  tier  clubs   revenue     scale    upkeep      bill  generated  gen/rev'
  + '   board  brd/rev  floor      gen tfr  board tfr')
for (const [tier, a] of [...tiers].sort((x, y) => x[0] - y[0])) {
  const n = a.clubs
  console.log(
    `  ${String(tier).padStart(4)} ${String(n).padStart(6)}`
    + ` ${money(a.revenue / n)} ${money(a.scale / n)} ${money(a.upkeep / n)} ${money(a.bill / n)}`
    + ` ${money(a.generated / n)} ${pct(a.generated / Math.max(1, a.revenue))}`
    + ` ${money(a.boardSet / n)} ${pct(a.boardSet / Math.max(1, a.revenue))}`
    + ` ${String(Math.round((a.onFloor / n) * 100)).padStart(5)}%`
    + ` ${money(a.genTransfer / n)} ${money(a.boardTransfer / n)}`,
  )
}
console.log('\n  scale = revenueScale/52, the reputation-only proxy generation budgets from')
console.log('  gen   = the budget world generation handed out')
console.log('  board = what recalculateBudgets sets on the same untouched world')
