/**
 * How much memory does a career actually hold, and what does saving add?
 *
 * The state object graph lives in memory for as long as the game is open —
 * that is simply what the game is. The question worth asking is what a *save*
 * costs on top of it, because `JSON.stringify` does not write bytes anywhere,
 * it builds a string: 73MB of UTF-16 in one allocation, which `TextEncoder`
 * then copies into a second buffer, which compression then reads. None of
 * that is the game state. All of it is transient, and on a phone a transient
 * spike is how a tab gets killed rather than merely slowed.
 *
 * So this reports the heap at rest and at each stage of a write, on a world
 * that has been played rather than one that has just been generated.
 *
 * Run with `--expose-gc` so the at-rest figure is real and not deferred
 * garbage:
 *   node --expose-gc <bundle>
 *
 * Run: `SEASONS=12 npx tsx scripts/savememory.ts` (SIZE, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { streamJson } from '../src/storage/streamJson'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'MEM1'

const gc = (globalThis as { gc?: () => void }).gc
const settle = () => { if (gc) { gc(); gc() } }
const heap = () => process.memoryUsage().heapUsed
const mb = (n: number) => `${(n / 1_048_576).toFixed(0)}MB`

settle()
const baseline = heap()

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

settle()
const atRest = heap()

console.log(`world ${SIZE}, ${SEASONS} seasons, seed ${SEED}`)
if (!gc) console.log('(no --expose-gc: figures include uncollected garbage and read high)')
console.log(`\nthe game itself`)
console.log(`  heap before anything exists   ${mb(baseline)}`)
console.log(`  heap with a played career     ${mb(atRest)}`)
console.log(`  the state graph costs roughly ${mb(atRest - baseline)}`)

// The old path, for comparison: build the whole string, then a byte copy of
// it. Held in variables on purpose — the point is what coexists.
const json = JSON.stringify(state)
const afterString = heap()
const bytes = new TextEncoder().encode(json)
const afterEncode = heap()

console.log(`\nthe old way — stringify the lot`)
console.log(`  after JSON.stringify          ${mb(afterString)}   (+${mb(afterString - atRest)} for a ${(json.length / 1e6).toFixed(0)}MB string)`)
console.log(`  after TextEncoder.encode      ${mb(afterEncode)}   (+${mb(afterEncode - afterString)} for the byte copy)`)
console.log(`  peak over resting state       +${mb(afterEncode - atRest)}`)
console.log(`  a save briefly needs ${((afterEncode - baseline) / Math.max(1, atRest - baseline)).toFixed(1)}x the memory the game sits at.`)

// Keep them alive to here so nothing is collected mid-measurement.
if (json.length === 0 || bytes.length === 0) console.log('unreachable')

// The streaming path. Same output, one piece at a time — so the peak should be
// the largest single chunk rather than the whole save.
settle()
const beforeStream = heap()
let peak = beforeStream
let produced = 0
for (const chunk of streamJson(state)) {
  produced += chunk.length
  const now = heap()
  if (now > peak) peak = now
}
settle()

console.log(`\nthe new way — stream it in pieces`)
console.log(`  heap before                   ${mb(beforeStream)}`)
console.log(`  peak while streaming ${(produced / 1e6).toFixed(0)}MB    ${mb(peak)}   (+${mb(peak - beforeStream)})`)
console.log(`  against the old peak of       +${mb(afterEncode - atRest)}`)
