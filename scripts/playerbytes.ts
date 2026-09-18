/**
 * What is a player made of, and which part of him grows?
 *
 * `scripts/savegrowth.ts` says the save goes from 3.69MB stored at creation to
 * 6.33MB by season five and 6.86MB by season ten, and that almost all of the
 * growth is the `players` table. That is the right table but the wrong
 * granularity: a table can grow because there are more rows in it or because
 * each row got fatter, and those are different problems with different fixes.
 *
 * So this counts both. Per sample: how many players exist and how they are
 * split between contracted, academy and unattached; the mean bytes per player;
 * and a per-field byte breakdown of the whole table, so a field that
 * accumulates shows up by name rather than as "players got bigger".
 *
 * Measured on the serialised form, because that is the thing that has to fit.
 * Fields are sized by `JSON.stringify` of the value, which is what the save
 * actually writes, so an array that grows by one entry a season is visible as
 * the bytes it will really cost.
 *
 * ## What it found
 *
 * There is no explosion. The player count is flat and even falls — 20.9k at
 * creation, 24.2k by season five, 22.9k by season twenty — so the table grew
 * because each player got fatter, from 854 bytes to 2,026, and then stopped:
 * 2,024 at season fifteen against 2,026 at season twenty.
 *
 * One field is the whole of it. `careerStats` goes from 2 bytes a player to
 * 1,110, which is 25.4MB of a 46.4MB table — 55% of every player in the world.
 * It is one record a season and it is already capped at 25 in
 * `season/work.ts`, which is why it levels off. `club.history` is capped at 40
 * the same way. Every accumulating array in the save is bounded already.
 *
 * And the raw figures overstate it badly. What reaches IndexedDB is gzipped,
 * and a career record is mostly repeated JSON key names, which compress almost
 * perfectly: 8.7x on a played-in world. The save plateaus at **7.3MB stored**
 * against 73MB of raw JSON. Inside a 235-byte record the ten stat integers and
 * their keys are 165 bytes, `clubName` and `leagueName` together are 53, and
 * `clubId` is 16 — so the denormalised names everyone reaches for first are
 * under a quarter of it, and gzip has already had them.
 *
 * Run: `SEASONS=20 npx tsx scripts/playerbytes.ts` (SIZE, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import type { Player } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 20)
const EVERY = Number(process.env.EVERY ?? 5)
const SEED = process.env.SEED ?? 'BYTES1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

const bytes = (v: unknown): number => {
  const s = JSON.stringify(v)
  return s === undefined ? 0 : s.length
}

interface Sample {
  label: string
  players: number
  contracted: number
  academy: number
  free: number
  total: number
  perField: Map<string, number>
  /** Length of anything array-shaped, which is what accumulates. */
  arrayLengths: Map<string, number>
}

const samples: Sample[] = []

function sample(label: string): void {
  const all = Object.values(state.players) as Player[]
  const perField = new Map<string, number>()
  const arrayLengths = new Map<string, number>()
  let total = 0

  for (const p of all) {
    for (const [key, value] of Object.entries(p)) {
      const n = bytes(value)
      perField.set(key, (perField.get(key) ?? 0) + n)
      total += n
      if (Array.isArray(value)) {
        arrayLengths.set(key, (arrayLengths.get(key) ?? 0) + value.length)
      } else if (value && typeof value === 'object') {
        // A record keyed by season or club id grows the same way an array does.
        arrayLengths.set(key, (arrayLengths.get(key) ?? 0) + Object.keys(value).length)
      }
    }
  }

  samples.push({
    label,
    players: all.length,
    contracted: all.filter((p) => p.clubId && !p.isAcademy).length,
    academy: all.filter((p) => p.isAcademy).length,
    free: all.filter((p) => !p.clubId).length,
    total,
    perField,
    arrayLengths,
  })
}

sample('at creation')
for (let s = 1; s <= SEASONS; s++) {
  for (let w = 1; w <= 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
  if (s % EVERY === 0) sample(`season ${s}`)
}

const mb = (n: number) => (n / 1_000_000).toFixed(1)

console.log(`world ${SIZE}, seed ${SEED}\n`)
console.log('how many players, and how fat')
console.log('  when            players  contracted  academy  unattached   table    per player')
for (const s of samples) {
  console.log(
    `  ${s.label.padEnd(14)}${String(s.players).padStart(8)}`
    + `${String(s.contracted).padStart(12)}${String(s.academy).padStart(9)}`
    + `${String(s.free).padStart(12)}${(`${mb(s.total)}MB`).padStart(8)}`
    + `${String(Math.round(s.total / Math.max(1, s.players))).padStart(14)}B`,
  )
}

const first = samples[0]
const last = samples[samples.length - 1]

console.log('\nwhere the bytes are, and which fields grew per player')
console.log('  field                       at creation        now      per player then -> now')
const fields = [...last.perField.keys()]
  .sort((a, b) => (last.perField.get(b) ?? 0) - (last.perField.get(a) ?? 0))
  .slice(0, 14)
for (const f of fields) {
  const a = first.perField.get(f) ?? 0
  const b = last.perField.get(f) ?? 0
  const perA = a / Math.max(1, first.players)
  const perB = b / Math.max(1, last.players)
  const arrow = perB > perA * 1.25 ? '  <-- fatter per player' : ''
  console.log(
    `  ${f.padEnd(26)}${(`${mb(a)}MB`).padStart(10)}${(`${mb(b)}MB`).padStart(11)}`
    + `${`${Math.round(perA)}B`.padStart(14)} -> ${`${Math.round(perB)}B`.padEnd(8)}${arrow}`,
  )
}

console.log('\nthings that accumulate: mean entries per player')
const accum = [...last.arrayLengths.keys()]
  .map((k) => ({
    k,
    then: (first.arrayLengths.get(k) ?? 0) / Math.max(1, first.players),
    now: (last.arrayLengths.get(k) ?? 0) / Math.max(1, last.players),
  }))
  .filter((r) => r.now > 0.05)
  .sort((a, b) => (b.now - b.then) - (a.now - a.then))
for (const r of accum.slice(0, 12)) {
  const grew = r.now > r.then * 1.25 ? '  <-- grows' : ''
  console.log(`  ${r.k.padEnd(26)}${r.then.toFixed(1).padStart(8)} -> ${r.now.toFixed(1).padStart(6)}${grew}`)
}
