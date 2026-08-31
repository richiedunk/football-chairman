/**
 * Does continental competition actually work?
 *
 * Three things have to be true and none of them is obvious from the code: the
 * right clubs qualify, every competition converges from its field to a single
 * winner inside the calendar it is given, and the fixture burden lands on the
 * clubs that are in it rather than on everybody.
 *
 * Run: `npx tsx scripts/continentalcheck.ts` (SEASONS, SIZE, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import { cupWeeksFor, roundsRequired } from '../src/engine/sim/cups'
import { confederationsPresent, allocateFields } from '../src/engine/systems/continental'

const SEASONS = Number(process.env.SEASONS ?? 4)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'CONT1', directorName: 'R', background: 'scout',
  worldSize: (process.env.SIZE ?? 'standard') as 'compact' | 'standard' | 'large',
  homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

console.log('confederations and what they can field:')
for (const conf of confederationsPresent(state)) {
  const fields = allocateFields(state, conf)
  console.log(`  ${conf.padEnd(9)} ${fields.length === 0 ? 'nothing — places stripped'
    : fields.map((f) => `${f.tier} ${f.entrants.length}`).join(', ')}`)
}

const continental = Object.values(state.cups).filter((c) => c.type === 'continental')
console.log(`\n${continental.length} continental competitions created:`)
for (const cup of continental) {
  const weeks = cupWeeksFor(cup.entrantIds.length || 2, cup.type)
  console.log(`  ${cup.name.padEnd(24)} ${String(cup.entrantIds.length).padStart(3)} entrants, `
    + `${roundsRequired(cup.entrantIds.length)} rounds, weeks ${weeks.join(',')}`)
}

// Leagues still promising a place must have somewhere to send them.
const orphaned = Object.values(state.leagues).filter((l) => {
  if (l.continentalPlaces.length === 0) return false
  const nation = Object.values(state.nations).find((n) => n.leagueIds.includes(l.id))
  return !continental.some((c) => c.confederation === nation?.confederation)
})
console.log(`\nleagues awarding a place to nothing: ${orphaned.length}`
  + (orphaned.length ? ` (${orphaned.map((l) => l.name).join(', ')})` : ' — none'))

for (let season = 1; season <= SEASONS; season++) {
  for (let week = 0; week < 52; week++) {
    advanceWeek(state, deps)
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
    // Report just before the roll, while this season's results still stand.
    if (state.date.week === 46) {
      console.log(`\nseason ${season}:`)
      for (const cup of Object.values(state.cups)) {
        if (cup.type !== 'continental') continue
        const winner = cup.winnerId ? state.clubs[cup.winnerId]?.name : null
        const played = state.fixtures.filter((f) => f.competitionId === cup.id).length
        console.log(`  ${cup.name.padEnd(24)} ${String(cup.entrantIds.length).padStart(3)} in, `
          + `${cup.rounds.length} rounds, ${String(played).padStart(3)} ties, `
          + `winner: ${winner ?? 'NONE — did not converge'}`)
      }
      // Fixture burden, compared like with like. The first cut compared
      // qualified clubs against every other club in the world, which is
      // meaningless: a non-league club plays 42 league games and a top-flight
      // one plays 38, so league size swamped the effect. The comparison that
      // means something is a qualified club against its own league-mates.
      const continentalCups = Object.values(state.cups).filter((c) => c.type === 'continental')
      const inEurope = new Set(continentalCups.flatMap((c) => c.entrantIds))
      const played = (clubId: string) => state.fixtures.filter(
        (f) => f.result && (f.homeClubId === clubId || f.awayClubId === clubId),
      ).length
      const gaps: number[] = []
      for (const league of Object.values(state.leagues)) {
        const qualified = league.clubIds.filter((id) => inEurope.has(id))
        const rest = league.clubIds.filter((id) => !inEurope.has(id))
        if (qualified.length === 0 || rest.length === 0) continue
        const mean = (ids: string[]) => ids.reduce((a, id) => a + played(id), 0) / ids.length
        gaps.push(mean(qualified) - mean(rest))
      }
      const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
      console.log(`  extra matches vs own league-mates: +${meanGap.toFixed(1)} `
        + `(across ${gaps.length} leagues)`)

      // And what the money is worth, since prize money is the reason a board
      // cares about qualifying at all.
      for (const cup of continentalCups) {
        if (!cup.winnerId) continue
        const ladder = cup.prizeMoneyPerRound
        console.log(`  ${cup.name}: prize ladder `
          + `${ladder.map((n) => `${Math.round(n / 1000)}k`).join(' → ')}`)
      }
    }
    if (state.director.retiredAtSeason !== undefined) break
  }
  if (state.director.retiredAtSeason !== undefined) break
}
