import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { ledgerIncome, ledgerExpenditure, operatingCosts, weeklyRevenue } from '../src/engine/systems/finance'

/**
 * Where a club's money goes over a full season.
 *
 * Football clubs famously run at or below break-even. A world where they bank
 * a quarter of turnover every year is one where money piles up with nothing to
 * do, which is exactly what the balances show.
 */
const setup = prepareNewGame({
  seed: 'PNL', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 3; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const money = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : `${Math.round(n / 1000)}k`

for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const clubs = league.clubIds.map((id) => state.clubs[id]).filter((c) => c.finances.lastSeason)
  if (clubs.length === 0) continue
  const avg = (f: (c: typeof clubs[0]) => number) => clubs.reduce((s, c) => s + f(c), 0) / clubs.length

  const income = avg((c) => ledgerIncome(c.finances.lastSeason!))
  const spend = avg((c) => ledgerExpenditure(c.finances.lastSeason!))
  console.log(`\n${league.name}  (revenue run-rate ${money(avg((c) => weeklyRevenue(state, c) * 52))})`)
  console.log(`  income      ${money(income).padStart(8)}`)
  const l = (label: string, f: (c: typeof clubs[0]) => number) =>
    console.log(`    ${label.padEnd(20)} ${money(avg(f)).padStart(8)}  ${((avg(f) / income) * 100).toFixed(0)}%`)
  l('player wages', (c) => c.finances.lastSeason!.wagesPaid)
  l('staff wages', (c) => c.finances.lastSeason!.staffWages)
  l('transfer fees', (c) => c.finances.lastSeason!.transfersIn)
  l('facilities/upkeep', (c) => c.finances.lastSeason!.facilitiesSpend)
  l('running costs', (c) => c.finances.lastSeason!.otherCosts)
  l('interest', (c) => c.finances.lastSeason!.interestPaid)
  console.log(`  total out   ${money(spend).padStart(8)}   surplus ${money(income - spend).padStart(8)} `
    + `(${(((income - spend) / income) * 100).toFixed(0)}% of income)`)
  console.log(`  upkeep model says ${money(avg((c) => operatingCosts(state, c).total) * 52)}/season`)
}
