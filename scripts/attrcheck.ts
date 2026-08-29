import { generateWorld } from '../src/engine/world/worldGen'
import { ratingForPosition } from '../src/engine/world/attributes'

const state = generateWorld({ seed: 'ATTR1', season: 2025, size: 'compact', homeNationId: 'eng', directorName: 'T', background: 'analyst' })
for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find(l => l.nationId === 'eng' && l.tier === tier)!
  const players = league.clubIds.flatMap(id => state.clubs[id].squad.map(pid => state.players[pid])).filter(p => p && !p.isAcademy)
  const keys = ['passing','shooting','pace','tackling','determination'] as const
  const means = keys.map(k => (players.reduce((s,p)=>s+p!.attributes[k],0)/players.length).toFixed(1))
  const cas = players.map(p=>p!.currentAbility)
  console.log(`${league.name.padEnd(22)} CA ${Math.min(...cas).toFixed(0)}-${Math.max(...cas).toFixed(0)} avg ${(cas.reduce((a,b)=>a+b,0)/cas.length).toFixed(0)}`)
  console.log(`  ${keys.map((k,i)=>`${k} ${means[i]}`).join('  ')}`)
  // Calibration check: does ratingForPosition agree with stored currentAbility?
  const drift = players.map(p => Math.abs(ratingForPosition(p!.attributes, p!.position) - p!.currentAbility))
  console.log(`  calibration drift: avg ${(drift.reduce((a,b)=>a+b,0)/drift.length).toFixed(2)}, max ${Math.max(...drift).toFixed(1)}`)
}
