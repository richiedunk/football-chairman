/**
 * What does writing a save actually cost in time?
 *
 * `scripts/playerbytes.ts` settled the size question: the save plateaus at
 * 7.3MB stored and every accumulating array is already capped, so the bytes on
 * disk are not a problem. That leaves the argument nobody has measured, and
 * the only one that would justify restructuring `careerStats` into a tuple:
 * the save is 73MB of *raw JSON* before compression, and every autosave has to
 * build that string, gzip it and write it. On a phone that is work a player
 * can feel.
 *
 * So this times the real pipeline on a played-in world — stringify, gzip,
 * and back — and reports where the milliseconds go. A tuple would shrink the
 * string, so the useful number is how much of the total is stringify and
 * parse rather than compression, which a tuple barely touches.
 *
 * Node's gzip is not a phone's `CompressionStream`, and a laptop is not a
 * phone. The shape is what transfers: which stage dominates, and roughly what
 * multiple of a frame budget the whole thing is.
 *
 * ## What it found
 *
 * On a standard world — which is what `NewGameView` defaults to, so this is
 * the ordinary case and not a worst one — twelve seasons in:
 *
 *   raw JSON 71.8MB -> gzipped 7.26MB (9.9x)
 *   JSON.stringify   594ms      gzip     843ms   = 1,436ms to write
 *   gunzip           171ms      parse    271ms   =   442ms to read
 *
 * The two halves are not equivalent, and that is the finding. In the browser
 * compression goes through `CompressionStream` piped into a `Response`, which
 * is asynchronous and does not hold the main thread. `JSON.stringify` does,
 * and so does the `TextEncoder` pass that follows it. So the number a player
 * actually feels is the ~594ms, not the 1,436ms — and `game.ts` autosaves on
 * every week tick, against a tick that costs ~275ms. Writing it as
 * `void autosave()` does not help: not awaiting a synchronous stringify does
 * not stop it blocking.
 *
 * Which reframes the case for turning `careerStats` into a tuple. It is worth
 * about 35% of the raw JSON and a tuple takes a record from ~235 bytes to
 * ~90, so roughly a fifth off the whole save: 594ms becomes about 465ms. Real,
 * and nowhere near the biggest lever. Autosaving every fourth week instead of
 * every week is four times the win for one line, and moving serialisation to a
 * worker takes the blocking cost to zero.
 *
 * All of the above is a laptop. Before anyone commits to the worker, measure
 * it on a phone.
 *
 * Run: `SEASONS=12 npx tsx scripts/savetiming.ts` (SIZE, SEED)
 */
import { gzipSync, gunzipSync } from 'node:zlib'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 12)
const SEED = process.env.SEED ?? 'TIME1'
const RUNS = Number(process.env.RUNS ?? 5)

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

/** Median of a few runs: a single timing on a shared box is noise. */
function median(times: number[]): number {
  const s = [...times].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const time = (label: string, fn: () => unknown): number => {
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now()
    fn()
    times.push(performance.now() - t)
  }
  const ms = median(times)
  console.log(`  ${label.padEnd(26)}${ms.toFixed(0).padStart(6)} ms`)
  return ms
}

console.log(`world ${SIZE}, ${SEASONS} seasons, seed ${SEED}, median of ${RUNS}\n`)

const json = JSON.stringify(state)
const gz = gzipSync(json)
console.log(`raw JSON ${(json.length / 1e6).toFixed(1)}MB  ->  gzipped ${(gz.length / 1e6).toFixed(2)}MB`
  + `  (${(json.length / gz.length).toFixed(1)}x)\n`)

console.log('writing a save')
const strMs = time('JSON.stringify', () => JSON.stringify(state))
const gzMs = time('gzip', () => gzipSync(json))
console.log(`  ${'total to write'.padEnd(26)}${(strMs + gzMs).toFixed(0).padStart(6)} ms`)

console.log('\nreading one back')
const gunzMs = time('gunzip', () => gunzipSync(gz))
const parseMs = time('JSON.parse', () => JSON.parse(json))
console.log(`  ${'total to read'.padEnd(26)}${(gunzMs + parseMs).toFixed(0).padStart(6)} ms`)

const shapeMs = strMs + parseMs
const zipMs = gzMs + gunzMs
console.log(
  `\nof ${(shapeMs + zipMs).toFixed(0)}ms round trip, ${(shapeMs).toFixed(0)}ms is the shape of the JSON `
  + `(${((shapeMs / (shapeMs + zipMs)) * 100).toFixed(0)}%) and ${(zipMs).toFixed(0)}ms is compression.`,
)
console.log('A tuple shrinks the first number and barely touches the second.')
