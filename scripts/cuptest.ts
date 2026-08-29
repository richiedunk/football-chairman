import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { survivorsOf } from '../src/engine/sim/cups'

const setup = prepareNewGame({
  seed: 'CUP03', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const cup = Object.values(state.cups).find(c => c.nationId === 'eng')!
console.log(`${cup.name}: ${cup.entrantIds.length} entrants`)

for (let w = 0; w < 46; w++) {
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  const round = cup.rounds[cup.rounds.length - 1]
  if (round && round.week === state.date.week - 1) {
    console.log(`  wk${round.week} ${round.name.padEnd(15)} ${round.fixtureIds.length} ties → ${survivorsOf(state, cup).length} left`)
  }
}
const winner = cup.winnerId ? state.clubs[cup.winnerId] : null
console.log(`\nWinner: ${winner?.name ?? 'NONE'} (${winner ? state.leagues[winner.leagueId].name : '—'})`)
console.log(`Cup fixtures created: ${state.fixtures.filter(f => f.competitionType === 'cup').length}`)
const prize = winner ? winner.finances.season.prizeMoney : 0
console.log(`Winner prize money banked this season: £${prize.toLocaleString()}`)
