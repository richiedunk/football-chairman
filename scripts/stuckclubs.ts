/**
 * Why can thirty clubs not field a side?
 *
 * `churn.ts` found 30 of 491 AI clubs below the sixteen-player emergency floor
 * after twelve seasons, with 3,299 free agents and 3,274 promotable academy
 * players available and only 1,560 slots needed to bring the whole world up to
 * target. Supply is four times the need, so a club stuck at eleven is not
 * short of players to sign — something is stopping it signing them.
 *
 * The suspect is in `recruitOne`. Below the emergency floor it drops the wage
 * budget and drops the ability *floor*, but it keeps the ability *ceiling*:
 *
 *     if (player.currentAbility > ceiling * 1.02) continue
 *
 * A club at the bottom of the pyramid has a low ceiling, and the free-agent
 * pool is fed by players released from better clubs. If everyone available is
 * too good for you, you sign nobody — and a club that cannot put out a team
 * turns down a free player for being too good, which is not something that
 * happens.
 *
 * Run: `npx tsx scripts/stuckclubs.ts`
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import { EMERGENCY_SQUAD, seniorSquad } from '../src/engine/systems/aiSquad'
import { abilityCeilingFor } from '../src/engine/world/playerGen'
import { computeWageDemand, totalWageBill } from '../src/engine/systems/valuation'

const SEASONS = Number(process.env.SEASONS ?? 12)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'CHURN1', directorName: 'R', background: 'scout',
  worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

for (let n = 0; n < SEASONS * 52; n++) {
  advanceWeek(state, deps)
  if (state.playerClubId === null) {
    const offer = state.director.jobOffers.find((o) => !o.barred)
    if (offer) acceptJobOffer(state, offer.id)
  }
  if (state.director.retiredAtSeason !== undefined) break
}

const free = Object.values(state.players).filter((p) => !p.clubId && !p.isAcademy)
const stuck = Object.values(state.clubs)
  .filter((c) => c.id !== state.playerClubId && seniorSquad(state, c).length < EMERGENCY_SQUAD)
  .sort((a, b) => seniorSquad(state, a).length - seniorSquad(state, b).length)

console.log(`${stuck.length} clubs below the emergency floor of ${EMERGENCY_SQUAD}`)
console.log(`${free.length} free agents in the world\n`)
console.log('club                      squad  rep  ceiling  affordable  under ceiling  BOTH')

let noneUnderCeiling = 0
for (const club of stuck.slice(0, 20)) {
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const ceiling = abilityCeilingFor(club.reputation)
  const bill = totalWageBill(state, club)
  const under = free.filter((p) => p.currentAbility <= ceiling * 1.02)
  // Emergency drops the budget check, so "affordable" is only informational —
  // what matters is whether anyone at all clears the ceiling.
  const affordable = free.filter(
    (p) => bill + Math.max(90, Math.round(computeWageDemand(p, league, nation))) <= club.finances.wageBudget,
  )
  const both = under.filter((p) => affordable.includes(p))
  if (under.length === 0) noneUnderCeiling++
  console.log(
    club.name.slice(0, 24).padEnd(26)
    + String(seniorSquad(state, club).length).padStart(5)
    + String(Math.round(club.reputation)).padStart(5)
    + ceiling.toFixed(0).padStart(9)
    + String(affordable.length).padStart(12)
    + String(under.length).padStart(15)
    + String(both.length).padStart(6),
  )
}

const allStuck = stuck.map((c) => ({
  club: c,
  under: free.filter((p) => p.currentAbility <= abilityCeilingFor(c.reputation) * 1.02).length,
}))
console.log(`\nof all ${stuck.length} stuck clubs, ${allStuck.filter((s) => s.under === 0).length} `
  + 'have NOBODY in the free-agent pool under their ability ceiling')
console.log(`median free agents under ceiling: `
  + `${allStuck.map((s) => s.under).sort((a, b) => a - b)[Math.floor(allStuck.length / 2)]}`)

const abilities = free.map((p) => p.currentAbility).sort((a, b) => a - b)
console.log(`\nfree-agent ability: min ${abilities[0]?.toFixed(0)}, `
  + `median ${abilities[Math.floor(abilities.length / 2)]?.toFixed(0)}, `
  + `max ${abilities[abilities.length - 1]?.toFixed(0)}`)
console.log(`stuck-club ceilings: `
  + `${Math.min(...stuck.map((c) => abilityCeilingFor(c.reputation))).toFixed(0)}`
  + `-${Math.max(...stuck.map((c) => abilityCeilingFor(c.reputation))).toFixed(0)}`)
