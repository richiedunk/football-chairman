import { generateWorld } from '../src/engine/world/worldGen'
import { clientsOf, influentialAgents } from '../src/engine/systems/agents'

const state = generateWorld({
  seed: 'AGENTS', season: 2025, size: 'compact', homeNationId: 'eng',
  directorName: 'T', background: 'analyst',
})

const agents = Object.values(state.agents)
const counts = agents.map((a) => a.clientIds.length).sort((a, b) => a - b)
const pct = (p: number) => counts[Math.floor(counts.length * p)]
const represented = Object.values(state.players).filter((p) => p.agentId).length

console.log(`${agents.length} agents for ${Object.keys(state.players).length} players `
  + `(${((represented / Object.keys(state.players).length) * 100).toFixed(0)}% represented)`)
console.log(`clients per agent: p10 ${pct(0.1)}  median ${pct(0.5)}  p90 ${pct(0.9)}  max ${counts[counts.length - 1]}`)

console.log('\nthe blocs that matter:')
for (const agent of influentialAgents(state, 5)) {
  const clients = clientsOf(state, agent)
  const good = clients.filter((p) => p.currentAbility > 120).length
  console.log(`  ${agent.name.padEnd(24)} rep ${String(agent.reputation).padStart(2)}  `
    + `${String(clients.length).padStart(3)} clients, ${good} of them good`)
}
