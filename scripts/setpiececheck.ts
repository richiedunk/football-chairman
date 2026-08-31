/**
 * Is the set-piece coach an edge or an inflation?
 *
 * Adding the role changed the goals-per-game figure, but not comparably: a new
 * staff member consumes random draws at world generation, so every player in
 * every club downstream is a different player. Comparing totals across two
 * builds measures the seed, not the coach.
 *
 * So this compares within one world. The same fixtures are played twice from
 * the same seed — once as generated, once with every set-piece coach removed —
 * and the difference is the coach and nothing else.
 *
 * What it has to show: a division where everybody employs one is not a
 * higher-scoring division, because a coach is an advantage over the clubs who
 * have not bothered rather than a bonus applied to football. And a club that
 * has one must beat an otherwise identical club that does not, or the post is
 * a job title again.
 *
 * Run: `npx tsx scripts/setpiececheck.ts` (SEED, MATCHES)
 */
import { generateWorld } from '../src/engine/world/worldGen'
import { simulateMatch } from '../src/engine/sim/match'
import { Rng } from '../src/engine/rng'
import { ROLE_LABELS } from '../src/engine/world/staffGen'
import type { GameState } from '../src/engine/types'

const SEED = process.env.SEED ?? 'SETPIECE1'
const MATCHES = Number(process.env.MATCHES ?? 1500)

function build(): GameState {
  return generateWorld({
    seed: SEED, season: 2025, size: 'compact', homeNationId: 'eng',
    directorName: 'T', background: 'analyst',
  })
}

function stripCoaches(state: GameState): number {
  let removed = 0
  for (const staff of Object.values(state.staff)) {
    if (staff.role !== 'setPieceCoach') continue
    const club = staff.clubId ? state.clubs[staff.clubId] : null
    if (club) club.staff = club.staff.filter((id) => id !== staff.id)
    removed++
  }
  return removed
}

/** The same fixtures, in the same order, from the same seed. */
function play(state: GameState, leagueId: string): { goals: number; n: number } {
  const rng = new Rng(`${SEED}:play`)
  const league = state.leagues[leagueId]
  let goals = 0
  let n = 0
  for (let i = 0; i < MATCHES; i++) {
    const ids = rng.sample(league.clubIds, 2)
    const home = state.clubs[ids[0]]
    const away = state.clubs[ids[1]]
    const r = simulateMatch(state, home, away, rng, { suspendedIds: new Set() }, false)
    goals += r.homeGoals + r.awayGoals
    n++
  }
  return { goals, n }
}

const withCoaches = build()
const without = build()
const removed = stripCoaches(without)

const leagues = Object.values(withCoaches.leagues)
console.log(`${ROLE_LABELS.setPieceCoach} posts in the world: ${removed}`)
const employed = Object.values(withCoaches.clubs)
  .filter((c) => c.staff.some((id) => withCoaches.staff[id]?.role === 'setPieceCoach'))
console.log(`clubs employing one: ${employed.length} of ${Object.keys(withCoaches.clubs).length}\n`)

console.log('division                    with     without   difference')
for (const tier of [1, 2, 5]) {
  const league = leagues.find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const a = play(withCoaches, league.id)
  const b = play(without, league.id)
  const withRate = a.goals / a.n
  const withoutRate = b.goals / b.n
  const share = league.clubIds.filter(
    (id) => withCoaches.clubs[id].staff.some((s) => withCoaches.staff[s]?.role === 'setPieceCoach'),
  ).length
  console.log(
    `${league.name.padEnd(24)}${withRate.toFixed(3).padStart(8)}${withoutRate.toFixed(3).padStart(11)}`
    + `${(withRate - withoutRate >= 0 ? '+' : '') + (withRate - withoutRate).toFixed(3)}`.padStart(13)
    + `   (${share}/${league.clubIds.length} clubs coached)`,
  )
}

// The other half: does having one actually help the club that has one?
//
// The first version of this compared a coached club against a coached
// opponent and then stripped both, so the edge cancelled on each side of the
// comparison and it reported a difference of 0.005 goals — the post looking
// like a job title again, because the measurement was wrong rather than the
// model. The tie has to be a coached club against an *un*coached one.
console.log('\nhead to head — a coached club against one without, his coach removed in the rerun')
const top = leagues.find((l) => l.nationId === 'eng' && l.tier === 1)!
const hasCoach = (state: GameState, id: string) =>
  state.clubs[id].staff.some((s) => state.staff[s]?.role === 'setPieceCoach')
const coached = top.clubIds.find((id) => hasCoach(withCoaches, id))
const opponent = top.clubIds.find((id) => id !== coached && !hasCoach(withCoaches, id))

if (coached && opponent) {
  const trials = 6000
  let forWith = 0
  let againstWith = 0
  let forWithout = 0
  let againstWithout = 0
  for (let i = 0; i < trials; i++) {
    const r1 = simulateMatch(
      withCoaches, withCoaches.clubs[coached], withCoaches.clubs[opponent],
      new Rng(`h2h:${i}`), { suspendedIds: new Set() }, false,
    )
    forWith += r1.homeGoals
    againstWith += r1.awayGoals
    const r2 = simulateMatch(
      without, without.clubs[coached], without.clubs[opponent],
      new Rng(`h2h:${i}`), { suspendedIds: new Set() }, false,
    )
    forWithout += r2.homeGoals
    againstWithout += r2.awayGoals
  }
  const name = withCoaches.clubs[coached].name
  const foe = withCoaches.clubs[opponent].name
  console.log(`${name} v ${foe}, ${trials} runs of the same fixture`)
  console.log(`  with his coach: ${(forWith / trials).toFixed(3)} scored, ${(againstWith / trials).toFixed(3)} conceded`)
  console.log(`  without:        ${(forWithout / trials).toFixed(3)} scored, ${(againstWithout / trials).toFixed(3)} conceded`)
  const swing = (forWith - againstWith - (forWithout - againstWithout)) / trials
  console.log(`  goal difference swing: ${(swing >= 0 ? '+' : '') + swing.toFixed(3)} a game`
    + `, ${(swing * 38 >= 0 ? '+' : '') + (swing * 38).toFixed(1)} over a season`)
} else {
  console.log('  no coached-versus-uncoached tie available in this division')
}
