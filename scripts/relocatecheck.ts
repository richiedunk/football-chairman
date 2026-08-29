import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { canTakeJobAt } from '../src/engine/systems/career'
import { awardContract, borrowingLimit, inviteTenders, revenuePerHead } from '../src/engine/systems/stadium'

const setup = prepareNewGame({
  seed: 'RELO1', directorName: 'T', background: 'financier',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates.find(c => canTakeJobAt(setup.state.director, c))!.id)
const club = state.clubs[state.playerClubId]

// Give this club the means, so the mechanics rather than the economics are
// under test.
club.finances.balance = 40_000_000
club.reputation = 45

const spec = { kind: 'relocate' as const, capacity: 12000, stadiumName: 'Riverside Park' }
const bids = inviteTenders(state, club, spec).filter(b => b.available)
console.log(`${club.name} at ${club.facilities.stadium.name} (${club.facilities.stadium.capacity.toLocaleString()})`)
console.log(`borrowing limit £${borrowingLimit(state, club).toLocaleString()}`)
console.log(`relocation tenders: ${bids.length}`)
for (const b of bids.slice(0, 4)) {
  console.log(`  ${b.firm.padEnd(26)} £${b.cost.toLocaleString().padStart(11)}  ${b.weeks}w  ${b.risk}`)
}
if (bids.length === 0) { console.log('nobody will build it'); process.exit(0) }

const moodBefore = Math.round(club.fanMood)
const perHeadBefore = revenuePerHead(club.facilities.stadium)
const result = awardContract(state, club, setup.ids, spec, bids[0].architectId, 'cash')
console.log(`\n${result.message}`)

let weeks = 0
while (club.facilities.stadiumProject && weeks < 400) {
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  weeks++
}
const st = club.facilities.stadium
console.log(`\nAfter ${weeks} weeks: ${st.name}, ${st.capacity.toLocaleString()} places, quality ${st.quality}`)
for (const s of st.stands) console.log(`  ${s.name.padEnd(12)} ${String(s.capacity).padStart(6)} ${s.type} boxes ${s.hospitalityBoxes}`)
console.log(`per head £${perHeadBefore.toFixed(2)} → £${revenuePerHead(st).toFixed(2)}`)
console.log(`fan mood ${moodBefore} → ${Math.round(club.fanMood)}  |  reputation now ${club.reputation}`)

const { assessFanMood } = await import('../src/engine/systems/board')
const a = assessFanMood(state, club)
console.log(`\nmood target ${Math.round(a.target)} — why:`)
for (const f of a.factors) console.log(`  ${(f.delta > 0 ? '+' : '') + f.delta.toFixed(1)}`.padStart(9) + `  ${f.label}`)
const table = state.tables[club.leagueId]
const pos = [...table].sort((x, y) => y.points - x.points).findIndex(r => r.clubId === club.id) + 1
console.log(`\nposition ${pos} of ${table.length}, expected ${club.board.expectation.leaguePosition}`)
console.log(`balance £${Math.round(club.finances.balance).toLocaleString()}  debt £${club.finances.debt.toLocaleString()}  crisis ${club.finances.inCrisis}`)
