/**
 * How much of the world does one week actually change?
 *
 * The claim that the whole state must live in memory is only true if a week
 * touches all of it. It does not obviously: the tick is already staggered, so
 * development runs for half the clubs each week at double weight, revaluation
 * for an eighth, and the free-agent pass only wants players with no club.
 *
 * What makes it *look* like everything is needed is that those passes are
 * written as `Object.values(state.players)` followed by a `continue` — a scan
 * where a database would use an index. Reading one field of 22,571 players to
 * skip 20,000 of them costs nothing today, because they are all in memory
 * anyway. It is the thing that would defeat paging, and it is a property of
 * the loops rather than of the simulation.
 *
 * So this measures the part that is not a matter of how the loops are written:
 * how many players a week actually *modifies*. That is the floor for any
 * scheme that keeps cold entities on disk — whatever is written back has to
 * have been resident.
 *
 * Measured by comparing each player's serialised form either side of a tick,
 * which catches a change anywhere in the object rather than in fields someone
 * remembered to check.
 *
 * ## What it found
 *
 * 73% of players change every week, across eight consecutive weeks of a
 * settled world — 19,541 of 26,878, never below 68%. The hot set is the world.
 *
 * So keeping cold players on disk does not work here, and not because of how
 * the loops are written: three quarters of the table would have to be paged in
 * and written back every week regardless. That follows from a decision made
 * early and on purpose — the whole world is simulated, because a world where
 * only your players improve has a broken transfer market inside two years.
 * Living with a large resident state is the price of that, and it is a fair
 * one.
 *
 * What this does *not* say is that everything must be resident. It measures
 * players, which are 87% of the save, and it measures change rather than
 * reads. Two things it leaves open, both real:
 *
 *   - Fields the engine never touches. `careerStats` is roughly 9.7MB of raw
 *     JSON after the tuple change, is written only at the season roll, and is
 *     read by nothing in `src/` — it could live in its own store and be
 *     fetched when a career screen asks for it.
 *   - The 141MB spike when a save is written, which is a serialisation
 *     problem rather than a residency one: one 56MB string built in one
 *     allocation. Streaming it per table would remove the spike without the
 *     engine changing at all.
 *
 * Run: `WEEKS=8 npx tsx scripts/workingset.ts` (SIZE, SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import type { GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SETTLE = Number(process.env.SEASONS ?? 6)
const WEEKS = Number(process.env.WEEKS ?? 8)
const SEED = process.env.SEED ?? 'WORK1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
for (let s = 0; s < SETTLE; s++) {
  for (let w = 1; w <= 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

const snapshot = (s: GameState): Map<string, string> => {
  const out = new Map<string, string>()
  for (const [id, p] of Object.entries(s.players)) out.set(id, JSON.stringify(p))
  return out
}

console.log(`world ${SIZE}, settled ${SETTLE} seasons, seed ${SEED}`)
console.log(`${Object.keys(state.players).length.toLocaleString()} players in the world\n`)
console.log('  week   players changed   share   bytes changed   share of table')

let totalChanged = 0
let totalPlayers = 0
for (let w = 0; w < WEEKS; w++) {
  const before = snapshot(state)
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  const after = snapshot(state)

  let changed = 0
  let changedBytes = 0
  let tableBytes = 0
  for (const [id, now] of after) {
    tableBytes += now.length
    const was = before.get(id)
    if (was === undefined || was !== now) {
      changed++
      changedBytes += now.length
    }
  }
  totalChanged += changed
  totalPlayers = after.size
  console.log(
    `  ${String(w + 1).padStart(4)}${changed.toLocaleString().padStart(17)}`
    + `${`${((changed / after.size) * 100).toFixed(0)}%`.padStart(8)}`
    + `${`${(changedBytes / 1e6).toFixed(1)}MB`.padStart(16)}`
    + `${`${((changedBytes / tableBytes) * 100).toFixed(0)}%`.padStart(16)}`,
  )
}

const mean = totalChanged / WEEKS
console.log(
  `\nmean ${Math.round(mean).toLocaleString()} of ${totalPlayers.toLocaleString()} players change in a week`
  + ` (${((mean / totalPlayers) * 100).toFixed(0)}%).`,
)
console.log(
  'That is the floor for keeping cold players on disk: anything written back'
  + '\nhad to be resident. Whether the rest could stay out depends on the scans,'
  + '\nwhich read a field of every player to skip most of them.',
)
