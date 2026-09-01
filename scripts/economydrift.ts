/**
 * Why does the world get poorer while its players get dearer?
 *
 * `wagedrift.ts` and `rollcheck.ts` established that the young drift and the
 * season roll are one defect and that the binding constraint is price: adult
 * wage demands rise 60-92% in the lower tiers while budgets fall and revenue
 * declines, so clubs afford the same money and fewer men for it. This asks the
 * next question down — what is actually moving.
 *
 * **The hypothesis.** `computeWageDemand` is `(ability/100)^4.5 * 6000`, times
 * a league factor and a few premiums. That exponent is savage: a 15% rise in
 * mean ability is a 1.15^4.5 = 86% rise in wage, all on its own. So if players
 * are quietly getting better — development outpacing decline and retirement —
 * wages inflate hard against an economy with no matching growth term.
 *
 * Revenue has no such multiplier. It is TV (a flat league constant), plus
 * sponsorship (reputation, which mean-reverts), plus matchday (capacity and
 * fanbase). Nothing in it compounds.
 *
 * So this measures both sides on the same clock, per tier per season:
 *
 *   - mean ability of adult professionals, and what the wage curve says that
 *     alone should cost;
 *   - the actual mean wage demand, to see how much of the rise ability explains;
 *   - league reputation, the other multiplier in the wage;
 *   - revenue split into TV, sponsorship and matchday, plus the capacity and
 *     fanbase behind the last one.
 *
 * If ability accounts for most of the wage rise, the fix is in the exponent or
 * in development, not in recruitment or budgets. If revenue's decline is one
 * component rather than all three, that component is the second fix.
 *
 * Run: `SEASONS=14 npx tsx scripts/economydrift.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { revenuePerHead } from '../src/engine/systems/stadium'
import type { Club, GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 14)
const SEED = process.env.SEED ?? 'ECON1'
const SAMPLE_WEEK = 26

interface Row {
  season: number
  tier: number
  ability: number
  wage: number
  curveOnly: number
  leagueRep: number
  clubRep: number
  tv: number
  sponsor: number
  matchday: number
  capacity: number
  fanbase: number
  attendance: number
}

const rows: Row[] = []

function sample(state: GameState, season: number): void {
  const byTier = new Map<number, Club[]>()
  for (const club of Object.values(state.clubs)) {
    const league = state.leagues[club.leagueId]
    if (!league) continue
    const list = byTier.get(league.tier) ?? []
    list.push(club)
    byTier.set(league.tier, list)
  }

  for (const [tier, clubs] of [...byTier].sort((a, b) => a[0] - b[0])) {
    let abilitySum = 0, wageSum = 0, n = 0
    let tv = 0, sponsor = 0, matchday = 0, capacity = 0, fanbase = 0
    let leagueRep = 0, clubRep = 0

    for (const club of clubs) {
      const league = state.leagues[club.leagueId]!
      leagueRep += league.reputation
      clubRep += club.reputation
      tv += league.tvRevenue / 46
      sponsor += (club.finances.sponsorship.shirtValuePerSeason
        + club.finances.sponsorship.kitValuePerSeason) / 52
      matchday += (club.facilities.stadium.capacity * (0.4 + club.fanbase / 220)
        * revenuePerHead(club.facilities.stadium)) / 2
      capacity += club.facilities.stadium.capacity
      fanbase += club.fanbase

      for (const id of club.squad) {
        const p = state.players[id]
        if (!p || p.isAcademy || p.age < 21) continue
        abilitySum += p.currentAbility
        wageSum += p.wageDemand ?? 0
        n++
      }
    }

    const c = clubs.length
    const ability = n ? abilitySum / n : 0
    rows.push({
      season, tier,
      ability,
      wage: n ? wageSum / n : 0,
      // What the wage curve alone says that ability is worth, before any
      // league, nation or personality multiplier. The shape is what matters.
      curveOnly: Math.pow(ability / 100, 4.5) * 6_000,
      leagueRep: leagueRep / c,
      clubRep: clubRep / c,
      tv: tv / c, sponsor: sponsor / c, matchday: matchday / c,
      capacity: capacity / c, fanbase: fanbase / c,
      attendance: 0,
    })
  }
}

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (w === SAMPLE_WEEK) sample(state, s + 1)
  }
}

const n0 = (x: number) => Math.round(x).toLocaleString().padStart(8)
const pc = (a: number, b: number) => `${(((a / Math.max(1e-9, b)) - 1) * 100).toFixed(1)}%`

console.log(`${SEASONS} seasons, seed ${SEED}, week ${SAMPLE_WEEK}\n`)

for (const tier of [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b)) {
  const mine = rows.filter((r) => r.tier === tier)
  console.log(`=== tier ${tier}`)
  console.log('  season  adult CA   curve says   actual wage   lge rep  club rep'
    + '        tv   sponsor  matchday  capacity  fanbase')
  for (const r of mine) {
    console.log(
      `  ${String(r.season).padStart(6)}  ${r.ability.toFixed(1).padStart(8)}`
      + `  ${n0(r.curveOnly)}     ${n0(r.wage)}`
      + `  ${r.leagueRep.toFixed(1).padStart(8)} ${r.clubRep.toFixed(1).padStart(9)}`
      + `  ${n0(r.tv)}  ${n0(r.sponsor)}  ${n0(r.matchday)}`
      + `  ${n0(r.capacity)} ${n0(r.fanbase)}`,
    )
  }
  const a = mine[0], z = mine[mine.length - 1]
  console.log(
    `  change    ability ${pc(z.ability, a.ability)}`
    + `   curve ${pc(z.curveOnly, a.curveOnly)}`
    + `   actual wage ${pc(z.wage, a.wage)}`
    + `   |  tv ${pc(z.tv, a.tv)}  sponsor ${pc(z.sponsor, a.sponsor)}`
    + `  matchday ${pc(z.matchday, a.matchday)}\n`,
  )
}
