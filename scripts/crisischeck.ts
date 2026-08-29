import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { weeklyRevenue } from '../src/engine/systems/finance'

for (const seed of ['CR1', 'CR2', 'CR3']) {
  const setup = prepareNewGame({
    seed, directorName: 'T', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  const state = startCareerAt(setup, setup.candidates[0].id)
  const club = state.clubs[state.playerClubId]
  const name = club.name
  for (let w = 0; w < 51; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  const all = Object.values(state.clubs)
  const crisis = all.filter(c => c.finances.inCrisis).length
  console.log(
    `${seed} ${name.padEnd(24)} bal £${Math.round(club.finances.balance).toLocaleString().padStart(10)} ` +
    `debt £${club.finances.debt.toLocaleString().padStart(9)} ` +
    `crisis ${club.finances.inCrisis ? 'YES' : 'no '} | world in crisis: ${crisis}/${all.length}`
  )
}
