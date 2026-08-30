/**
 * How much is the game telling the player, and through which channel?
 *
 * Three channels exist: the inbox (things addressed to you, some needing a
 * decision), the news feed (world events), and toasts (transient). Only two of
 * them are readable — nothing in the UI displays the news feed at all.
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'

const setup = prepareNewGame({
  seed: 'NOISE1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

const WEEKS = 40
let inboxBefore = state.inbox.length
let newsBefore = state.newsFeed.length
const inboxPerWeek: number[] = []
const newsPerWeek: number[] = []
const decisionsPerWeek: number[] = []

for (let w = 0; w < WEEKS; w++) {
  advanceWeek(state, deps)
  inboxPerWeek.push(state.inbox.length - inboxBefore)
  newsPerWeek.push(state.newsFeed.length - newsBefore)
  decisionsPerWeek.push(
    state.inbox.filter((i) => i.decision && !i.decision.chosenId).length,
  )
  inboxBefore = state.inbox.length
  newsBefore = state.newsFeed.length
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const total = (a: number[]) => a.reduce((x, y) => x + y, 0)

console.log(`over ${WEEKS} weeks`)
console.log(`  inbox items:        ${total(inboxPerWeek)}  (${mean(inboxPerWeek).toFixed(1)} a week)`)
console.log(`  news items:         ${total(newsPerWeek)}  (${mean(newsPerWeek).toFixed(1)} a week)`)
console.log(`  busiest inbox week: ${Math.max(...inboxPerWeek)}`)
console.log(`  busiest news week:  ${Math.max(...newsPerWeek)}`)
console.log(`  decisions pending:  ${mean(decisionsPerWeek).toFixed(1)} on an average week`)
console.log()
console.log(`  inbox now holds:    ${state.inbox.length} items`)
console.log(`  news feed holds:    ${state.newsFeed.length} items, and no screen shows them`)
