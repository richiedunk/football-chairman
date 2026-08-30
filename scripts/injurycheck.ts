/**
 * How often do players get hurt, and how many is a club missing?
 *
 * A match report showed three injuries in one game, which did not look like
 * football. The first attempt to check it counted injury events across every
 * fixture in the world and found almost none — because events are only
 * recorded for matches simulated in detail, which is the player's club and
 * nobody else. Counting records is not counting injuries.
 *
 * So this measures two things instead. The rate, from detailed matches only,
 * against roughly a quarter of an injury per team per match in real football.
 * And the burden — how many players a club is actually missing at any moment,
 * which is the figure a director feels and is about two to three in a real
 * senior squad.
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'

const setup = prepareNewGame({
  seed: 'INJ1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

const burden: number[] = []
const mineSeries: number[] = []
const othersSeries: number[] = []
let worst = 0

const injuredCount = (clubId: string) =>
  state.clubs[clubId].squad.filter((id) => state.players[id]?.injury).length

for (let w = 0; w < 40; w++) {
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  const out = Object.values(state.clubs).map((c) => injuredCount(c.id))
  burden.push(out.reduce((a, b) => a + b, 0) / out.length)
  worst = Math.max(worst, ...out)

  // Sampled every week rather than at the end: one snapshot of one club is
  // noise, and the question is whether the player is systematically worse off.
  mineSeries.push(injuredCount(state.playerClubId!))
  const rest = Object.values(state.clubs).filter((c) => c.id !== state.playerClubId)
  othersSeries.push(rest.reduce((a, c) => a + injuredCount(c.id), 0) / rest.length)
}

// Only the player's club is simulated in detail, so only its fixtures carry a
// full event list. That is the honest sample for a per-match rate.
const detailed = state.fixtures.filter(
  (f) => f.result && (f.homeClubId === state.playerClubId || f.awayClubId === state.playerClubId),
)
const perMatch = new Map<number, number>()
let injuries = 0
for (const f of detailed) {
  const n = f.result!.events.filter((e) => e.type === 'injury').length
  injuries += n
  perMatch.set(n, (perMatch.get(n) ?? 0) + 1)
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

console.log(`detailed matches:     ${detailed.length}`)
console.log(`in-match injuries:    ${injuries}`)
console.log(`per team per match:   ${(injuries / detailed.length / 2).toFixed(2)}  (higher than the real ~0.25, because ours counts knocks)`)
const dist = [...perMatch.entries()].sort((a, b) => a[0] - b[0])
console.log(`spread per match:     ${dist.map(([n, c]) => `${n}:${((c / detailed.length) * 100).toFixed(0)}%`).join('  ')}`)
console.log()
console.log(`missing per club:     ${mean(burden).toFixed(1)} on average  (real senior squad ~2-3)`)
console.log(`worst club all year:  ${worst} out at once`)

// Match injuries are applied by replaying recorded events, and events are only
// recorded for matches simulated in detail — which is the player's club and
// nobody else's. If that is so, the player's squad is the only one in the
// world exposed to them, which is a handicap nobody agreed to.
// The sharpest signal that match injuries reach the whole world rather than
// only the player: how many AI clubs are carrying one right now. Under the old
// behaviour this was 1 of 237 — the single club whose match happened to be
// simulated in detail because it involved a player on the shortlist.
const aiClubs = Object.values(state.clubs).filter((c) => c.id !== state.playerClubId)
const withMatchInjury = aiClubs.filter((c) =>
  c.squad.some((id) => state.players[id]?.injury?.type === 'Match injury'),
).length

console.log()
console.log(`AI clubs hurt in a match: ${withMatchInjury} of ${aiClubs.length}`)
console.log(`your club, 40wk mean: ${mean(mineSeries).toFixed(2)} out`)
console.log(`every other club:     ${mean(othersSeries).toFixed(2)} out`)
const ratio = mean(mineSeries) / mean(othersSeries)
console.log(`you carry ${ratio.toFixed(2)}x the injuries of an AI club`)
