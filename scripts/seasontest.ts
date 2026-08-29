import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { sortTable } from '../src/engine/systems/board'
import { levelFor } from '../src/engine/systems/career'

const setup = prepareNewGame({
  seed: 'SEASON01', directorName: 'R. Dunk', background: 'analyst',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
console.log('Starting club candidates:')
for (const c of setup.candidates) {
  const l = setup.state.leagues[c.leagueId]
  console.log(`  ${c.name} — ${l.name}, rep ${c.reputation}, bal £${c.finances.balance.toLocaleString()}, debt £${c.finances.debt.toLocaleString()}`)
}

const state = startCareerAt(setup, setup.candidates[0].id)
const club = state.clubs[state.playerClubId]
console.log(`\nTaking over at ${club.name}. Target: ${club.board.expectation.description} (${club.board.expectation.leaguePosition}th)`)
console.log(`Wage budget £${club.finances.wageBudget.toLocaleString()}/wk, transfer budget £${club.finances.transferBudget.toLocaleString()}`)

const deps = { ids: setup.ids, names: setup.names }
const t0 = Date.now()
let weeks = 0
for (let season = 0; season < 3; season++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, deps)
    weeks++
  }
  const c = state.clubs[state.playerClubId]
  const hist = c.history[c.history.length-1]
  const lvl = levelFor(state.director.xp)
  console.log(`\n--- End of ${hist?.season ?? '?'} ---`)
  console.log(`  ${c.name}: ${hist?.position}${''} in ${hist?.leagueName}, ${hist?.points} pts (P${hist?.played})`)
  console.log(`  balance £${c.finances.balance.toLocaleString()}  debt £${c.finances.debt.toLocaleString()}  rep ${c.reputation}`)
  console.log(`  board confidence ${Math.round(c.board.confidence)}  warnings ${c.board.warnings}  fanMood ${Math.round(c.fanMood)}`)
  console.log(`  director XP ${state.director.xp} (${lvl.title}, L${lvl.level})  offers ${state.director.jobOffers.length}`)
  console.log(`  squad ${c.squad.filter(id=>state.players[id] && !state.players[id].isAcademy).length} senior / ${c.squad.filter(id=>state.players[id]?.isAcademy).length} academy`)
}
console.log(`\n${weeks} weeks in ${Date.now()-t0}ms (${((Date.now()-t0)/weeks).toFixed(1)}ms/week)`)
console.log(`players in world: ${Object.keys(state.players).length}`)
console.log(`inbox: ${state.inbox.length}, news: ${state.newsFeed.length}, transfers: ${state.completedTransfers.length}`)
console.log(`scout reports: ${Object.keys(state.scoutReports).length}`)
console.log(`save size: ${(JSON.stringify(state).length/1024/1024).toFixed(1)}MB`)

const table = sortTable(state.tables[state.clubs[state.playerClubId].leagueId])
console.log('\nCurrent table top 6:')
for (const r of table.slice(0,6)) {
  console.log(`  ${state.clubs[r.clubId].shortName.padEnd(16)} P${r.played} ${r.points}pts ${r.goalsFor}:${r.goalsAgainst}`)
}
const squad = state.clubs[state.playerClubId].squad.map(id=>state.players[id]).filter(p=>p&&!p.isAcademy)
  .sort((a,b)=>b!.currentAbility-a!.currentAbility).slice(0,5)
console.log('\nBest players:')
for (const p of squad) console.log(`  ${p!.knownAs} (${p!.position}) ${p!.age}y CA${Math.round(p!.currentAbility)} form ${Math.round(p!.form)} morale ${Math.round(p!.morale)} £${p!.contract?.wage}/wk`)
