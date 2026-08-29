import { generateWorld } from '../src/engine/world/worldGen'
import { weeklyRevenue, facilityUpkeep } from '../src/engine/systems/finance'
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
  const upkeep = clubs.map(c => facilityUpkeep(c))
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
console.log(`  running a weekly loss:${starters.filter(c => weeklyRevenue(state, c) - totalWageBill(state, c) - facilityUpkeep(c) < 0).length}`)
