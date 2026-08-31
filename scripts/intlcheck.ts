/**
 * What does an international break actually cost you?
 *
 * The design claim is that who leaves is a consequence of how you recruited: a
 * squad built at home empties differently from one built on South Americans,
 * and nothing in the code enforces that — it is supposed to fall out of the
 * nationalities you signed. That is a claim about numbers, so it has to be
 * measured rather than asserted.
 *
 * Three things this has to answer before the feature is honest:
 *   1. How many players does a typical club lose in a break? A number nobody
 *      notices is a feature that does not exist; a number that guts the team
 *      is a punishment.
 *   2. Does it vary by club standing and by squad nationality, or does every
 *      club lose the same three men?
 *   3. How often does somebody come back hurt, per season, per club?
 *
 * Run: `npx tsx scripts/intlcheck.ts` (SEED, SEASONS, SIZE)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import {
  INTERNATIONAL_WEEKS, awayCount, isTournamentSeason, nationalSquads,
} from '../src/engine/systems/international'
import type { Club, GameState } from '../src/engine/types'

const SEED = process.env.SEED ?? 'INTL1'
const SEASONS = Number(process.env.SEASONS ?? 2)
const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'

const setup = prepareNewGame({
  seed: SEED, directorName: 'I', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state: GameState = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}%`
}

// --- Who is even eligible, before a ball is kicked --------------------------
const allSquadPlayers = Object.values(state.players).filter((p) => p.clubId && !p.isAcademy)
// One build of the map, read many times: the per-player convenience form
// rebuilds every national squad in the world on each call.
const picked = new Set([...nationalSquads(state).values()].flat().map((p) => p.id))
const internationals = allSquadPlayers.filter((p) => picked.has(p.id))
console.log('=== Standing before the first break ===')
console.log(`Professionals: ${allSquadPlayers.length}`)
console.log(`International standard: ${internationals.length} (${pct(internationals.length, allSquadPlayers.length)})`)

// By division, because the whole claim is that this is a rich-club problem.
const byLeague = new Map<string, { total: number; intl: number }>()
for (const player of allSquadPlayers) {
  const club = state.clubs[player.clubId!]
  const league = club && state.leagues[club.leagueId]
  if (!league) continue
  const row = byLeague.get(league.name) ?? { total: 0, intl: 0 }
  row.total += 1
  if (picked.has(player.id)) row.intl += 1
  byLeague.set(league.name, row)
}
console.log('\nBy division:')
for (const [name, row] of [...byLeague].sort((a, b) => b[1].intl / b[1].total - a[1].intl / a[1].total)) {
  console.log(`  ${name.padEnd(28)} ${String(row.intl).padStart(4)} of ${String(row.total).padStart(4)}  ${pct(row.intl, row.total)}`)
}

// --- Play, and watch the breaks ---------------------------------------------
interface Sample { week: number; season: number; away: number }
const samples: Sample[] = []
const perClub = new Map<string, number[]>()
let tournamentSummers = 0
const dutyInjured = new Set<string>()
let dutyInjuryWeeksLost = 0
let dutyInjuryCount = 0

const watched: Club[] = [...Object.values(state.clubs)]
  .sort((a, b) => b.reputation - a.reputation)
  .filter((_, i, arr) => i === 0 || i === Math.floor(arr.length / 2) || i === arr.length - 1)

for (let s = 0; s < SEASONS; s++) {
  if (isTournamentSeason(state.date.season)) tournamentSummers += 1
  while (true) {
    const week = state.date.week
    const season = state.date.season
    advanceWeek(state, deps)
    if (INTERNATIONAL_WEEKS.includes(week)) {
      for (const club of Object.values(state.clubs)) {
        const away = awayCount(state, club, week)
        if (club.id === watched[0].id || watched.some((w) => w.id === club.id)) {
          const list = perClub.get(club.id) ?? []
          list.push(away)
          perClub.set(club.id, list)
        }
        samples.push({ week, season, away })
      }
    }
    // Duty injuries counted as they appear, by diffing the set week to week.
    // Counting the ones still out at the end measures nothing: by the summer
    // almost all of them have healed.
    for (const player of Object.values(state.players)) {
      if (!player.injury) continue
      if (!player.injury.type.toLowerCase().includes('international')) continue
      if (dutyInjured.has(player.id)) continue
      dutyInjured.add(player.id)
      dutyInjuryCount += 1
      dutyInjuryWeeksLost += player.injury.weeksRemaining
    }
    for (const id of [...dutyInjured]) {
      const p = state.players[id]
      if (!p?.injury || !p.injury.type.toLowerCase().includes('international')) dutyInjured.delete(id)
    }

    if (state.date.season !== season) break
  }
}

const totalAway = samples.reduce((sum, s) => sum + s.away, 0)
const clubBreaks = samples.length
console.log('\n=== What a break costs ===')
console.log(`Breaks measured: ${clubBreaks} club-breaks over ${SEASONS} seasons`)
console.log(`Mean players away per club per break: ${(totalAway / clubBreaks).toFixed(2)}`)
const none = samples.filter((s) => s.away === 0).length
const heavy = samples.filter((s) => s.away >= 4).length
console.log(`Clubs losing nobody: ${pct(none, clubBreaks)}`)
console.log(`Clubs losing four or more: ${pct(heavy, clubBreaks)}`)
console.log(`Worst single break: ${Math.max(...samples.map((s) => s.away))} players`)

console.log('\n=== Three clubs, top to bottom ===')
for (const club of watched) {
  const list = perClub.get(club.id) ?? []
  const league = state.leagues[club.leagueId]?.name ?? '—'
  const mean = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0
  const squad = seniorSquad(state, club).length
  console.log(`${club.name.padEnd(24)} rep ${String(club.reputation).padStart(3)}  ${league.padEnd(22)}`
    + ` squad ${String(squad).padStart(2)}  away/break ${mean.toFixed(2)}  worst ${list.length ? Math.max(...list) : 0}`)
}

// --- Duty injuries ----------------------------------------------------------
console.log('\n=== The other cost ===')
console.log(`Injuries picked up on duty: ${dutyInjuryCount}`
  + ` — ${dutyInjuryWeeksLost} player-weeks lost over ${SEASONS} seasons`)
console.log(`Per break, across the world: ${(dutyInjuryCount / (INTERNATIONAL_WEEKS.length * SEASONS)).toFixed(1)}`)
console.log(`Tournament summers in the run: ${tournamentSummers}`)

const priced = Object.values(state.players).filter((p) => (p.tournamentStock ?? 0) > 0.01)
console.log(`Players carrying a tournament premium: ${priced.length}`)
if (priced.length) {
  const top = priced.sort((a, b) => (b.tournamentStock ?? 0) - (a.tournamentStock ?? 0)).slice(0, 5)
  for (const p of top) {
    console.log(`  ${p.knownAs.padEnd(22)} +${Math.round((p.tournamentStock ?? 0) * 100)}%`
      + `  ${p.caps ?? 0} caps  ${state.clubs[p.clubId!]?.name ?? 'free agent'}`)
  }
}

const capped = Object.values(state.players).filter((p) => (p.caps ?? 0) > 0)
console.log(`\nPlayers with at least one cap after ${SEASONS} seasons: ${capped.length}`)
if (capped.length) {
  const caps = capped.map((p) => p.caps ?? 0).sort((a, b) => a - b)
  console.log(`  median ${caps[Math.floor(caps.length / 2)]}, max ${caps[caps.length - 1]}`)
}
