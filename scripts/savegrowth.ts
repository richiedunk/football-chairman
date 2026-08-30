/**
 * How big is a save, and what makes it bigger?
 *
 * Two questions with different answers. At world creation the save is almost
 * entirely *world* — clubs, squads, staff, fixtures — and its size is set by
 * the world size the player picked. Over a career it grows, and what grows is
 * a different set of things: the news feed, the inbox, the XP log, career
 * history, and whatever the season roll leaves behind. A save that doubles
 * over thirty-five seasons is fine. One that grows without bound is a bug that
 * takes seven years of play to show up, which is exactly the kind this project
 * has to find by running rather than by reading.
 *
 * So this runs a full career to the age cap, taking the size and a per-key
 * breakdown every five seasons, and reports both the raw JSON and what
 * actually goes into IndexedDB, which is the gzipped bytes.
 *
 * Run: `npx tsx scripts/savegrowth.ts` (SIZE=compact|standard|large, SEED=...)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import { compress } from '../src/storage/adapter'
import type { GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'GROW1', directorName: 'Richie Dunk', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }
const startSeason = state.date.season

/** Bytes each top-level key contributes to the serialised save. */
function breakdown(s: GameState): [string, number][] {
  return Object.entries(s)
    .map(([key, value]) => [key, JSON.stringify(value)?.length ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
const kb = (n: number) => `${Math.round(n / 1024)}k`

const rows: { season: number; raw: number; packed: number; top: string }[] = []

async function sample(label: string) {
  const json = JSON.stringify(state)
  const packed = await compress(json)
  const top = breakdown(state).slice(0, 5).map(([k, n]) => `${k} ${kb(n)}`).join('  ')
  rows.push({ season: state.date.season - startSeason, raw: json.length, packed: packed.length, top })
  console.log(`${label.padEnd(12)} raw ${mb(json.length).padStart(8)}  stored ${mb(packed.length).padStart(8)}   ${top}`)
}

console.log(`world: ${SIZE} — ${Object.keys(setup.state.clubs).length} clubs, `
  + `${Object.keys(setup.state.players).length} players\n`)
console.log('when         raw JSON     in IndexedDB   biggest keys')
await sample('at creation')

let weeks = 0
let sackings = 0
// The point is thirty-five seasons of play, so a sacking is not the end of the
// run: take the first post that will have you and carry on, the way a career
// actually goes.
while (state.director.retiredAtSeason === undefined && weeks < 52 * 40) {
  advanceWeek(state, deps)
  weeks++
  if (state.playerClubId === null) {
    const offer = state.director.jobOffers.find((o) => !o.barred)
    if (offer) {
      sackings++
      acceptJobOffer(state, offer.id)
    }
  }
  const season = state.date.season - startSeason
  if (state.date.week === 1 && season > 0 && season % 5 === 0) {
    await sample(`season ${season}`)
  }
}
await sample('at retirement')

const first = rows[0]
const last = rows[rows.length - 1]
console.log(`\n${weeks} weeks, ${rows[rows.length - 1].season} seasons, ${sackings} sackings`)
console.log(`growth: raw x${(last.raw / first.raw).toFixed(2)}, stored x${(last.packed / first.packed).toFixed(2)}`)
console.log(`stored per season after creation: `
  + `${kb((last.packed - first.packed) / Math.max(1, last.season))}`)

console.log('\nwhat a finished career is made of:')
for (const [key, bytes] of breakdown(state).slice(0, 12)) {
  console.log(`  ${key.padEnd(18)} ${kb(bytes).padStart(8)}  ${((bytes / last.raw) * 100).toFixed(1)}%`)
}

// Which lists are capped and which are not. Counting beats guessing: the news
// feed and inbox turned out to be pruned (250 and 150), and `xpLog` is not an
// unbounded log at all — the season review clears it, so it holds one season.
// The genuinely linear one is `club.history`, inside `clubs`.
console.log('\nlist lengths at the end:')
for (const [label, n] of [
  ['newsFeed', state.newsFeed.length],
  ['inbox', state.inbox.length],
  ['director.xpLog', state.director.xpLog.length],
  ['director.earnings', state.director.earnings.length],
  ['director.careerHistory', state.director.careerHistory.length],
  ['players', Object.keys(state.players).length],
  ['clubs', Object.keys(state.clubs).length],
  ['fixtures', Object.keys(state.fixtures).length],
] as [string, number][]) {
  console.log(`  ${label.padEnd(24)} ${n.toLocaleString().padStart(8)}`)
}
