import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { operatingCosts, weeklyRevenue } from '../src/engine/systems/finance'

const setup = prepareNewGame({
  seed: 'UPK', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 3; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)!
  const clubs = league.clubIds.map((id) => state.clubs[id])
  const avg = (f: (c: typeof clubs[0]) => number) => clubs.reduce((s, c) => s + f(c), 0) / clubs.length
  const rev = avg((c) => weeklyRevenue(state, c))
  console.log(`\n${league.name}  weekly revenue ${Math.round(rev).toLocaleString()}  `
    + `capacity ${Math.round(avg((c) => c.facilities.stadium.capacity)).toLocaleString()}`)
  const keys = ['stadiumMaintenance', 'groundRent', 'trainingGround', 'youthSetup', 'medical',
    'dataDepartment', 'scoutingNetwork', 'supportStaff', 'generalOverheads'] as const
  for (const k of keys) {
    const v = avg((c) => operatingCosts(state, c)[k])
    console.log(`  ${k.padEnd(20)} ${Math.round(v).toLocaleString().padStart(9)}/wk  ${((v / rev) * 100).toFixed(1)}% of revenue`)
  }
  const total = avg((c) => operatingCosts(state, c).total)
  console.log(`  ${'TOTAL'.padEnd(20)} ${Math.round(total).toLocaleString().padStart(9)}/wk  ${((total / rev) * 100).toFixed(1)}%`)
}
