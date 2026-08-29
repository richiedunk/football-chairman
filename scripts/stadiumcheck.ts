import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { canTakeJobAt } from '../src/engine/systems/career'
import {
  awardContract, baseCost, inviteTenders, revenuePerHead, WORK_LABELS,
} from '../src/engine/systems/stadium'
import { operatingCosts, weeklyRevenue } from '../src/engine/systems/finance'

const setup = prepareNewGame({
  seed: 'STAD1', directorName: 'T', background: 'financier',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const club0 = setup.candidates.find(c => canTakeJobAt(setup.state.director, c))!
const state = startCareerAt(setup, club0.id)
const club = state.clubs[state.playerClubId]
const st = club.facilities.stadium

console.log(`${club.name} — ${st.name} (${st.owned ? 'owned' : 'TENANT'}), built ${st.builtYear}`)
console.log(`capacity ${st.capacity.toLocaleString()}, quality ${st.quality}, per head £${revenuePerHead(st).toFixed(2)}`)
for (const s of st.stands) {
  console.log(`  ${s.name.padEnd(12)} ${String(s.capacity).padStart(6)} places  ${s.type.padEnd(14)} cond ${String(Math.round(s.condition)).padStart(3)}  boxes ${String(s.hospitalityBoxes).padStart(2)}  built ${s.builtYear}`)
}
console.log(`architects on the panel: ${Object.keys(state.architects).length}`)

// Tender for repairs on the worst stand.
const worst = st.stands.slice().sort((a, b) => a.condition - b.condition)[0]
const spec = { kind: 'repair' as const, standId: worst.id }
const before = Math.round(worst.condition)
console.log(`\nTender: ${WORK_LABELS.repair} to the ${worst.name} (base £${baseCost(state, club, spec).toLocaleString()})`)
const bids = inviteTenders(state, club, spec)
for (const b of bids.slice(0, 6)) {
  console.log(`  ${b.firm.padEnd(26)} £${b.cost.toLocaleString().padStart(9)}  ${String(b.weeks).padStart(3)}w  ${b.risk.padEnd(24)} ${b.available ? '' : '(' + b.unavailableReason + ')'}`)
}

// Award to the cheapest available and run it out.
const pick = bids.find(b => b.available && b.cost <= club.finances.balance)
if (pick) {
  const result = awardContract(state, club, setup.ids, spec, pick.architectId)
  console.log(`\nAwarded to ${pick.firm}: ${result.message}`)
  let weeks = 0
  while (club.facilities.stadiumProject && weeks < 200) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    weeks++
  }
  const after = club.facilities.stadium.stands.find(s => s.id === worst.id)!
  console.log(`Completed after ${weeks} weeks. ${after.name} condition ${before} → ${Math.round(after.condition)}`)
  console.log(`capacity ${st.capacity.toLocaleString()}, quality ${club.facilities.stadium.quality}`)
} else {
  console.log('\nNo affordable tender — the club cannot pay for repairs.')
}

// Costs now break down with a tenancy premium where applicable.
const costs = operatingCosts(state, club)
console.log(`\nweekly revenue £${weeklyRevenue(state, club).toLocaleString()}  rent £${costs.groundRent.toLocaleString()}  maintenance £${costs.stadiumMaintenance.toLocaleString()}`)
