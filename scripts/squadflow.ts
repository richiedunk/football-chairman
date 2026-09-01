/**
 * How does a lower-league squad actually get its players, and lose them?
 *
 * The remaining half of the drift. Money is no longer the binding constraint —
 * the league wage curve was bent and a fifth-tier club now has real headroom —
 * but its squad still settles with eight players aged eighteen to twenty and
 * only 3.6 aged twenty-four to thirty-one.
 *
 * Two explanations were on the table. Either recruitment prefers the young, or
 * the young arrive from somewhere recruitment has no say over. `recruitgates.ts`
 * already made the first look unlikely: of 402 free-agent signings a season,
 * 310 were aged 21 or over. So this counts the routes instead.
 *
 * Every arrival and departure, classified by watching each player's club and
 * academy flag week to week rather than by instrumenting a dozen call sites:
 *
 *   - promoted out of the academy
 *   - signed as a free agent
 *   - arrived from another club
 *   - left for another club, or left football entirely
 *
 * Run: `SEASONS=12 npx tsx scripts/squadflow.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import type { GameState, ID } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 12)
const SETTLE = Number(process.env.SETTLE ?? 8)
const SEED = process.env.SEED ?? 'FLOW1'

interface Flow {
  promoted: number
  freeAgent: number
  fromClub: number
  toClub: number
  leftFootball: number
  promotedAge: number
  freeAgentAge: number
}

const flows = new Map<number, Flow>()
const blank = (): Flow => ({
  promoted: 0, freeAgent: 0, fromClub: 0, toClub: 0, leftFootball: 0,
  promotedAge: 0, freeAgentAge: 0,
})

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

for (let s = 0; s < SETTLE; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

/** Where every player was last week: club, and whether he counted as senior. */
function snapshot(state: GameState): Map<ID, { club: ID | null; senior: boolean }> {
  const m = new Map<ID, { club: ID | null; senior: boolean }>()
  for (const p of Object.values(state.players)) {
    m.set(p.id, { club: p.clubId, senior: !p.isAcademy })
  }
  return m
}

function tierOf(state: GameState, clubId: ID | null): number | null {
  if (!clubId) return null
  const club = state.clubs[clubId]
  return club ? state.leagues[club.leagueId]?.tier ?? null : null
}

let before = snapshot(state)
const seasons = SEASONS - SETTLE

for (let s = 0; s < seasons; s++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    const after = snapshot(state)

    for (const [id, now] of after) {
      const was = before.get(id)
      const player = state.players[id]
      if (!was || !player) continue

      // Only senior-squad membership counts. An academy player moving about
      // inside the academy is not a squad arrival.
      const wasSenior = was.senior && was.club !== null
      const isSenior = now.senior && now.club !== null

      if (!wasSenior && isSenior) {
        const tier = tierOf(state, now.club)
        if (tier === null) continue
        const f = flows.get(tier) ?? blank()
        if (was.senior === false && was.club === now.club) {
          f.promoted += 1
          f.promotedAge += player.age
        } else if (was.club === null) {
          f.freeAgent += 1
          f.freeAgentAge += player.age
        } else {
          f.fromClub += 1
        }
        flows.set(tier, f)
      } else if (wasSenior && !isSenior) {
        const tier = tierOf(state, was.club)
        if (tier === null) continue
        const f = flows.get(tier) ?? blank()
        if (now.club === null) f.leftFootball += 1
        else f.toClub += 1
        flows.set(tier, f)
      }
    }
    before = after
  }
}

console.log(`seasons ${SETTLE + 1}-${SEASONS}, seed ${SEED}, per club per season\n`)
console.log('tier   clubs |  promoted (age)   free agent (age)   from a club |   to a club   left football')
for (const tier of [...flows.keys()].sort((a, b) => a - b)) {
  const f = flows.get(tier)!
  const clubs = Object.values(state.clubs)
    .filter((c) => state.leagues[c.leagueId]?.tier === tier).length
  const d = clubs * seasons
  const n = (x: number) => (x / d).toFixed(2).padStart(6)
  const age = (sum: number, count: number) => (count ? (sum / count).toFixed(1) : '—').padStart(4)
  console.log(
    `${String(tier).padStart(4)} ${String(clubs).padStart(7)} | ${n(f.promoted)} (${age(f.promotedAge, f.promoted)})`
    + `      ${n(f.freeAgent)} (${age(f.freeAgentAge, f.freeAgent)})`
    + `        ${n(f.fromClub)} |     ${n(f.toClub)}        ${n(f.leftFootball)}`,
  )
}
