import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { assessSquadCost, SQUAD_COST_LIMIT, underEmbargo } from '../src/engine/systems/regulation'

/**
 * Squad-cost calibration.
 *
 * A rule everybody breaks is a tax, and a rule nobody breaks is decoration.
 * What we want is most clubs inside the limit most of the time, with the ones
 * who have overreached outside it.
 */
const setup = prepareNewGame({
  seed: 'REGN', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

for (let season = 1; season <= 6; season++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })

  const clubs = Object.values(state.clubs)
  const assessed = clubs
    .map((c) => ({ club: c, a: c.finances.lastSeason ? assessSquadCost(c.finances.lastSeason) : null }))
    .filter((e) => e.a && Number.isFinite(e.a.ratio))
  const ratios = assessed.map((e) => e.a!.ratio).sort((a, b) => a - b)
  const breaching = assessed.filter((e) => e.a!.inBreach).length
  const embargoed = clubs.filter(underEmbargo).length
  const docked = clubs.filter((c) => c.finances.regulation.pointsDeducted > 0).length
  const fined = clubs.filter((c) =>
    c.finances.regulation.sanctions.some((s) => s.kind === 'fine' && s.season === state.date.season - 1)).length
  const pct = (p: number) => ratios.length ? (ratios[Math.floor(ratios.length * p)] * 100).toFixed(0) : '—'

  console.log(
    `season ${season}  ratio p10 ${pct(0.1)}% p50 ${pct(0.5)}% p90 ${pct(0.9)}%  `
    + `breaching ${breaching}/${assessed.length}  fined ${fined}  embargo ${embargoed}  docked ${docked}`,
  )
}

// Where does the cost actually sit?
const sample = Object.values(state.clubs)
  .filter((c) => c.finances.lastSeason)
  .sort((a, b) => b.reputation - a.reputation)
console.log()
for (const club of [sample[0], sample[Math.floor(sample.length / 2)], sample[sample.length - 1]]) {
  const a = assessSquadCost(club.finances.lastSeason!)
  console.log(`${club.name.slice(0, 20).padEnd(21)} rep ${String(Math.round(club.reputation)).padStart(2)} ratio ${(a.ratio * 100).toFixed(0)}% (limit ${SQUAD_COST_LIMIT * 100}%)`)
  for (const c of a.components) {
    console.log(`   ${c.income ? '+' : '-'} ${c.label.padEnd(28)} ${Math.round(c.amount).toLocaleString().padStart(12)}`)
  }
}
