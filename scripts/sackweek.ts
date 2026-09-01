/**
 * What happens in the week the board sacks you.
 *
 * The fix under measurement: a director dismissed by the board used to keep
 * being treated as the club's director for the rest of that same tick — the
 * head coach still filed his weekly relationship update against him, and the
 * squad statuses of a club he no longer ran were still refreshed. Both were
 * reading a `playerClub` captured at the top of the week.
 *
 * A sack is rare enough that it will not show in a short seeded run, so this
 * plays a lot of careers until enough of them end and counts what arrives in
 * the inbox on the way out.
 *
 * Run: `npx tsx scripts/sackweek.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'

const SEEDS = Number(process.env.SEEDS ?? 12)
const WEEKS = Number(process.env.WEEKS ?? 320)

let sackings = 0
let coachMailOnTheWayOut = 0
let statusesRefreshedAfterLeaving = 0
const outgoing: string[] = []

for (let s = 0; s < SEEDS; s++) {
  const setup = prepareNewGame({
    seed: `SACK${s}`, directorName: 'D', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

  for (let w = 0; w < WEEKS; w++) {
    const before = state.playerClubId
    // Item ids rather than a length: the inbox is capped at 150 and stops
    // growing long before a career ends, so counting the difference in length
    // reports nothing. That was this script's own first answer.
    const seen = new Set(state.inbox.map((i) => i.id))
    const club = before ? state.clubs[before] : null
    // A fingerprint of the squad labels, to see whether a club he has left is
    // still having them rewritten.
    const labelsBefore = club ? club.squad.map((id) => state.players[id]?.squadStatus).join() : ''

    const result = advanceWeek(state, { ids: setup.ids, names: setup.names })
    if (!result.sacked || !before) continue

    sackings++
    const arrived = state.inbox.filter((i) => !seen.has(i.id))
    for (const item of arrived) {
      outgoing.push(`${item.category}/${item.from}`)
      if (item.category === 'coach') coachMailOnTheWayOut++
    }
    const after = club ? club.squad.map((id) => state.players[id]?.squadStatus).join() : ''
    if (club && after !== labelsBefore) statusesRefreshedAfterLeaving++
  }
}

const tally = new Map<string, number>()
for (const o of outgoing) tally.set(o, (tally.get(o) ?? 0) + 1)

console.log(`${SEEDS} careers, ${WEEKS} weeks each`)
console.log(`${sackings} dismissals\n`)
console.log(`  coach mail in the sacking week        ${coachMailOnTheWayOut}`)
console.log(`  squad labels rewritten after leaving  ${statusesRefreshedAfterLeaving}\n`)
console.log('  what lands in the inbox that week:')
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(38)} ${n}`)
}
