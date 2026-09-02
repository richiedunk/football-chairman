/**
 * Why do clubs end up sitting on money they never spend?
 *
 * Measured while chasing the young drift: after twelve seasons the mean club
 * balance is **£207m in the top flight and £30m in the third tier**, and
 * nothing in the game makes a club spend it down. In a game about being a
 * director of football, money that cannot move is a defect on its own terms —
 * and possibly the same defect as the wage budgets, which are capped as a
 * share of *revenue* and therefore never notice a bank account at all.
 *
 * So this follows the cash rather than the squad. Per tier per season: every
 * line of the ledger, the surplus it produces, and what the balance does as a
 * result — expressed in weeks of revenue, because £207m means nothing without
 * knowing what a week costs.
 *
 * What it should show if hoarding is real: a persistent surplus, and a balance
 * measured in years of turnover rather than weeks.
 *
 * The second half asks the follow-up question: if clubs will not spend, is it
 * because nothing is asking them to? A club builds when its ground is full, so
 * this samples `computeAttendance` — the real one, not a copy — across every
 * fixture-shaped pairing in each tier and reports the distribution of fill.
 *
 * Run: `SEASONS=12 npx tsx scripts/hoardcheck.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { ledgerIncome, ledgerExpenditure, weeklyRevenue } from '../src/engine/systems/finance'
import { computeAttendance } from '../src/engine/sim/match'
import { Rng } from '../src/engine/rng'
import type { Club, GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'HOARD1'

interface Row {
  season: number
  tier: number
  income: number
  spend: number
  balance: number
  debt: number
  weeklyRev: number
  transfersOut: number
  facilities: number
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
    let income = 0, spend = 0, balance = 0, debt = 0, rev = 0, out = 0, fac = 0
    for (const club of clubs) {
      const l = club.finances.season
      income += ledgerIncome(l)
      spend += ledgerExpenditure(l)
      balance += club.finances.balance
      debt += club.finances.debt
      rev += weeklyRevenue(state, club)
      out += l.transfersOut
      fac += l.facilitiesSpend
    }
    const n = clubs.length
    rows.push({
      season, tier,
      income: income / n, spend: spend / n, balance: balance / n, debt: debt / n,
      weeklyRev: rev / n, transfersOut: out / n, facilities: fac / n,
    })
  }
}

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    // Week 50, before the roll closes and resets the ledger.
    if (w === 50) sample(state, s + 1)
  }
}

/**
 * Every club at home to every other club in its own league, which is the
 * fixture list. Fill, not attendance, because the question is whether the
 * ground runs out of room.
 */
function fills(state: GameState): Map<number, number[]> {
  const rng = new Rng('FILL')
  const byLeague = new Map<string, Club[]>()
  for (const club of Object.values(state.clubs)) {
    const list = byLeague.get(club.leagueId) ?? []
    list.push(club)
    byLeague.set(club.leagueId, list)
  }
  const out = new Map<number, number[]>()
  for (const [leagueId, clubs] of byLeague) {
    const league = state.leagues[leagueId]
    if (!league) continue
    const seen = out.get(league.tier) ?? []
    for (const home of clubs) {
      for (const away of clubs) {
        if (home.id === away.id) continue
        seen.push(computeAttendance(home, away, rng, false) / home.facilities.stadium.capacity)
      }
    }
    out.set(league.tier, seen)
  }
  return out
}

const m = (n: number) => Math.round(n).toLocaleString().padStart(12)

console.log(`${SEASONS} seasons, seed ${SEED}, sampled at week 50\n`)
for (const tier of [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b)) {
  const mine = rows.filter((r) => r.tier === tier)
  console.log(`=== tier ${tier} — per club, whole season unless marked`)
  console.log('  season       income        spend      surplus      balance         debt'
    + '   balance in weeks of revenue')
  for (const r of mine) {
    const surplus = r.income - r.spend
    console.log(
      `  ${String(r.season).padStart(6)}${m(r.income)}${m(r.spend)}${m(surplus)}`
      + `${m(r.balance)}${m(r.debt)}`
      + `   ${(r.balance / Math.max(1, r.weeklyRev)).toFixed(0).padStart(10)}`,
    )
  }
  const z = mine[mine.length - 1]
  console.log(`  spent on transfers ${m(z.transfersOut)}   on facilities ${m(z.facilities)}\n`)
}

console.log('=== how full the grounds get, after the last season')
console.log('  tier     mean      p90      max   fanbase   over 0.95')
for (const [tier, seen] of [...fills(state)].sort((a, b) => a[0] - b[0])) {
  const sorted = [...seen].sort((a, b) => a - b)
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const fanbase = Object.values(state.clubs)
    .filter((c) => state.leagues[c.leagueId]?.tier === tier)
  console.log(
    `  ${String(tier).padStart(4)}${mean.toFixed(3).padStart(9)}`
    + `${sorted[Math.floor(sorted.length * 0.9)].toFixed(3).padStart(9)}`
    + `${sorted[sorted.length - 1].toFixed(3).padStart(9)}`
    + `${(fanbase.reduce((a, c) => a + c.fanbase, 0) / fanbase.length).toFixed(1).padStart(10)}`
    + `${String(sorted.filter((f) => f > 0.95).length).padStart(12)}`,
  )
}
