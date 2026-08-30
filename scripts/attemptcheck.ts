import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { collectTransferStats, stopCollectingTransferStats } from '../src/engine/systems/transfers'

const setup = prepareNewGame({
  seed: 'ATT', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 3; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const stats = collectTransferStats()
for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
stopCollectingTransferStats()

const clubs = Object.keys(state.clubs).length
const per = (n: number) => (n / clubs).toFixed(2)
console.log(`one season, ${clubs} clubs — per club:\n`)
console.log(`  buy attempts       ${per(stats.buyAttempts)}`)
console.log(`    squad full       ${per(stats.squadFull)}`)
console.log(`    no target        ${per(stats.noTargetPosition)}`)
console.log(`    no candidates    ${per(stats.noCandidates)}`)
console.log(`    deal refused     ${per(stats.dealRefused)}`)
console.log(`    BOUGHT           ${per(stats.bought)}`)
console.log(`  sell attempts      ${per(stats.sellAttempts)}`)
console.log(`    nobody to move   ${per(stats.noChurnCandidate)}`)
console.log(`    no buyer         ${per(stats.noBuyerForSale)}`)
console.log(`    SOLD             ${per(stats.sold)}`)
