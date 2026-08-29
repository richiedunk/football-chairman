import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { contractTermsFor } from '../src/engine/systems/directorContract'
import { canTakeJobAt, levelFor } from '../src/engine/systems/career'

const setup = prepareNewGame({
  seed: 'EARN1', directorName: 'R. Dunk', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const all = setup.candidates
const open = all.filter(c => canTakeJobAt(setup.state.director, c))
console.log(`Jobs board: ${all.length} clubs, ${open.length} open at ${levelFor(0).title}`)

const club = open[0]
const terms = contractTermsFor(setup.state, club, setup.state.director)
console.log(`\n${club.name} (rep ${club.reputation}) opening terms:`)
console.log(`  salary £${terms.opening.salary}/wk  ceiling £${terms.ceiling.salary}/wk`)
console.log(`  ${terms.note}`)

const state = startCareerAt(setup, club.id, terms.ceiling)
console.log(`\nSigned: £${state.director.contract!.salary}/wk for ${state.director.contract!.expiresSeason - 2025} seasons`)

for (let season = 0; season < 3; season++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  const d = state.director
  const c = state.clubs[state.playerClubId]
  console.log(
    `after season ${season + 1}: career earnings £${Math.round(d.careerEarnings).toLocaleString().padStart(9)} ` +
    `| club £${Math.round(c.finances.balance).toLocaleString().padStart(9)} | XP ${d.xp}`
  )
}

// What a big club would pay by comparison.
const big = Object.values(state.clubs).sort((a, b) => b.reputation - a.reputation)[0]
const bigTerms = contractTermsFor(state, big, state.director)
console.log(`\nFor comparison, ${big.name} (rep ${big.reputation}) would go to £${bigTerms.ceiling.salary}/wk`)
