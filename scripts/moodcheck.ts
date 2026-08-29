import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { assessFanMood } from '../src/engine/systems/board'

const setup = prepareNewGame({
  seed: 'MOOD1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const club = state.clubs[state.playerClubId]
console.log(`${club.name} — starting mood ${Math.round(club.fanMood)}`)

for (let season = 0; season < 3; season++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  const all = Object.values(state.clubs).map(c => c.fanMood)
  const avg = all.reduce((a, b) => a + b, 0) / all.length
  const c = state.clubs[state.playerClubId]
  console.log(
    `after season ${season + 1}: your mood ${Math.round(c.fanMood)} | ` +
    `world avg ${avg.toFixed(1)} min ${Math.round(Math.min(...all))} max ${Math.round(Math.max(...all))}`
  )
}
const assessment = assessFanMood(state, state.clubs[state.playerClubId])
console.log(`\nWhy (target ${Math.round(assessment.target)}):`)
for (const f of assessment.factors) {
  console.log(`  ${f.delta > 0 ? '+' : ''}${f.delta.toFixed(1).padStart(6)}  ${f.label}`)
}
