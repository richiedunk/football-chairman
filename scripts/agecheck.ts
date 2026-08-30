/**
 * How old are the players clubs actually field?
 *
 * A squad screen showing a fifteen-year-old as a club's best senior player is
 * either a generation fault or a promotion fault, and guessing which is the
 * thing this project has agreed not to do.
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { seniorSquad } from '../src/engine/systems/aiSquad'

const setup = prepareNewGame({
  seed: 'AGE1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

function report(label: string) {
  const seniors = Object.values(state.clubs).flatMap((c) => seniorSquad(state, c))
  const byAge = new Map<number, number>()
  for (const p of seniors) byAge.set(p.age, (byAge.get(p.age) ?? 0) + 1)
  const ages = [...byAge.keys()].sort((a, b) => a - b)
  const under17 = seniors.filter((p) => p.age < 17)
  const under16 = seniors.filter((p) => p.age < 16)
  console.log(`\n${label}`)
  console.log(`  seniors ${seniors.length}, ages ${ages[0]}-${ages[ages.length - 1]}`)
  console.log(`  under 17: ${under17.length} (${((under17.length / seniors.length) * 100).toFixed(1)}%)  under 16: ${under16.length}`)
  console.log(`  youngest bands: ${ages.slice(0, 6).map((a) => `${a}y:${byAge.get(a)}`).join('  ')}`)
  if (under17.length) {
    const best = [...under17].sort((a, b) => b.currentAbility - a.currentAbility)[0]
    const club = state.clubs[best.clubId!]
    console.log(`  best under-17 senior: ${best.knownAs}, ${best.age}, CA ${best.currentAbility} at ${club?.name}`)
    const rank = seniorSquad(state, club).sort((a, b) => b.currentAbility - a.currentAbility)
      .findIndex((p) => p.id === best.id) + 1
    console.log(`    ranked ${rank} of ${seniorSquad(state, club).length} at his club`)
  }
}

report('at world generation')
for (let i = 0; i < 52; i++) advanceWeek(state, { ids: setup.ids, names: setup.names })
report('after one season')
for (let i = 0; i < 52 * 4; i++) advanceWeek(state, { ids: setup.ids, names: setup.names })
report('after five seasons')
