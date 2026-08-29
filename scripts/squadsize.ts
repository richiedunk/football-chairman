import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { squadRegistration } from '../src/engine/systems/registration'

/**
 * World sustainability.
 *
 * A career is meant to run for decades. If squads bleed out, everything else
 * measured on top of them is measuring a world that no longer exists.
 */
const setup = prepareNewGame({
  seed: 'SQ1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

function line(label: string) {
  const clubs = Object.values(state.clubs)
  const sizes = clubs.map((c) => seniorSquad(state, c).length)
  const acad = clubs.map((c) => c.squad.filter((id) => state.players[id]?.isAcademy).length)
  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)
  const free = Object.values(state.players).filter((p) => !p.clubId && !p.isAcademy)
  const ages = clubs.flatMap((c) => seniorSquad(state, c).map((p) => p.age))
  const named = clubs.map((c) => squadRegistration(state, c).placesUsed)
  console.log(
    `${label.padEnd(12)} senior ${avg(sizes)} (min ${Math.min(...sizes)})  academy ${avg(acad)}  `
    + `named ${avg(named)}  avg age ${avg(ages)}  players ${Object.keys(state.players).length}  `
    + `free ${free.length}`,
  )
}

line('start')
for (let s = 1; s <= 10; s++) {
  // Two snapshots a season. Mid-season is the one that matters — it is when
  // matches are played and a thin squad actually costs points. The week-one
  // figure is the trough right after contracts expire, before pre-season
  // recruiting refills the squads, and is expected to be lower.
  for (let w = 0; w < 14; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  line(`s${s} week 15`)
  for (let w = 0; w < 38; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  line(`s${s} rollover`)
}

// Where do the veterans end up? A world that works sends them downwards
// before it retires them, rather than deleting them out of the top flight.
const tiers = [1, 2, 3, 4, 5]
for (const tier of tiers) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const players = league.clubIds.flatMap((id) => seniorSquad(state, state.clubs[id]))
  const over32 = players.filter((p) => p.age >= 32).length
  console.log(
    `${league.name.padEnd(22)} squads ${(players.length / league.clubIds.length).toFixed(1)}  `
    + `32+ ${((over32 / players.length) * 100).toFixed(1)}%`,
  )
}
