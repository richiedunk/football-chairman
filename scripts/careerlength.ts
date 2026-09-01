/**
 * How long does a career actually last?
 *
 * The rule says thirty-five seasons at most. What matters is how many of them
 * a player is likely to get: a director who is sacked every other season and
 * has to drop back down the pyramid is playing a different game from one who
 * settles somewhere. This is the first long run this project has done, and the
 * age cap is what makes it a finite thing to run rather than a soak test.
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { RETIREMENT_AGE, STARTING_AGE, careerSummary } from '../src/engine/systems/directorCareer'
import { startingClubCandidates } from '../src/engine/systems/career'

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'CAREER1', directorName: 'Richie Dunk', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
// prepareNewGame's `candidates` is the whole jobs board sorted by reputation
// descending, so candidates[0] is the biggest club in the country. Starting an
// unproven thirty-year-old there is a career nobody can actually have, because
// the jobs board gates by level. This takes the set a level-one director may
// genuinely be offered.
const start = startingClubCandidates(setup.state)[0]
const state = startCareerAt(setup, start.id)
const deps = { ids: setup.ids, names: setup.names }

let weeks = 0
let sackings = 0
let moves = 0
let weeksUnemployed = 0
let lastAge = state.director.age

/**
 * Take a job when one is worth taking.
 *
 * The first version of this run never accepted an offer, so a career was one
 * club for thirty-five years by construction rather than by simulation, and
 * "one club, no trophies, best finish 4th" was a reading of the harness. Out
 * of work, take the best post going — there is no such thing as holding out
 * when the clock is the whole constraint. In work, move only for a club with
 * a real edge in standing, which is the ambition a career is made of without
 * being a director who moves every August.
 */
const AMBITION_GAP = 8

function considerOffers(): void {
  const offers = state.director.jobOffers.filter((o) => !o.barred)
  if (offers.length === 0) return

  const ranked = offers
    .map((o) => ({ offer: o, club: state.clubs[o.clubId] }))
    .filter((row) => Boolean(row.club))
    .sort((a, b) => b.club!.reputation - a.club!.reputation)
  const best = ranked[0]
  if (!best) return

  const current = state.playerClubId ? state.clubs[state.playerClubId!] : null
  if (current && best.club!.reputation < current.reputation + AMBITION_GAP) return

  const result = acceptJobOffer(state, best.offer.id)
  if (result.ok) {
    moves++
    console.log(
      `  week ${weeks}: ${current ? `left ${current.name} for ` : 'took '}`
      + `${best.club!.name} (rep ${best.club!.reputation})`,
    )
  }
}

console.log(`starting at ${state.clubs[state.playerClubId!].name}, age ${state.director.age}`)

while (state.director.retiredAtSeason === undefined && weeks < 52 * 40) {
  const tick = advanceWeek(state, deps)
  weeks++
  if (tick.sacked) sackings++
  if (!state.playerClubId) weeksUnemployed++
  considerOffers()
  if (state.director.age !== lastAge) {
    lastAge = state.director.age
    const club = state.playerClubId ? state.clubs[state.playerClubId!] : null
    const league = club ? state.leagues[club.leagueId] : null
    if (state.director.age % 5 === 0 || state.director.age >= RETIREMENT_AGE - 1) {
      console.log(
        `  age ${state.director.age}: ${club?.name ?? 'unemployed'}`
        + ` (${league?.name ?? '—'}), ${state.director.xp.toLocaleString()} XP`,
      )
    }
  }
}

const summary = careerSummary(state, state.director.retiredBecause ?? 'age')
console.log()
console.log(`retired at ${summary.age} after ${summary.seasonsWorked} seasons`)
console.log(`  clubs:      ${summary.clubs}`)
console.log(`  trophies:   ${summary.trophies}`)
console.log(`  best:       ${summary.bestFinish || '—'}`)
console.log(`  sacked:     ${sackings} times`)
console.log(`  moves:      ${moves} after the first job`)
console.log(`  unemployed: ${weeksUnemployed} weeks`)
console.log(`  earnings:   £${Math.round(summary.careerEarnings).toLocaleString()}`)
console.log(`  weeks run:  ${weeks}`)
if (summary.seasonsWorked !== RETIREMENT_AGE - STARTING_AGE) {
  console.log(`  NOTE: expected ${RETIREMENT_AGE - STARTING_AGE} seasons`)
}
