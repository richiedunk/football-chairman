/**
 * A fingerprint of a simulated world.
 *
 * An optimisation that changes no behaviour must leave the world exactly as it
 * found it. Tests cannot prove that — they assert ranges and invariants, so a
 * change that shifts every player's ability by one would sail through most of
 * them. A hash of the whole state after a seeded run either matches or it does
 * not, and there is nothing to argue about.
 *
 * Print it before a change and after. Same number, the refactor was pure.
 * Different number, something moved, and the diff is then worth finding rather
 * than a matter of opinion.
 *
 * This is deliberately strict. A legitimate behaviour change will also alter
 * it, and that is the point: it forces the question "did I mean to change
 * that?" to be asked out loud rather than assumed.
 *
 * Run: `npx tsx scripts/worldhash.ts` (SEED, WEEKS, SIZE)
 */
import crypto from 'node:crypto'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'

const SEED = process.env.SEED ?? 'HASH1'
const WEEKS = Number(process.env.WEEKS ?? 60)
const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'

const setup = prepareNewGame({
  seed: SEED, directorName: 'H', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

const t0 = Date.now()
for (let w = 0; w < WEEKS; w++) advanceWeek(state, deps)
const ms = Date.now() - t0

const json = JSON.stringify(state)
const hash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 24)

console.log(`seed ${SEED}  ${WEEKS} weeks  ${SIZE}`)
console.log(`hash   ${hash}`)
console.log(`speed  ${(ms / WEEKS).toFixed(1)} ms/week`)

// A few figures in plain sight, so a changed hash can be read at a glance
// rather than only compared.
const clubs = Object.values(state.clubs)
const players = Object.values(state.players)
const seniors = players.filter((p) => p.clubId && !p.isAcademy)
const played = state.fixtures.filter((f) => f.result)
const goals = played.reduce((s, f) => s + f.result!.homeGoals + f.result!.awayGoals, 0)
console.log(
  `world  ${clubs.length} clubs, ${players.length} players, ${seniors.length} contracted`
  + `, ${played.length} matches, ${(goals / Math.max(1, played.length)).toFixed(3)} goals a game`,
)
