/**
 * Does answering a board mandate move the number the board is watching?
 *
 * `reduceWageBill` is set when a club's wage bill runs past 95% of its
 * allowance, and scored on how far under the allowance it has got. Both
 * numbers are computed inside `board.ts` from the squad's raw contract wages —
 * no staff, and a player loaned out still counted at his full wage. Every
 * other system in the game reads `totalWageBill`, which counts staff and
 * splits a loan by the share that was agreed.
 *
 * So the obvious way to answer the mandate — loan out somebody expensive — may
 * move a number nobody is looking at, while the number the board scores you on
 * does not budge. And the mandate can be handed out to a club whose real bill
 * is comfortable, or withheld from one whose real bill is not, because staff
 * wages are invisible to the test that sets it.
 *
 * This measures the gap rather than arguing about it: across every club in a
 * settled world, what each number says, how often they disagree about whether
 * the mandate should exist at all, and what a loan actually does to each.
 *
 * Run: `SEASONS=8 npx tsx scripts/mandatecheck.ts` (SIZE, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { totalWageBill } from '../src/engine/systems/valuation'
import type { Club, GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 8)
const SEED = process.env.SEED ?? 'MANDATE1'

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
// Stopped mid-season, not at the end of one. The roll returns every loan, so a
// world read at week 52 has nobody out on loan anywhere and the loan half of
// this measurement reads zero — which is exactly how this project has been
// fooled before, and how the first run of this script fooled me.
for (let s = 0; s < SEASONS; s++) {
  const last = s === SEASONS - 1 ? 30 : 52
  for (let w = 1; w <= last; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

/**
 * What `board.ts` used to count: squad contracts at face value, no staff, a
 * loaned-out player at his full wage. Kept so the gap stays measurable after
 * the fix rather than becoming a number nobody can reproduce.
 */
function boardBill(state: GameState, club: Club): number {
  return club.squad.reduce((sum, id) => sum + (state.players[id]?.contract?.wage ?? 0), 0)
}

const clubs = Object.values(state.clubs)
let disagreeOnMandate = 0
let boardSays = 0
let realSays = 0
let gapTotal = 0
let staffTotal = 0
let loanedOutWages = 0
let clubsWithLoansOut = 0

for (const club of clubs) {
  const board = boardBill(state, club)
  const real = totalWageBill(state, club)
  const budget = club.finances.wageBudget
  const boardWants = board > budget * 0.95
  const realWants = real > budget * 0.95
  if (boardWants !== realWants) disagreeOnMandate++
  if (boardWants) boardSays++
  if (realWants) realSays++
  gapTotal += real - board

  staffTotal += club.staff.reduce((sum, id) => sum + (state.staff[id]?.contract?.wage ?? 0), 0)

  const out = club.squad
    .map((id) => state.players[id])
    .filter((p) => p?.loanClubId)
  if (out.length > 0) {
    clubsWithLoansOut++
    // What the board still counts for men who are somebody else's problem.
    loanedOutWages += out.reduce(
      (sum, p) => sum + (p!.contract?.wage ?? 0) * (1 - (p!.loanWageShare ?? 0)), 0,
    )
  }
}

const n = clubs.length
const m = (x: number) => Math.round(x).toLocaleString()

console.log(`world ${SIZE}, ${SEASONS} seasons, seed ${SEED} — ${n} clubs\n`)
console.log('the two numbers, per club per week')
console.log(`  what the board counts        ${m(clubs.reduce((s, c) => s + boardBill(state, c), 0) / n).padStart(10)}`)
console.log(`  what everything else counts  ${m(clubs.reduce((s, c) => s + totalWageBill(state, c), 0) / n).padStart(10)}`)
console.log(`  the gap                      ${m(gapTotal / n).padStart(10)}`)
console.log(`  of which staff wages         ${m(staffTotal / n).padStart(10)}   (invisible to the board)`)

console.log('\nwho gets the mandate')
console.log(`  on the board's number        ${boardSays} clubs`)
console.log(`  on the real number           ${realSays} clubs`)
console.log(`  they disagree about          ${disagreeOnMandate} clubs `
  + `(${((disagreeOnMandate / n) * 100).toFixed(0)}%)`)

console.log('\nthe mandate the board actually sets now')
console.log(`  clubs carrying reduceWageBill  ${clubs.filter((c) => c.board.mandates.includes('reduceWageBill')).length}`)

console.log('\nloaning somebody out')
console.log(`  clubs with a player out on loan            ${clubsWithLoansOut}`)
console.log(`  wages those loans move off the real bill   ${m(loanedOutWages)}`)
console.log(`  wages those loans move off the board's     ${m(0)}   <- the bug`)
