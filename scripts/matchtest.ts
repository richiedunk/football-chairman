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
  const t0=Date.now()
  for (let i=0;i<1200;i++) {
    const ids = rng.sample(league.clubIds, 2)
    const home = state.clubs[ids[0]], away = state.clubs[ids[1]]
    const r = simulateMatch(state, home, away, rng, { suspendedIds: new Set() }, true)
    if (r.homeGoals>r.awayGoals) hw++; else if (r.homeGoals===r.awayGoals) d++; else aw++
    goals += r.homeGoals + r.awayGoals
    shots += r.shots.home + r.shots.away
    sot += r.shotsOnTarget.home + r.shotsOnTarget.away
    att += r.attendance
    n++
  }
  console.log(`\n${league.name} (${n} matches, ${Date.now()-t0}ms)`)
  console.log(`  home ${(hw/n*100).toFixed(0)}%  draw ${(d/n*100).toFixed(0)}%  away ${(aw/n*100).toFixed(0)}%`)
  console.log(`  goals/game ${(goals/n).toFixed(2)}  shots ${(shots/n).toFixed(1)}  on target ${(sot/n).toFixed(1)}  att ${Math.round(att/n)}`)
}

// One detailed match printout
const ids = rng.sample(topFlight.clubIds, 2)
const home = state.clubs[ids[0]], away = state.clubs[ids[1]]
const r = simulateMatch(state, home, away, rng, { suspendedIds: new Set() }, true)
console.log(`\n=== ${home.name} ${r.homeGoals}-${r.awayGoals} ${away.name} ===`)
console.log(r.summary, `| poss ${r.possession}% | att ${r.attendance.toLocaleString()}`)
for (const e of r.events.slice(0, 14)) console.log(`  ${e.minute}' [${e.type}] ${e.text}`)
const top = Object.entries(r.ratings).sort((a,b)=>b[1]-a[1]).slice(0,5)
console.log('  top ratings:', top.map(([id,v])=>`${state.players[id].knownAs} ${v.toFixed(1)}`).join(', '))
