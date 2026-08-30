import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { OWNER_LABELS } from '../src/engine/systems/ownership'
import type { OwnerKind } from '../src/engine/types'

/**
 * Not how many clubs are in crisis, but how long they stay there.
 *
 * Incidence alone cannot answer whether crisis is working. A club passing
 * through a bad two years is football; a club stuck there for a decade is a
 * dead club sitting in a division, and the two look identical in a snapshot.
 */
const setup = prepareNewGame({
  seed: 'CRISDUR', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)

const spellStart = new Map<string, number>()
const spells: { clubId: string; weeks: number; kind: OwnerKind; tier: number }[] = []
let weekNo = 0
const everInCrisis = new Set<string>()

const SEASONS = 15
for (let s = 0; s < SEASONS; s++) {
  for (let w = 0; w < 52; w++) {
    advanceWeek(state, { ids: setup.ids, names: setup.names })
    weekNo += 1
    for (const club of Object.values(state.clubs)) {
      if (club.id === state.playerClubId) continue
      const inCrisis = club.finances.inCrisis
      const open = spellStart.get(club.id)
      if (inCrisis && open === undefined) {
        spellStart.set(club.id, weekNo)
        everInCrisis.add(club.id)
      } else if (!inCrisis && open !== undefined) {
        spells.push({
          clubId: club.id,
          weeks: weekNo - open,
          kind: club.board.owner.kind,
          tier: state.leagues[club.leagueId]?.tier ?? 0,
        })
        spellStart.delete(club.id)
      }
    }
  }
}

const clubs = Object.values(state.clubs).length
const stillOpen = [...spellStart.entries()]
const lengths = spells.map((s) => s.weeks).sort((a, b) => a - b)
const median = lengths[Math.floor(lengths.length / 2)] ?? 0

console.log(`${SEASONS} seasons, ${clubs} clubs\n`)
console.log(`clubs that were ever in crisis: ${everInCrisis.size} (${((everInCrisis.size / clubs) * 100).toFixed(0)}%)`)
console.log(`spells that ended:              ${spells.length}`)
console.log(`  median length                 ${median} weeks (${(median / 52).toFixed(1)} seasons)`)
console.log(`  longest                       ${lengths[lengths.length - 1] ?? 0} weeks`)
console.log(`  under one season              ${lengths.filter((l) => l < 52).length}`)
console.log(`  over three seasons            ${lengths.filter((l) => l > 156).length}`)
console.log(`\nstill in crisis at the end:     ${stillOpen.length}`)
for (const [id, start] of stillOpen.slice(0, 8)) {
  const club = state.clubs[id]
  console.log(`  ${club.name.slice(0, 22).padEnd(23)} ${((weekNo - start) / 52).toFixed(1)} seasons  `
    + `${OWNER_LABELS[club.board.owner.kind]}  tier ${state.leagues[club.leagueId]?.tier}`)
}

const byKind = new Map<OwnerKind, number>()
for (const s of spells) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1)
console.log('\nspells by owner kind:')
for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${OWNER_LABELS[k].padEnd(26)} ${n}`)
}
