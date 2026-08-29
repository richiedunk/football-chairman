import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { weeklyRevenue } from '../src/engine/systems/finance'

/**
 * Transfer market volume, against the real thing.
 *
 * A Premier League club makes roughly six to eight permanent signings across
 * a season's two windows, plus loans. Anything an order of magnitude below
 * that leaves clubs unable to spend what they earn, which is what was
 * happening: half a signing per club per season across the whole world.
 */
const setup = prepareNewGame({
  seed: 'MKT', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const clubCount = Object.keys(state.clubs).length

const money = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : `${Math.round(n / 1000)}k`

let seen = new Set<string>()
const perSeason: Record<number, { permanent: number; loan: number; free: number; spend: number }> = {}

for (let s = 1; s <= 8; s++) {
  const season = state.date.season
  perSeason[season] = { permanent: 0, loan: 0, free: 0, spend: 0 }
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    // The completed-transfer log is capped, so it is sampled every week
    // rather than read once at the end.
    for (const t of state.completedTransfers) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      const bucket = perSeason[t.season]
      if (!bucket) continue
      if (t.kind === 'loan' || t.kind === 'loanWithOption') bucket.loan += 1
      else if (t.fee === 0) bucket.free += 1
      else { bucket.permanent += 1; bucket.spend += t.fee }
    }
  }
  if (seen.size > 40_000) seen = new Set()

  const b = perSeason[season]
  const balances = Object.values(state.clubs).map((c) => c.finances.balance)
  const avgBalance = balances.reduce((a, x) => a + x, 0) / balances.length
  const topFlight = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === 1)!
  const topBalance = topFlight.clubIds.reduce((a, id) => a + state.clubs[id].finances.balance, 0) / topFlight.clubIds.length
  const topRevenue = topFlight.clubIds.reduce((a, id) => a + weeklyRevenue(state, state.clubs[id]) * 52, 0) / topFlight.clubIds.length

  console.log(
    `season ${s}  permanent ${String(b.permanent).padStart(4)} (${(b.permanent / clubCount).toFixed(1)}/club)  `
    + `free ${String(b.free).padStart(4)} (${(b.free / clubCount).toFixed(1)})  `
    + `loans ${String(b.loan).padStart(4)} (${(b.loan / clubCount).toFixed(1)})  `
    + `spend ${money(b.spend).padStart(7)}  `
    + `avg balance ${money(avgBalance).padStart(7)}  top-flight balance ${money(topBalance).padStart(7)} `
    + `vs revenue ${money(topRevenue)}`,
  )
}
