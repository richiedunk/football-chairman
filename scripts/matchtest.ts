import { generateWorld } from '../src/engine/world/worldGen'
import { simulateMatch } from '../src/engine/sim/match'
import { Rng } from '../src/engine/rng'

const state = generateWorld({
  seed: 'MATCH01', season: 2025, size: 'compact', homeNationId: 'eng',
  directorName: 'Test', background: 'analyst',
})
const rng = new Rng('matchsim')
const leagues = Object.values(state.leagues)
const topFlight = leagues.find(l => l.tier === 1 && l.nationId === 'eng')!
const bottom = leagues.find(l => l.tier === 5 && l.nationId === 'eng')!

for (const league of [topFlight, bottom]) {
  let hw=0, d=0, aw=0, goals=0, n=0, shots=0, sot=0, att=0
  // Where the goals come from. Roughly a quarter to a third of real goals are
  // dead balls and about eight per cent are penalties; a set-piece model that
  // does not land in that range is decoration.
  let setPieceGoals=0, penGoals=0, pensAwarded=0, eventGoals=0
  const scorerPos = new Map<string, number>()
  const t0=Date.now()
  for (let i=0;i<1200;i++) {
    const ids = rng.sample(league.clubIds, 2)
    const home = state.clubs[ids[0]], away = state.clubs[ids[1]]
    const r = simulateMatch(state, home, away, rng, { suspendedIds: new Set() }, true)
    if (r.homeGoals>r.awayGoals) hw++; else if (r.homeGoals===r.awayGoals) d++; else aw++
    goals += r.homeGoals + r.awayGoals
    // Detailed results always carry these; they are optional on the type
    // only because a trimmed result has had them deleted.
    shots += r.shots!.home + r.shots!.away
    sot += r.shotsOnTarget!.home + r.shotsOnTarget!.away
    att += r.attendance!
    n++
    for (const e of r.events) {
      if (e.type === 'penaltyScored') { penGoals++; pensAwarded++; eventGoals++ }
      else if (e.type === 'penaltyMissed') pensAwarded++
      else if (e.type === 'goal') {
        eventGoals++
        // A dead-ball goal is the one credited to a delivery rather than a
        // pass, which the text distinguishes because the model does.
        if (/delivery|set piece/.test(e.text)) setPieceGoals++
        const pos = state.players[e.playerId]?.position
        if (pos) scorerPos.set(pos, (scorerPos.get(pos) ?? 0) + 1)
      }
    }
  }
  console.log(`\n${league.name} (${n} matches, ${Date.now()-t0}ms)`)
  console.log(`  home ${(hw/n*100).toFixed(0)}%  draw ${(d/n*100).toFixed(0)}%  away ${(aw/n*100).toFixed(0)}%`)
  console.log(`  goals/game ${(goals/n).toFixed(2)}  shots ${(shots/n).toFixed(1)}  on target ${(sot/n).toFixed(1)}  att ${Math.round(att/n)}`)
  const deadBall = setPieceGoals + penGoals
  console.log(
    `  dead-ball goals ${((deadBall/eventGoals)*100).toFixed(0)}%`
    + ` (open-play set pieces ${((setPieceGoals/eventGoals)*100).toFixed(0)}%,`
    + ` penalties ${((penGoals/eventGoals)*100).toFixed(0)}%)`
    + `  penalties/game ${(pensAwarded/n).toFixed(2)}`,
  )
  const byPos = [...scorerPos].sort((a,b)=>b[1]-a[1]).slice(0,6)
  console.log(`  open-play + set-piece scorers: ${byPos.map(([p,c])=>`${p} ${((c/eventGoals)*100).toFixed(0)}%`).join('  ')}`)
}

// One detailed match printout
const ids = rng.sample(topFlight.clubIds, 2)
const home = state.clubs[ids[0]], away = state.clubs[ids[1]]
const r = simulateMatch(state, home, away, rng, { suspendedIds: new Set() }, true)
console.log(`\n=== ${home.name} ${r.homeGoals}-${r.awayGoals} ${away.name} ===`)
console.log(r.summary, `| poss ${r.possession}% | att ${r.attendance!.toLocaleString()}`)
for (const e of r.events.slice(0, 14)) console.log(`  ${e.minute}' [${e.type}] ${e.text}`)
const top = Object.entries(r.ratings).sort((a,b)=>b[1]-a[1]).slice(0,5)
console.log('  top ratings:', top.map(([id,v])=>`${state.players[id].knownAs} ${v.toFixed(1)}`).join(', '))
