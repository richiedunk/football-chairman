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
import { canFieldEleven } from '../src/engine/systems/matchday'
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
  /**
   * The safety net. Cutting academy intake is only sound if free agents
   * replace what the academy stops producing — so these are reported beside
   * the age bands rather than checked afterwards. A division of correctly-aged
   * squads that cannot raise a side is a worse game than one full of
   * teenagers.
   */
  youth: number
  smallest: number
  belowSixteen: number
  cannotFieldEleven: number
  academy: number
}

const tallies = new Map<number, Tally>()
const blank = (): Tally => ({
  samples: 0, squad: 0, u21: 0, early: 0, prime: 0, late: 0, veteran: 0, wageRoom: 0,
  youth: 0, smallest: Infinity, belowSixteen: 0, cannotFieldEleven: 0, academy: 0,
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
    t.youth += club.facilities.youthFacilities
    t.academy += club.squad.filter((id) => state.players[id]?.isAcademy).length
    t.smallest = Math.min(t.smallest, squad.length)
    if (squad.length < 16) t.belowSixteen++
    if (!canFieldEleven(state, club, state.date.week)) t.cannotFieldEleven++
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

/**
 * Squad health is checked every week, not four times a career.
 *
 * The age bands are a slow-moving average and a mid-season reading is enough.
 * "Can this club raise a side" is not: it is a transient caused by a bad week
 * of injuries, so sampling it once a season is how you get a 1% reading that
 * means nothing and a 0% reading that means no more. Every settled week of
 * every club, against the same rule matchday uses.
 */
let weeksChecked = 0
let weeksShort = 0
let weeksNoEleven = 0
const shortByTier = new Map<number, { weeks: number; short: number; noEleven: number }>()

/**
 * Only clubs that actually had a match, checked BEFORE it is played.
 *
 * A first version checked every club every week and reported twenty
 * club-weeks unable to raise eleven — all of them clubs with no fixture, in a
 * week they were never asked to play. `fixAiSquad` runs for the clubs playing
 * that week and promotes, signs or conjures until a side exists, so a club
 * short in a blank week is not a defect and had already been repaired by the
 * time it needed to be. Measuring a squad at a moment it never has to answer
 * for is the mistake this project has been caught by three times.
 *
 * And it has to be read before the week is ticked, not after. Read afterwards
 * it counts clubs that fielded a side and then lost men *in that match* —
 * which is not a club without a team, it is a club with an injury list and a
 * week to do something about it.
 */
function checkSquadHealth(state: GameState): void {
  const playing = new Set<string>()
  for (const f of state.fixtures) {
    if (f.season === state.date.season && f.week === state.date.week) {
      playing.add(f.homeClubId)
      playing.add(f.awayClubId)
    }
  }
  for (const club of Object.values(state.clubs)) {
    const tier = state.leagues[club.leagueId]?.tier
    if (!tier || !playing.has(club.id)) continue
    const row = shortByTier.get(tier) ?? { weeks: 0, short: 0, noEleven: 0 }
    const size = seniorSquad(state, club).length
    row.weeks++
    weeksChecked++
    if (size < 16) { row.short++; weeksShort++ }
    if (!canFieldEleven(state, club, state.date.week)) { row.noEleven++; weeksNoEleven++ }
    shortByTier.set(tier, row)
  }
}

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    // Read first: this is the squad each club will have to raise a side from.
    if (s >= SETTLE && w >= 6 && w <= 44) checkSquadHealth(state)
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (s < SETTLE) continue
    // Mid-season, well away from the roll and both windows.
    if (w === 30) sample(state)
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

console.log('\ncan every club still raise a side? (only clubs with a fixture that week)')
console.log('  per club:  academy  youth facilities  |  smallest squad'
  + '   club-weeks under 16   club-weeks with no XI')
for (const [tier, t] of [...tallies].sort((a, b) => a[0] - b[0])) {
  const row = shortByTier.get(tier) ?? { weeks: 1, short: 0, noEleven: 0 }
  const pc = (v: number, n: number) => `${((v / Math.max(1, n)) * 100).toFixed(2)}%`.padStart(21)
  console.log(
    `  tier ${tier}   ${(t.academy / t.samples).toFixed(1).padStart(6)}`
    + `${(t.youth / t.samples).toFixed(0).padStart(18)}  |`
    + `${String(t.smallest).padStart(16)}${pc(row.short, row.weeks)}${pc(row.noEleven, row.weeks)}`,
  )
}
console.log(
  `  ${weeksChecked.toLocaleString()} club-weeks checked — `
  + `${weeksShort} under sixteen, ${weeksNoEleven} unable to raise eleven`,
)
