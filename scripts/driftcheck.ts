/**
 * Where does the young drift actually come from?
 *
 * Over ten seasons the senior squad holds at 24.3 while players aged 21 and
 * over fall from 19.9 a club to 17.2 and under-21s rise to 7.1. Three
 * explanations have already been ruled out by measurement — promotion volume,
 * the registration limits, and squad places — so this stops asking *why* and
 * counts *what*: the age bands, and the flows across the line that matters.
 *
 * A pool shrinks for one of two reasons. Either fewer arrive or more leave.
 * The 21-and-over pool is fed by under-21s having birthdays, by free signings
 * and by transfers; it is drained by releases and retirements. Whichever side
 * is out of balance is the fix, and nothing else is.
 *
 * Run: `npx tsx scripts/driftcheck.ts` (SIZE, SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 20)

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'DRIFT1', directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state: GameState = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

const clubs = () => Object.values(state.clubs).length

/** Everyone in a senior squad anywhere, by age band. */
function bands() {
  const seniors = Object.values(state.clubs).flatMap((c) => seniorSquad(state, c))
  const n = clubs()
  const band = (lo: number, hi: number) =>
    seniors.filter((p) => p.age >= lo && p.age <= hi).length / n
  return {
    total: seniors.length / n,
    u21: band(0, 20),
    early: band(21, 24),
    prime: band(25, 28),
    late: band(29, 32),
    veteran: band(33, 45),
  }
}

/** Who is in a senior squad now, so the next scan can see who left. */
function snapshot(): Map<string, number> {
  const m = new Map<string, number>()
  for (const club of Object.values(state.clubs)) {
    for (const p of seniorSquad(state, club)) m.set(p.id, p.age)
  }
  return m
}

console.log(`world ${SIZE}: ${clubs()} clubs, ${SEASONS} seasons`)
console.log('per club, mid-season\n')
console.log('season  squad   U21  21-24  25-28  29-32   33+   |  aged in  signed in  left 21+')

let prev = snapshot()
for (let s = 0; s <= SEASONS; s++) {
  if (s > 0) for (let w = 0; w < 52; w++) advanceWeek(state, deps)
  // Read mid-season, where the squad is the one that plays.
  if (s === 0) for (let w = 0; w < 15; w++) advanceWeek(state, deps)

  const now = snapshot()
  let agedIn = 0
  let signedIn = 0
  let left = 0
  for (const [id, age] of now) {
    const was = prev.get(id)
    if (was === undefined) {
      // New to a senior squad this season.
      if (age >= 21) signedIn++
    } else if (was <= 20 && age >= 21) {
      agedIn++
    }
  }
  for (const [id, age] of prev) {
    if (age >= 21 && !now.has(id)) left++
  }
  prev = now

  const b = bands()
  const n = clubs()
  console.log(
    `${String(s).padEnd(8)}${b.total.toFixed(1).padStart(5)}`
    + `${b.u21.toFixed(1).padStart(6)}${b.early.toFixed(1).padStart(7)}`
    + `${b.prime.toFixed(1).padStart(7)}${b.late.toFixed(1).padStart(7)}`
    + `${b.veteran.toFixed(1).padStart(6)}   |`
    + `${(agedIn / n).toFixed(2).padStart(9)}${(signedIn / n).toFixed(2).padStart(11)}`
    + `${(left / n).toFixed(2).padStart(10)}`,
  )
}
