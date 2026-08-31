/**
 * Do buy-back clauses actually happen, and are they worth holding?
 *
 * A clause nobody grants is dead code, and one that is always worth exercising
 * is a free player. What the mechanism needs is for clubs to agree them on the
 * players you would expect, for a decent share to come good, and for some to
 * lapse under water — because a right you should not use is part of the point.
 *
 * Run: `npx tsx scripts/buybackcheck.ts` (SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import { clauseState, clauseUpside } from '../src/engine/systems/buyBack'
import type { GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 6)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'BB1', directorName: 'R', background: 'scout',
  worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

/** Every clause alive in the world right now, with what it is worth. */
function census(s: GameState) {
  const held = Object.values(s.players).filter((p) => p.buyBack)
  const live = held.filter((p) => clauseState(p.buyBack, s.date.season) === 'live')
  const upsides = live.map((p) => clauseUpside(p))
  const good = upsides.filter((u) => u > 0)
  const ages = held.map((p) => p.age)
  return {
    held: held.length,
    live: live.length,
    worthUsing: good.length,
    underWater: upsides.length - good.length,
    medianUpside: good.sort((a, b) => a - b)[Math.floor(good.length / 2)] ?? 0,
    meanAge: ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : '—',
    oldest: ages.length ? Math.max(...ages) : 0,
  }
}

console.log('season   clauses   live   worth using   under water   median upside   mean age   oldest')

for (let season = 1; season <= SEASONS; season++) {
  for (let week = 0; week < 52; week++) {
    advanceWeek(state, deps)
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
    if (state.director.retiredAtSeason !== undefined) break
  }
  const c = census(state)
  console.log(
    String(season).padStart(6)
    + String(c.held).padStart(10) + String(c.live).padStart(7)
    + String(c.worthUsing).padStart(14) + String(c.underWater).padStart(14)
    + `${Math.round(c.medianUpside / 1000)}k`.padStart(16)
    + c.meanAge.padStart(11) + String(c.oldest).padStart(9),
  )
  if (state.director.retiredAtSeason !== undefined) break
}

// The thing that would make this a cheat code: a clause on somebody it makes
// no sense to have one on.
const held = Object.values(state.players).filter((p) => p.buyBack)
const wrong = held.filter((p) => p.age > 32)
console.log(`\nclauses on players over 32: ${wrong.length} of ${held.length}`)
