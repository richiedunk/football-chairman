import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'

const setup = prepareNewGame({
  seed: 'PROF01', directorName: 'P', background: 'analyst',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const deps = { ids: setup.ids, names: setup.names }

// warm up
for (let i=0;i<10;i++) advanceWeek(state, deps)

const profile = new Map<string, number>()
;(globalThis as any).__prof = profile

// Crude sampling: wrap the hot modules by monkey-patching via import side effects
// is fiddly, so instead time 40 weeks with --cpu-prof style manual sections.
const t0 = process.hrtime.bigint()
for (let i=0;i<40;i++) advanceWeek(state, deps)
const t1 = process.hrtime.bigint()
console.log('ms/week', Number(t1-t0)/1e6/40)
console.log('clubs', Object.keys(state.clubs).length, 'players', Object.keys(state.players).length)
