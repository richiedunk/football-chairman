import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'

/**
 * Where the world's players actually live.
 *
 * The population grows every season and the question is which bucket is
 * responsible: senior squads are bounded by squad management, so the growth
 * has to be in academies, in the free-agent pool, or in players nobody ever
 * removes.
 */
const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 12)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'POP', directorName: 'T', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
// `candidates` is the jobs board sorted by reputation descending, so [0] is the
// biggest club in the country — a career no level-one director can have.
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

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

console.log(`world: ${SIZE} — ${Object.keys(state.clubs).length} clubs\n`)
line('start')
for (let s = 1; s <= SEASONS; s++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    // A sacking used to end the run early and silently, so the later seasons
    // were never measured. Take the first post going and carry on.
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
    if (state.director.retiredAtSeason !== undefined) break
  }
  line(`season ${s}`)
  if (state.director.retiredAtSeason !== undefined) break
}
