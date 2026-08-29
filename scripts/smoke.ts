import { generateWorld } from '../src/engine/world/worldGen'

const t0 = Date.now()
const state = generateWorld({
  seed: 'SMOKE001',
  season: 2025,
  size: 'standard',
  homeNationId: 'eng',
  directorName: 'A. Director',
  background: 'analyst',
})
const t1 = Date.now()

const json = JSON.stringify(state)
console.log('generation ms:', t1 - t0)
console.log('nations:', Object.keys(state.nations).length)
console.log('leagues:', Object.keys(state.leagues).length)
console.log('clubs:', Object.keys(state.clubs).length)
console.log('players:', Object.keys(state.players).length)
console.log('staff:', Object.keys(state.staff).length)
console.log('fixtures:', state.fixtures.length)
console.log('save size MB:', (json.length / 1024 / 1024).toFixed(2))

const clubs = Object.values(state.clubs)
console.log('\nsample clubs:')
for (const c of clubs.slice(0, 6)) {
  console.log(`  ${c.name} (${c.shortName}) — ${c.nickname}, ${c.city}, rep ${c.reputation}, cap ${c.facilities.stadium.capacity}`)
}
console.log('\nbottom-tier clubs (career start):')
for (const c of clubs.filter((c) => c.reputation <= 26).slice(0, 6)) {
  console.log(`  ${c.name} — rep ${c.reputation}, balance ${c.finances.balance}`)
}

const best = Object.values(state.players).sort((a, b) => b.currentAbility - a.currentAbility).slice(0, 8)
console.log('\nbest players:')
for (const p of best) {
  const club = p.clubId ? state.clubs[p.clubId] : null
  console.log(`  ${p.knownAs} (${p.position}) ${p.age}y CA${p.currentAbility}/PA${p.potentialAbility} £${(p.value/1e6).toFixed(1)}m £${p.contract?.wage}/wk @ ${club?.shortName ?? 'free'}`)
}

const youth = Object.values(state.players).filter(p => p.isAcademy).sort((a,b)=>b.potentialAbility-a.potentialAbility).slice(0,5)
console.log('\ntop academy prospects:')
for (const p of youth) {
  console.log(`  ${p.knownAs} (${p.position}) ${p.age}y CA${p.currentAbility}/PA${p.potentialAbility} ${p.traits.join(',')}`)
}
