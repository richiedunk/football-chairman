import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { takeoverAppeal } from '../src/engine/systems/takeovers'
import { weeklyRevenue } from '../src/engine/systems/finance'
import { debtTolerance } from '../src/engine/systems/ownership'

const setup = prepareNewGame({
  seed: 'CRISDUR', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

const approaches = new Map<string, number>()
for (let s = 0; s < 15; s++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    for (const t of state.takeovers) {
      if (t.stage === 'interest') approaches.set(t.clubId, (approaches.get(t.clubId) ?? 0) + 1)
    }
  }
}

const stuck = Object.values(state.clubs).filter((c) => c.finances.inCrisis)
console.log(`${stuck.length} clubs in crisis at the end\n`)
for (const club of stuck) {
  const rev = weeklyRevenue(state, club)
  const tol = debtTolerance(club.board.owner)
  console.log(
    `${club.name.slice(0, 20).padEnd(21)} appeal ${takeoverAppeal(state, club).toFixed(2)}  `
    + `approach-weeks ${approaches.get(club.id) ?? 0}  `
    + `debt ${(club.finances.debt / 1000).toFixed(0)}k vs tolerated ${((rev * tol) / 1000).toFixed(0)}k  `
    + `clears below ${((rev * tol * 0.5) / 1000).toFixed(0)}k  balance ${(club.finances.balance / 1000).toFixed(0)}k`,
  )
}
