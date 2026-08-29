import { generateWorld } from '../src/engine/world/worldGen'
import { contractTermsFor } from '../src/engine/systems/directorContract'
import { CAREER_LEVELS } from '../src/engine/systems/career'

const state = generateWorld({
  seed: 'SAL1', season: 2025, size: 'compact', homeNationId: 'eng',
  directorName: 'T', background: 'analyst',
})
console.log('Ceiling salary by club standing and director level (£/wk, and £/yr):\n')
console.log('tier'.padEnd(22) + ['L1','L4','L7','L10'].map(l=>l.padStart(18)).join(''))
for (const tier of [1, 2, 3, 5]) {
  const league = Object.values(state.leagues).find(l => l.nationId === 'eng' && l.tier === tier)!
  const club = league.clubIds.map(id => state.clubs[id]).sort((a,b)=>b.reputation-a.reputation)[0]
  const cells = [1, 4, 7, 10].map(lv => {
    state.director.xp = CAREER_LEVELS[lv - 1].xpRequired
    const t = contractTermsFor(state, club, state.director)
    const yr = t.ceiling.salary * 52
    return `£${t.ceiling.salary.toLocaleString()}/${yr >= 1e6 ? (yr/1e6).toFixed(1)+'m' : Math.round(yr/1000)+'k'}`.padStart(18)
  })
  console.log(`${league.name.slice(0,20).padEnd(22)}${cells.join('')}`)
}
