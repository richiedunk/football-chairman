/**
 * Fitting the attendance curve.
 *
 * `scripts/hoardcheck.ts` found the top flight running at 0.868 mean fill and
 * selling out 1.3 times a season. A real Premier League club is at 95-98% and
 * sells out essentially every week. That single shortfall is why the top flight
 * is permanently short of gate income *and* why `expandStadium` almost never
 * has a reason to fire — one line of arithmetic causing both.
 *
 * The lower tiers are not the problem: 0.69 / 0.60 / 0.54 in tiers 3-5 is
 * roughly what real lower-league football does. So the curve needs to get
 * steeper, not higher — lift the clubs with a big support without lifting
 * anyone else.
 *
 * This tries candidate curves against a real world and reports what each does
 * per tier, so the coefficients are chosen against measured fill rather than
 * by eye.
 *
 * The mirror of the formula below is the dangerous part of this script, and it
 * is exactly how the previous attempt went wrong: a hand-rolled copy that left
 * out `opponentDraw` said no ground in the world ever filled. So before trying
 * anything, it asserts the mirror reproduces `computeAttendance` to the last
 * place at the shipped coefficients. If that assertion ever fails, every number
 * below it is worthless and the script says so instead of printing them.
 *
 * Run: `npx tsx scripts/attendancefit.ts` (SEED, SEASONS)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { computeAttendance } from '../src/engine/sim/match'
import { clamp, Rng } from '../src/engine/rng'
import { naturalCapacity } from '../src/engine/systems/stadium'
import type { Club, GameState } from '../src/engine/types'

const SEED = process.env.SEED ?? 'HOARD1'
const SEASONS = Number(process.env.SEASONS ?? 0)

interface Curve {
  label: string
  /** Constant floor. */
  base: number
  /** Weight on the fanbase term. */
  fan: number
  /** Exponent on fanbase — above 1 steepens, lifting big clubs only. */
  curve: number
  /** Weight on fan mood. */
  mood: number
  /**
   * A second fanbase term at a high exponent, so it is worth almost nothing
   * below a big support and a lot above it. This is the shape the measurement
   * asks for: England's top flight is three points short on the mean and badly
   * short on sell-outs, while the divisions below it are already about right,
   * so the correction has to be nearly invisible under a fanbase of 50.
   */
  top: number
  topCurve: number
}

/** What ships today, spelled out as a curve so the mirror can be checked. */
const SHIPPED: Curve = {
  label: 'shipped', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.3, topCurve: 4,
}

/**
 * `demand` is the crowd the club could draw, as a multiple of its ground —
 * above 1 means supporters turned away, which is the only thing that makes a
 * club build.
 */
function fillFor(home: Club, away: Club, noise: number, c: Curve): { fill: number; demand: number } {
  const f = home.fanbase / 100
  const support = naturalCapacity(home.reputation, home.citySize)
  const share = c.base + Math.pow(f, c.curve) * c.fan + Math.pow(f, c.topCurve) * c.top
    + (home.fanMood / 100) * c.mood
  const opponentDraw = clamp((away.reputation - 40) / 260, -0.04, 0.12)
  const wanted = support * Math.max(0.18, share + opponentDraw + noise)
  const capacity = home.facilities.stadium.capacity
  return { fill: Math.min(capacity, wanted) / capacity, demand: wanted / capacity }
}

/**
 * The mirror has to be the same function. Checked against the real one on real
 * clubs, drawing the same noise from the same stream, before anything else runs.
 */
/** The shipped expression, spelled out once so the check below is exact. */
function mirrorShare(home: Club, away: Club, noise: number): number {
  const f = home.fanbase / 100
  return SHIPPED.base + Math.pow(f, SHIPPED.curve) * SHIPPED.fan
    + Math.pow(f, SHIPPED.topCurve) * SHIPPED.top + (home.fanMood / 100) * SHIPPED.mood
    + clamp((away.reputation - 40) / 260, -0.04, 0.12) + noise
}

function verifyMirror(state: GameState): void {
  const clubs = Object.values(state.clubs)
  let checked = 0
  for (let i = 0; i < 400; i++) {
    const home = clubs[i % clubs.length]
    const away = clubs[(i * 7 + 3) % clubs.length]
    if (home.id === away.id || home.facilities.stadium.capacity === 0) continue
    // Two identically seeded streams, so `normal` yields the same draw to both.
    const real = computeAttendance(home, away, new Rng(`mirror:${i}`), false)
    const noise = new Rng(`mirror:${i}`).normal(0, 0.05)
    const mine = Math.min(
      home.facilities.stadium.capacity,
      Math.round(
        naturalCapacity(home.reputation, home.citySize)
        * Math.max(0.18, mirrorShare(home, away, noise)),
      ),
    )
    if (real !== mine) {
      throw new Error(
        `mirror disagrees with computeAttendance on ${home.name} v ${away.name}: `
        + `${real} vs ${mine}. Every number this script prints depends on these `
        + `being the same function. Fix the mirror before reading anything below.`,
      )
    }
    checked++
  }
  console.log(`mirror verified against computeAttendance on ${checked} fixtures\n`)
}

