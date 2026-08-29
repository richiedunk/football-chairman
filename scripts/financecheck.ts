import { generateWorld } from '../src/engine/world/worldGen'
import { weeklyRevenue, facilityUpkeep, operatingCosts, costOfLivingIndex } from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'

const state = generateWorld({
  seed: 'FIN1', season: 2025, size: 'compact', homeNationId: 'eng',
  directorName: 'T', background: 'analyst',
})
const rows: string[] = []
for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find(l => l.nationId === 'eng' && l.tier === tier)!
  const clubs = league.clubIds.map(id => state.clubs[id])
  const rev = clubs.map(c => weeklyRevenue(state, c))
  const wages = clubs.map(c => totalWageBill(state, c))
  const upkeep = clubs.map(c => facilityUpkeep(state, c))
  const debt = clubs.map(c => c.finances.debt)
  const inCrisis = clubs.filter(c => c.finances.inCrisis).length
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
  const net = clubs.map((c, i) => rev[i] - wages[i] - upkeep[i])
  rows.push(
    `${league.name.padEnd(20)} rev ${avg(rev).toLocaleString().padStart(8)}/wk  ` +
    `wages ${avg(wages).toLocaleString().padStart(7)}  upkeep ${avg(upkeep).toLocaleString().padStart(7)}  ` +
    `net ${avg(net).toLocaleString().padStart(8)}  debt ${avg(debt).toLocaleString().padStart(9)}  ` +
    `crisis ${inCrisis}/${clubs.length}`
  )
}
console.log(rows.join('\n'))
const starters = Object.values(state.clubs).filter(c => c.reputation <= 26)
console.log(`\nStarting-eligible clubs: ${starters.length}`)
console.log(`  in crisis:            ${starters.filter(c => c.finances.inCrisis).length}`)
console.log(`  debt > 30x weekly rev:${starters.filter(c => c.finances.debt > weeklyRevenue(state, c) * 30).length}`)
console.log(`  running a weekly loss:${starters.filter(c => weeklyRevenue(state, c) - totalWageBill(state, c) - facilityUpkeep(state, c) < 0).length}`)

console.log('\nItemised, one club per tier:')
for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find(l => l.nationId === 'eng' && l.tier === tier)!
  const club = state.clubs[league.clubIds[0]]
  const c = operatingCosts(state, club)
  const rev = weeklyRevenue(state, club)
  console.log(`\n${club.name} (${league.name}) — ${club.city}, col ${costOfLivingIndex(state, club).toFixed(2)}, rev £${rev.toLocaleString()}/wk`)
  for (const [k, v] of Object.entries(c)) {
    if (k === 'total' || k === 'supportHeadcount') continue
    console.log(`  ${k.padEnd(20)} £${Math.round(v as number).toLocaleString().padStart(8)}  ${((v as number)/rev*100).toFixed(1)}%`)
  }
  console.log(`  ${'support headcount'.padEnd(20)}  ${c.supportHeadcount}`)
  console.log(`  ${'TOTAL'.padEnd(20)} £${c.total.toLocaleString().padStart(8)}  ${(c.total/rev*100).toFixed(1)}% of revenue`)
}
