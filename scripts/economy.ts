import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { weeklyRevenue } from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { assessSquadCost } from '../src/engine/systems/regulation'

/**
 * The shape of the whole economy, by division.
 *
 * Wages against revenue is the number that decides whether a squad-cost rule
 * means anything. If clubs spend a quarter of what they earn on players, a
 * seventy-percent limit is decoration.
 */
const setup = prepareNewGame({
  seed: 'ECON', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

const seasons = Number(process.argv[2] ?? 3)
for (let s = 0; s < seasons; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const money = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

console.log(`after ${seasons} seasons\n`)
for (const tier of [1, 2, 3, 4, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const clubs = league.clubIds.map((id) => state.clubs[id])
  const avg = (f: (c: typeof clubs[0]) => number) => clubs.reduce((s, c) => s + f(c), 0) / clubs.length

  const revenue = avg((c) => weeklyRevenue(state, c) * 52)
  const wages = avg((c) => totalWageBill(state, c) * 52)
  const perPlayer = avg((c) => totalWageBill(state, c) / Math.max(1, seniorSquad(state, c).length))
  const ratios = clubs
    .map((c) => (c.finances.lastSeason ? assessSquadCost(c.finances.lastSeason).ratio : NaN))
    .filter((r) => Number.isFinite(r))
  const medianRatio = ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)] ?? 0
  const crisis = clubs.filter((c) => c.finances.inCrisis).length

  console.log(
    `${league.name.padEnd(22)} revenue ${money(revenue).padStart(7)}  wages ${money(wages).padStart(7)}  `
    + `(${((wages / revenue) * 100).toFixed(0)}%)  per player ${money(perPlayer).padStart(6)}/wk  `
    + `squad-cost ${(medianRatio * 100).toFixed(0)}%  balance ${money(avg((c) => c.finances.balance)).padStart(7)}  `
    + `crisis ${crisis}/${clubs.length}`,
  )
}
