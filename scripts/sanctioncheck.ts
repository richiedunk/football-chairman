import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { squadRegistration } from '../src/engine/systems/registration'
import { underEmbargo } from '../src/engine/systems/regulation'

/**
 * Does the sanction bite without breaking the club?
 *
 * An embargo works by blocking squad registration, so the risk it carries is
 * that a club under one cannot name enough players to field a side. Under-21s
 * are always eligible, which is the safety valve, but it needs checking rather
 * than assuming.
 */
const setup = prepareNewGame({
  seed: 'SANC', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

for (let season = 1; season <= 6; season++) {
  for (let w = 0; w < 20; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })

  const clubs = Object.values(state.clubs)
  const embargoed = clubs.filter(underEmbargo)
  const named = clubs.map((c) => squadRegistration(state, c).placesUsed)
  const embargoNamed = embargoed.map((c) => squadRegistration(state, c).placesUsed)
  const sizes = clubs.map((c) => seniorSquad(state, c).length)
  // The number that actually matters: players the coach may pick. A named
  // senior or anyone under 21, minus nobody — injuries are a separate problem.
  const eligible = clubs.map((c) => {
    const view = squadRegistration(state, c)
    return view.registered.length + view.exempt.length
  })
  const cannotField = eligible.filter((n) => n < 11).length

  console.log(
    `season ${season} wk20  named avg ${(named.reduce((a, b) => a + b, 0) / named.length).toFixed(1)} `
    + `min ${Math.min(...named)}  squads avg ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}  `
    + `eligible min ${Math.min(...eligible)} (cannot field: ${cannotField})  `
    + `embargoed ${embargoed.length}`
    + (embargoed.length
      ? `  their lists: avg ${(embargoNamed.reduce((a, b) => a + b, 0) / embargoNamed.length).toFixed(1)} min ${Math.min(...embargoNamed)}`
      : ''),
  )

  for (let w = 0; w < 32; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const totals = Object.values(state.clubs).flatMap((c) => c.finances.regulation.sanctions)
const byKind = new Map<string, number>()
for (const s of totals) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1)
console.log('\nsanctions still on record:', [...byKind].map(([k, n]) => `${k} ${n}`).join(', '))
