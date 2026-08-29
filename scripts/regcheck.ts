import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import {
  isHomegrownFor, NON_HOMEGROWN_LIMIT, registrablePool, squadRegistration, SQUAD_LIMIT,
} from '../src/engine/systems/registration'
import type { GameState } from '../src/engine/types'

/**
 * Squad registration calibration.
 *
 * The rule is only interesting if it binds sometimes: a world where every club
 * comfortably registers everyone makes the screen decorative, and one where
 * nobody can field a side makes it a tax.
 */
function report(state: GameState, label: string) {
  console.log(`\n=== ${label} · season ${state.date.season} week ${state.date.week} ===`)
  for (const tier of [1, 2, 4]) {
    const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
    if (!league) continue
    let hg = 0, nhg = 0, used = 0, barred = 0, atCeiling = 0, exemptTotal = 0, clubs = 0
    let overSized = 0
    for (const clubId of league.clubIds) {
      const club = state.clubs[clubId]
      const view = squadRegistration(state, club)
      clubs += 1
      hg += view.homegrown
      nhg += view.nonHomegrown
      used += view.placesUsed
      barred += view.unregistered.length
      exemptTotal += view.exempt.length
      if (view.nonHomegrownFree === 0) atCeiling += 1
      if (registrablePool(state, club).filter((p) => p.age >= 21).length > SQUAD_LIMIT) overSized += 1
    }
    console.log(
      `${league.name.padEnd(22)} list ${(used / clubs).toFixed(1)}/${SQUAD_LIMIT}  `
      + `HG ${(hg / clubs).toFixed(1)}  non-HG ${(nhg / clubs).toFixed(1)}/${NON_HOMEGROWN_LIMIT}  `
      + `U21 ${(exemptTotal / clubs).toFixed(1)}  barred ${(barred / clubs).toFixed(2)}/club  `
      + `at ceiling ${atCeiling}/${clubs}  oversized ${overSized}/${clubs}`,
    )
  }
}

const setup = prepareNewGame({
  seed: 'REG1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
report(state, 'world creation')

for (let season = 0; season < 5; season++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  if (season === 0 || season === 4) report(state, `after ${season + 1} season(s)`)
}

// Nobody should be fielding an unregistered senior once lists are locked.
let violations = 0
for (const club of Object.values(state.clubs)) {
  const view = squadRegistration(state, club)
  if (view.illegal) violations += 1
}
console.log(`\nillegal lists: ${violations}/${Object.keys(state.clubs).length}`)

// Homegrown share of the whole player population, as a sanity check.
const players = Object.values(state.players).filter((p) => p.clubId)
const homegrown = players.filter((p) => {
  const club = state.clubs[p.clubId!]
  return club && isHomegrownFor(p, club)
}).length
console.log(`homegrown at their own club: ${((homegrown / players.length) * 100).toFixed(1)}%`)