const setup = prepareNewGame({
  seed: SEED, directorName: 'D', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
for (let s = 0; s < SEASONS; s++) {
  for (let w = 1; w <= 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

verifyMirror(state)

/** Every club at home to every other club in its league — the fixture list. */
function homeFixtures(state: GameState): { tier: number; home: Club; away: Club }[] {
  const byLeague = new Map<string, Club[]>()
  for (const club of Object.values(state.clubs)) {
    const list = byLeague.get(club.leagueId) ?? []
    list.push(club)
    byLeague.set(club.leagueId, list)
  }
  const out: { tier: number; home: Club; away: Club }[] = []
  for (const [leagueId, clubs] of byLeague) {
    const tier = state.leagues[leagueId]?.tier
    if (!tier) continue
    for (const home of clubs) {
      for (const away of clubs) {
        if (home.id !== away.id) out.push({ tier, home, away })
      }
    }
  }
  return out
}

const fixtures = homeFixtures(state)
// One noise draw per fixture, shared across every candidate, so the curves are
// compared on the same season rather than on their own luck.
const noises = fixtures.map((_, i) => new Rng(`noise:${i}`).normal(0, 0.05))

/**
 * Real-world fill, for the tiers this is being fitted against. English top
 * flight runs near capacity; the lower divisions genuinely do not.
 */
const REAL: Record<string, string> = {
  // Premier League utilisation ran 97.6-98.8% across 2024/25 and 2025/26. The
  // EFL figures are average attendance over a rough average capacity for the
  // division, so they carry a point or two either way; the game is already
  // inside that margin for all three, which is why they are left alone.
  'eng t1': '0.98', 'other t1': '~0.80', 't2': '0.79', 't3': '0.67', 't4': '0.61', 't5': '~0.47',
}

/**
 * Groups worth fitting separately.
 *
 * "Tier 1" is the top flight of every nation in the world, 144 clubs of wildly
 * different size — comparing its mean to the Premier League is meaningless.
 * England's top flight is the thing the real figures describe.
 */
function groupOf(f: { tier: number; home: Club }): string | null {
  if (f.tier === 1) return f.home.nationId === 'eng' ? 'eng t1' : 'other t1'
  return `t${f.tier}`
}

const GROUPS = ['eng t1', 'other t1', 't2', 't3', 't4', 't5']

/**
 * Reported unclamped as well as clamped. The clamped mean is what supporters
 * see; the unclamped one is the demand, and a club only ever builds because
 * demand is above 1. A mean fill of 0.88 can mean "comfortably short of full"
 * or "full every week with a queue outside", and only the unclamped number
 * tells the two apart.
 */
function report(c: Curve): void {
  const byGroup = new Map<string, { fill: number; demand: number }[]>()
  fixtures.forEach((f, i) => {
    const group = groupOf(f)
    if (!group) return
    const list = byGroup.get(group) ?? []
    list.push(fillFor(f.home, f.away, noises[i], c))
    byGroup.set(group, list)
  })
  const cells = GROUPS.map((g) => {
    const rows = byGroup.get(g) ?? []
    if (rows.length === 0) return '—'.padStart(16)
    const mean = rows.reduce((a, b) => a + b.fill, 0) / rows.length
    const demand = rows.reduce((a, b) => a + b.demand, 0) / rows.length
    const full = rows.filter((r) => r.fill >= 1).length / rows.length
    return `${mean.toFixed(2)}/${demand.toFixed(2)} ${String(Math.round(full * 100)).padStart(3)}%`
  })
  console.log(`  ${c.label.padEnd(22)}${cells.join('  ')}`)
}

console.log(`  ${'group'.padEnd(22)}${GROUPS.map((g) => g.padStart(16)).join('')}`)
console.log(`  ${'real world (fill)'.padEnd(22)}${GROUPS.map((g) => REAL[g].padStart(16)).join('')}`)
console.log(`  ${'below: fill/demand, % of fixtures full'.padEnd(22)}\n`)

const candidates: Curve[] = [
  SHIPPED,
  { label: 'before this change', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0, topCurve: 4 },
  // The power curves tried first. They lift the top flight, but only by
  // dragging the lower divisions well below what real lower-league football
  // does — a fix for one tier paid for by four.
  { label: 'power 1.6 / 0.78', base: 0.28, fan: 0.78, curve: 1.6, mood: 0.16, top: 0, topCurve: 4 },
  { label: 'power 2.0 / 1.05', base: 0.26, fan: 1.05, curve: 2.0, mood: 0.16, top: 0, topCurve: 4 },
  // The shipped curve, plus a term that only bites at a big support.
  { label: 'shipped + top^4 0.20', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.20, topCurve: 4 },
  { label: 'shipped + top^4 0.25', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.25, topCurve: 4 },
  { label: 'shipped + top^4 0.30', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.30, topCurve: 4 },
  { label: 'shipped + top^4 0.35', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.35, topCurve: 4 },
  { label: 'shipped + top^4 0.40', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.40, topCurve: 4 },
  { label: 'shipped + top^5 0.55', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.55, topCurve: 5 },
  { label: 'shipped + top^6 0.75', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.75, topCurve: 6 },
  { label: 'shipped + top^3 0.45', base: 0.42, fan: 0.4, curve: 1, mood: 0.16, top: 0.45, topCurve: 3 },
]
for (const c of candidates) report(c)

const fanbases = new Map<number, number[]>()
for (const club of Object.values(state.clubs)) {
  const tier = state.leagues[club.leagueId]?.tier
  if (!tier) continue
  const list = fanbases.get(tier) ?? []
  list.push(club.fanbase)
  fanbases.set(tier, list)
}
console.log('\nfanbase by tier (the curve\'s only real input)')
for (const [tier, list] of [...fanbases].sort((a, b) => a[0] - b[0])) {
  const sorted = [...list].sort((a, b) => a - b)
  console.log(
    `  t${tier}  mean ${(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1).padStart(5)}`
    + `   min ${String(sorted[0]).padStart(3)}   max ${String(sorted[sorted.length - 1]).padStart(3)}`,
  )
}
