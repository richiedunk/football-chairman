import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { Rng } from '../src/engine/rng'
import { quickSimulate } from '../src/engine/sim/match'
import { developPlayer } from '../src/engine/systems/development'
import { processMorale } from '../src/engine/systems/morale'
import { processInjuries } from '../src/engine/systems/injuries'
import { processFinances } from '../src/engine/systems/finance'
import { computeValue } from '../src/engine/systems/valuation'
import { processScouting } from '../src/engine/systems/scouting'
import { processAiTransfers } from '../src/engine/systems/transfers'
import { processBoard } from '../src/engine/systems/board'

const setup = prepareNewGame({
  seed: 'PH1', directorName: 'P', background: 'analyst',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const deps = { ids: setup.ids, names: setup.names }
for (let i=0;i<12;i++) advanceWeek(state, deps)

const rng = new Rng('phase')
const clubs = Object.values(state.clubs)
const players = Object.values(state.players)
const time = (label: string, fn: () => void) => {
  const t = process.hrtime.bigint(); fn()
  console.log(`  ${label.padEnd(34)} ${(Number(process.hrtime.bigint()-t)/1e6).toFixed(1)}ms`)
}
console.log(`clubs ${clubs.length}, players ${players.length}\n`)

// A representative week's worth of matches: about half the clubs play.
const pairs: [any, any][] = []
for (let i=0;i+1<clubs.length;i+=2) pairs.push([clubs[i], clubs[i+1]])
time(`quickSimulate x${pairs.length}`, () => {
  for (const [h,a] of pairs) quickSimulate(state, h, a, rng, { suspendedIds: new Set() })
})
time(`developPlayer x${players.length}`, () => {
  for (const p of players) developPlayer(state, p, { rng, week: 20 })
})
time(`processMorale x${clubs.length}`, () => { for (const c of clubs) processMorale(state, c, rng) })
time(`processInjuries x${clubs.length}`, () => { for (const c of clubs) processInjuries(state, c, rng, true) })
time(`processFinances x${clubs.length}`, () => { for (const c of clubs) processFinances(state, c, rng, null) })
time(`processBoard x${clubs.length}`, () => { for (const c of clubs) processBoard(state, c, rng) })
time(`computeValue x${players.length}`, () => {
  for (const p of players) {
    const c = p.clubId ? state.clubs[p.clubId] : null
    computeValue(p, c ? state.leagues[c.leagueId] : null, c ? state.nations[c.nationId] : null, 2025)
  }
})
time('processScouting (player club)', () => {
  processScouting(state, state.clubs[state.playerClubId], { rng, week: 20, season: 2025 })
})
time('processAiTransfers (whole world)', () => {
  processAiTransfers(state, { rng, ids: setup.ids })
})
