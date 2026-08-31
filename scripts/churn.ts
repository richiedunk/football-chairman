/**
 * Where do players enter and leave the professional game?
 *
 * The world starts at 26.0 senior professionals a club and settles at 21.7,
 * which is `FREE_AGENT_TARGET` (21) rather than `TARGET_SENIOR_SQUAD` (24).
 * That says a cap is binding rather than supply running short — there are
 * 3,100 unsigned free agents — but it does not say which channel is failing to
 * fill the gap, and the fix is different depending on the answer.
 *
 * So this counts the actual transitions. Nothing in the engine is
 * instrumented: every week the world is diffed against the week before, and a
 * player who was academy and is now senior is a promotion whatever the code
 * path was. That is the only way to be sure the count is of what happened
 * rather than of what a function was asked to do.
 *
 * Run: `npx tsx scripts/churn.ts` (SIZE, SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  EMERGENCY_SQUAD, FREE_AGENT_TARGET, TARGET_SENIOR_SQUAD, seniorSquad,
} from '../src/engine/systems/aiSquad'
import type { GameState, Player } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 12)

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'CHURN1', directorName: 'R', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }
const startSeason = state.date.season

type Bucket = 'senior' | 'academy' | 'free'
function bucketOf(p: Player): Bucket {
  if (p.isAcademy) return 'academy'
  return p.clubId ? 'senior' : 'free'
}

/** One row per season of every transition the world made. */
interface Churn {
  intake: number        // appeared as an academy player
  promoted: number      // academy -> senior
  signedFree: number    // free -> senior
  expired: number       // senior -> free
  transferred: number   // senior -> senior, different club
  retiredSenior: number // senior -> gone
  leftFree: number      // free -> gone
  leftAcademy: number   // academy -> gone
}
const blank = (): Churn => ({
  intake: 0, promoted: 0, signedFree: 0, expired: 0,
  transferred: 0, retiredSenior: 0, leftFree: 0, leftAcademy: 0,
})

function snapshot(s: GameState): Map<string, { bucket: Bucket; clubId: string | null }> {
  const m = new Map<string, { bucket: Bucket; clubId: string | null }>()
  for (const p of Object.values(s.players)) m.set(p.id, { bucket: bucketOf(p), clubId: p.clubId })
  return m
}

let prev = snapshot(state)
let season = blank()

function diff(now: Map<string, { bucket: Bucket; clubId: string | null }>) {
  for (const [id, cur] of now) {
    const was = prev.get(id)
    if (!was) {
      if (cur.bucket === 'academy') season.intake++
      else if (cur.bucket === 'senior') season.promoted++ // generated straight in
      continue
    }
    if (was.bucket === cur.bucket) {
      if (cur.bucket === 'senior' && was.clubId !== cur.clubId) season.transferred++
      continue
    }
    if (was.bucket === 'academy' && cur.bucket === 'senior') season.promoted++
    else if (was.bucket === 'free' && cur.bucket === 'senior') season.signedFree++
    else if (was.bucket === 'senior' && cur.bucket === 'free') season.expired++
    else if (was.bucket === 'academy' && cur.bucket === 'free') season.expired++
  }
  for (const [id, was] of prev) {
    if (now.has(id)) continue
    if (was.bucket === 'senior') season.retiredSenior++
    else if (was.bucket === 'free') season.leftFree++
    else season.leftAcademy++
  }
  prev = now
}

/** How many clubs sit at each of the three thresholds the code names. */
function ceilingBite(s: GameState) {
  const sizes = Object.values(s.clubs)
    .filter((c) => c.id !== s.playerClubId)
    .map((c) => seniorSquad(s, c).length)
  const at = (lo: number, hi: number) => sizes.filter((n) => n >= lo && n <= hi).length
  return {
    mean: (sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1),
    belowEmergency: sizes.filter((n) => n < EMERGENCY_SQUAD).length,
    atFreeCap: at(FREE_AGENT_TARGET, FREE_AGENT_TARGET + 1),
    inTheGap: at(FREE_AGENT_TARGET + 1, TARGET_SENIOR_SQUAD - 1),
    atTarget: sizes.filter((n) => n >= TARGET_SENIOR_SQUAD).length,
    clubs: sizes.length,
  }
}

console.log(`world: ${SIZE} — ${Object.keys(state.clubs).length} clubs`)
console.log(`caps: emergency ${EMERGENCY_SQUAD}, free-agent ${FREE_AGENT_TARGET}, target ${TARGET_SENIOR_SQUAD}\n`)
console.log('        IN                        OUT                     squad')
console.log('season  intake  promo  free-in  transf  expire  retire  free-out  acad-out   mean')

for (let n = 1; n <= SEASONS; n++) {
  season = blank()
  for (let week = 0; week < 52; week++) {
    advanceWeek(state, deps)
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
    diff(snapshot(state))
    if (state.director.retiredAtSeason !== undefined) break
  }
  const bite = ceilingBite(state)
  console.log(
    String(state.date.season - startSeason).padStart(6)
    + String(season.intake).padStart(8) + String(season.promoted).padStart(7)
    + String(season.signedFree).padStart(9) + String(season.transferred).padStart(8)
    + String(season.expired).padStart(8) + String(season.retiredSenior).padStart(8)
    + String(season.leftFree).padStart(10) + String(season.leftAcademy).padStart(10)
    + bite.mean.padStart(7),
  )
  if (state.director.retiredAtSeason !== undefined) break
}

const bite = ceilingBite(state)
console.log(`\nwhere ${bite.clubs} AI clubs sit at the end:`)
console.log(`  below emergency (<${EMERGENCY_SQUAD})        ${bite.belowEmergency}`)
console.log(`  at the free-agent cap (${FREE_AGENT_TARGET}-${FREE_AGENT_TARGET + 1})    ${bite.atFreeCap}`)
console.log(`  in the reserved gap (${FREE_AGENT_TARGET + 1}-${TARGET_SENIOR_SQUAD - 1})     ${bite.inTheGap}`)
console.log(`  at or above target (${TARGET_SENIOR_SQUAD}+)      ${bite.atTarget}`)

const free = Object.values(state.players).filter((p) => !p.clubId && !p.isAcademy)
const promotable = Object.values(state.players).filter((p) => p.isAcademy && p.age >= 17)
console.log(`\nsupply available but unused:`)
console.log(`  free agents                  ${free.length}`)
console.log(`  academy players aged 17+     ${promotable.length}`)
console.log(`  clubs short of target need   ${Object.values(state.clubs)
  .filter((c) => c.id !== state.playerClubId)
  .reduce((a, c) => a + Math.max(0, TARGET_SENIOR_SQUAD - seniorSquad(state, c).length), 0)}`)
