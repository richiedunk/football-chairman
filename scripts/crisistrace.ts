import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { weeklyRevenue, facilityUpkeep } from '../src/engine/systems/finance'
import { totalWageBill } from '../src/engine/systems/valuation'

/**
 * Are clubs in crisis climbing out, or stuck?
 *
 * The distinction matters. A club that trades out over a couple of seasons is
 * the system working; a club that can never clear the flag is a trap.
 */
const setup = prepareNewGame({
  seed: 'CRIS', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 4; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const tracked = Object.values(state.clubs).filter((c) => c.finances.inCrisis).slice(0, 6)
console.log(`tracking ${tracked.length} clubs currently in crisis\n`)
const debtAt: Record<string, number[]> = {}
for (const c of tracked) debtAt[c.id] = [c.finances.debt]

for (let s = 0; s < 4; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  for (const c of tracked) debtAt[c.id].push(state.clubs[c.id].finances.debt)
}

const money = (n: number) => `${Math.round(n / 1000)}k`
for (const c of tracked) {
  const club = state.clubs[c.id]
  const rev = weeklyRevenue(state, club)
  const surplus = rev - totalWageBill(state, club) - facilityUpkeep(state, club)
  console.log(
    `${club.name.slice(0, 20).padEnd(21)} rep ${String(Math.round(club.reputation)).padStart(2)}  `
    + `debt ${debtAt[c.id].map(money).join(' → ').padEnd(38)}  `
    + `still in crisis: ${club.finances.inCrisis ? 'YES' : 'no '}  `
    + `weekly surplus ${money(surplus)}  (crisis at ${money(rev * 40)}, clears at ${money(rev * 20)})`,
  )
}
