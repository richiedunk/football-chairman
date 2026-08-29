import { generateWorld } from '../src/engine/world/worldGen'
import { availableCoaches } from '../src/engine/systems/board'

const state = generateWorld({
  seed: 'STAFF1', season: 2025, size: 'compact', homeNationId: 'eng',
  directorName: 'T', background: 'analyst',
})
const club = Object.values(state.clubs).find(c => c.reputation < 30)!
const unemployed = Object.values(state.staff).filter(s => s.clubId === null)
console.log(`total staff in world: ${Object.keys(state.staff).length}`)
console.log(`unemployed staff:     ${unemployed.length}`)
console.log(`coaches available to ${club.name}: ${availableCoaches(state, club).length}`)
const byRole = new Map<string, number>()
for (const s of unemployed) byRole.set(s.role, (byRole.get(s.role) ?? 0) + 1)
console.log('unemployed by role:', Object.fromEntries(byRole))
