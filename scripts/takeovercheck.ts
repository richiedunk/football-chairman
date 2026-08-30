import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { OWNER_LABELS } from '../src/engine/systems/ownership'
import type { OwnerKind } from '../src/engine/types'

/**
 * How often clubs change hands, and into whose hands.
 *
 * A takeover has to be rare enough to matter and common enough to see. Too
 * many and ownership stops meaning anything; too few and the world is static.
 */
const setup = prepareNewGame({
  seed: 'TAKE', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
const clubCount = Object.keys(state.clubs).length

const startingKinds = new Map<string, OwnerKind>()
for (const c of Object.values(state.clubs)) startingKinds.set(c.id, c.board.owner.kind)

function distribution(label: string) {
  const counts = new Map<OwnerKind, number>()
  for (const c of Object.values(state.clubs)) {
    counts.set(c.board.owner.kind, (counts.get(c.board.owner.kind) ?? 0) + 1)
  }
  const parts = [...counts].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${OWNER_LABELS[k].split(' ')[0].toLowerCase()} ${n}`)
  console.log(`${label.padEnd(14)} ${parts.join(', ')}`)
}

distribution('at creation')
for (let s = 1; s <= 10; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  const changed = [...startingKinds].filter(([id]) =>
    state.clubs[id] && state.clubs[id].board.owner.sinceSeason > 2025).length
  const inFlight = state.takeovers.length
  console.log(
    `season ${String(s).padStart(2)}  clubs sold since start ${String(changed).padStart(3)}/${clubCount}  `
    + `in progress now ${inFlight}`,
  )
}
distribution('after 10')

// Does ownership actually separate the clubs?
const byKind = new Map<OwnerKind, { wage: number; n: number }>()
for (const c of Object.values(state.clubs)) {
  const e = byKind.get(c.board.owner.kind) ?? { wage: 0, n: 0 }
  e.wage += c.finances.wageBudget
  e.n += 1
  byKind.set(c.board.owner.kind, e)
}
console.log('\naverage wage budget by owner kind:')
for (const [kind, e] of [...byKind].sort((a, b) => b[1].wage / b[1].n - a[1].wage / a[1].n)) {
  console.log(`  ${OWNER_LABELS[kind].padEnd(26)} ${Math.round(e.wage / e.n).toLocaleString().padStart(9)}/wk  (${e.n} clubs)`)
}
