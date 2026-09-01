import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { survivorsOf, tieAggregate } from '../src/engine/sim/cups'

const setup = prepareNewGame({
  seed: 'CUP04', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates.filter(c => c.reputation <= 26)[0].id)
const cup = Object.values(state.cups).find(c => c.nationId === 'eng')!
console.log(`${cup.name}: ${cup.entrantIds.length} entrants`)

for (let w = 0; w < 48; w++) {
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  const round = cup.rounds[cup.rounds.length - 1]
  if (round && round.week === state.date.week - 1) {
    console.log(`  wk${String(round.week).padStart(2)} ${round.name.padEnd(15)}${round.twoLegged ? ' (2 legs)' : '         '} ${round.fixtureIds.length} fixtures → ${survivorsOf(state, cup).length} left`)
  }
}
const winner = cup.winnerId ? state.clubs[cup.winnerId] : null
console.log(`\nWinner: ${winner?.name ?? 'NONE'}`)

// Show the two-legged semi-finals in detail.
const semi = cup.rounds.find(r => r.twoLegged)
if (semi) {
  console.log(`\n${semi.name} (two legs):`)
  const byTie = new Map<string, any[]>()
  for (const id of semi.fixtureIds) {
    const f = state.fixtures.find(x => x.id === id)!
    const t = f.legOf!.tieId
    byTie.set(t, [...(byTie.get(t) ?? []), f])
  }
  for (const [, legs] of byTie) {
    const agg = tieAggregate(legs)!
    const l1 = legs.find(l => l.legOf.leg === 1), l2 = legs.find(l => l.legOf.leg === 2)
    console.log(
      `  ${state.clubs[agg.clubA].shortName} v ${state.clubs[agg.clubB].shortName}: ` +
      `${l1.result.homeGoals}-${l1.result.awayGoals}, ${l2.result.homeGoals}-${l2.result.awayGoals} ` +
      `→ agg ${agg.goalsA}-${agg.goalsB}` +
      (agg.goalsA === agg.goalsB ? ' (shootout)' : '')
    )
  }
}
