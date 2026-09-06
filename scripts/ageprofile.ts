/**
 * What a squad in each division is actually made of.
 *
 * The oldest open failure in the project. A club needs a spine of players in
 * their prime; the lower divisions settled with a handful of them and a heap
 * of teenagers, and the acceptance target has been eight or more aged 24-31
 * per club since it was set.
 *
 * Every attempt to change *who a club will accept* has failed — the ability
 * ceiling, the squad target, the promotion order, the unattached decline —
 * and the two things that worked both changed *what the pool contains*. So
 * this reports the pool alongside the squads: if clubs are not signing grown
 * men, the first question is whether any are available to sign.
 *
 * Read at equilibrium, not at the roll. Reading a squad at the season roll has
 * caught this project out three times: the roll returns every loanee and
 * releases every out-of-contract player at once, so anything measured there
 * describes a moment no player ever sees.
 *
 * Run: `SEASONS=14 npx tsx scripts/ageprofile.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { GameState, Player } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 14)
const SETTLE = Number(process.env.SETTLE ?? 10)
const SEED = process.env.SEED ?? 'AGE1'
/** The acceptance test: players in their prime, per club. */
const TARGET_PRIME = 8

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

interface Tally {
  samples: number
  squad: number
  u21: number
  early: number
  prime: number
  late: number
  veteran: number
  wageRoom: number
}

const tallies = new Map<number, Tally>()
const blank = (): Tally => ({
  samples: 0, squad: 0, u21: 0, early: 0, prime: 0, late: 0, veteran: 0, wageRoom: 0,
})

/**
 * Unattached players, which is the pool every club recruits from — reported
 * with the world's totals beside it so the accounting closes. A pool that
 * grows while squads also grow means the world is making or keeping more
 * players, not that clubs stopped signing, and the two are worth telling
 * apart before either is called a result.
 */
interface Pool { total: number; prime: number; world: number; contracted: number; academy: number }
let pool: Pool = { total: 0, prime: 0, world: 0, contracted: 0, academy: 0 }
let poolSamples = 0

const isPrime = (p: Player): boolean => p.age >= 24 && p.age <= 31

function sample(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    const tier = state.leagues[club.leagueId]?.tier
    if (!tier) continue
    const t = tallies.get(tier) ?? blank()
    const squad = seniorSquad(state, club)
    t.samples++
    t.squad += squad.length
    for (const p of squad) {
      if (p.age < 21) t.u21++
      else if (p.age < 24) t.early++
      else if (p.age <= 31) t.prime++
      else if (p.age <= 34) t.late++
      else t.veteran++
    }
    t.wageRoom += club.finances.wageBudget
    tallies.set(tier, t)
  }
  const all = Object.values(state.players)
  const free = all.filter((p) => !p.clubId)
  pool = {
    total: pool.total + free.length,
    prime: pool.prime + free.filter(isPrime).length,
    world: pool.world + all.length,
    contracted: pool.contracted + all.filter((p) => p.clubId && !p.isAcademy).length,
    academy: pool.academy + all.filter((p) => p.isAcademy).length,
  }
  poolSamples++
}

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    // Mid-season, well away from the roll and both windows.
    if (s >= SETTLE && w === 30) sample(state)
  }
}

console.log(`seasons ${SETTLE + 1}-${SEASONS}, seed ${SEED}, sampled mid-season\n`)
console.log(`  per club:   squad    U21   21-23   24-31   32-34     35+     vs target of ${TARGET_PRIME}`)
for (const [tier, t] of [...tallies].sort((a, b) => a[0] - b[0])) {
  const per = (v: number) => (v / t.samples).toFixed(1).padStart(6)
  const prime = t.prime / t.samples
  console.log(
    `  tier ${tier}   ${per(t.squad)}${per(t.u21)}${per(t.early)}${per(t.prime)}`
    + `${per(t.late)}${per(t.veteran)}     ${prime >= TARGET_PRIME ? 'MET' : `short by ${(TARGET_PRIME - prime).toFixed(1)}`}`,
  )
}

const avg = (v: number) => Math.round(v / poolSamples).toLocaleString()
console.log(
  `\nworld: ${avg(pool.world)} players — ${avg(pool.contracted)} on senior contracts, `
  + `${avg(pool.academy)} in academies, ${avg(pool.total)} unattached`,
)
console.log(`unattached aged 24-31: ${avg(pool.prime)}`)
