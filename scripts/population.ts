import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'

/**
 * Where the world's players actually live.
 *
 * The population grows every season and the question is which bucket is
 * responsible: senior squads are bounded by squad management, so the growth
 * has to be in academies, in the free-agent pool, or in players nobody ever
 * removes.
 */
const setup = prepareNewGame({
  seed: 'POP', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

function line(label: string) {
  const players = Object.values(state.players)
  const senior = players.filter((p) => p.clubId && !p.isAcademy).length
  const academy = players.filter((p) => p.clubId && p.isAcademy).length
  const free = players.filter((p) => !p.clubId && !p.isAcademy).length
  const freeAcademy = players.filter((p) => !p.clubId && p.isAcademy).length
  const orphan = players.filter((p) => p.clubId && !state.clubs[p.clubId]).length
  const freeAges = players.filter((p) => !p.clubId).map((p) => p.age)
  const medianFreeAge = freeAges.sort((a, b) => a - b)[Math.floor(freeAges.length / 2)] ?? 0
  console.log(
    `${label.padEnd(10)} total ${String(players.length).padStart(6)}  senior ${String(senior).padStart(5)}  `
    + `academy ${String(academy).padStart(5)}  free ${String(free).padStart(5)} (median age ${medianFreeAge})  `
    + `free+academy ${freeAcademy}  orphaned ${orphan}`,
  )
}

line('start')
for (let s = 1; s <= 12; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  line(`season ${s}`)
}
