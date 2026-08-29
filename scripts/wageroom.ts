import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { totalWageBill } from '../src/engine/systems/valuation'
import { weeklyRevenue } from '../src/engine/systems/finance'

const setup = prepareNewGame({
  seed: 'ROOM', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 3; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

for (const tier of [1, 2, 3, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const clubs = league.clubIds.map((id) => state.clubs[id])
  const noRoom = clubs.filter((c) => c.finances.wageBudget - totalWageBill(state, c) <= 0).length
  const avgRoomPct = clubs.reduce((s, c) => {
    const rev = weeklyRevenue(state, c)
    return s + ((c.finances.wageBudget - totalWageBill(state, c)) / Math.max(1, rev)) * 100
  }, 0) / clubs.length
  const avgBudgetPct = clubs.reduce((s, c) =>
    s + (c.finances.wageBudget / Math.max(1, weeklyRevenue(state, c))) * 100, 0) / clubs.length
  const avgBillPct = clubs.reduce((s, c) =>
    s + (totalWageBill(state, c) / Math.max(1, weeklyRevenue(state, c))) * 100, 0) / clubs.length
  console.log(
    `${league.name.padEnd(22)} budget ${avgBudgetPct.toFixed(0)}% of revenue  bill ${avgBillPct.toFixed(0)}%  `
    + `room ${avgRoomPct.toFixed(0)}%  clubs with no room: ${noRoom}/${clubs.length}`,
  )
}
