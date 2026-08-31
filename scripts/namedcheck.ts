/**
 * Why can a club not name a full squad?
 *
 * Squad size turned out to be the wrong number to chase: mid-season squads sit
 * at 24.3, which is `TARGET_SENIOR_SQUAD`, and the rollover figure is a week-1
 * trough five weeks before the first fixture. The number that genuinely decays
 * is the registered one — the players a club may actually pick. It falls from
 * 21.8 named in season three to 16 by season ten, and a club fielding sides
 * from sixteen registered players is a club weakened by rule rather than by
 * anything a director did.
 *
 * Three things could bind: the 25-place list, the 17 non-homegrown places, or
 * simply not having enough registrable players. They want completely different
 * fixes, so this counts which one actually bites, club by club.
 *
 * Run: `npx tsx scripts/namedcheck.ts` (SIZE, SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  HOMEGROWN_YEARS, NON_HOMEGROWN_LIMIT, SQUAD_LIMIT, U21_AGE, isHomegrownFor, squadRegistration,
} from '../src/engine/systems/registration'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { GameState } from '../src/engine/types'

const SIZE = (process.env.SIZE ?? 'compact') as 'compact' | 'standard' | 'large'
const SEASONS = Number(process.env.SEASONS ?? 10)

const setup = prepareNewGame({
  seed: process.env.SEED ?? 'NAMED1', directorName: 'R', background: 'scout',
  worldSize: SIZE, homeNationId: 'eng', startingSeason: 2025,
})
const state: GameState = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

console.log(`world ${SIZE}: ${Object.keys(state.clubs).length} clubs`)
console.log(`list ${SQUAD_LIMIT} places, ${NON_HOMEGROWN_LIMIT} of them open to non-homegrown`)
console.log(`homegrown = ${HOMEGROWN_YEARS} years registered in the nation before ${U21_AGE}\n`)
console.log('season  named  needing  homegrown  foreign%  bound by: list  foreign-cap  no players')

function line(label: string) {
  const clubs = Object.values(state.clubs)
  let named = 0
  let needing = 0
  let homegrown = 0
  let foreignNationals = 0
  let players = 0
  let boundList = 0
  let boundForeign = 0
  let boundSupply = 0

  for (const club of clubs) {
    const reg = squadRegistration(state, club)
    named += reg.placesUsed

    // Everyone who would need a place: senior squad, 21 and over.
    const squad = seniorSquad(state, club).filter((p) => !p.loanClubId)
    const seniors = squad.filter((p) => p.age >= U21_AGE)
    needing += seniors.length
    const hg = seniors.filter((p) => isHomegrownFor(p, club)).length
    homegrown += hg
    for (const p of squad) {
      players++
      if (p.nationalityId !== club.nationId) foreignNationals++
    }

    // Which constraint stopped this club naming everyone it has.
    const unnamed = seniors.length - reg.placesUsed
    if (unnamed <= 0) boundSupply++
    else if (reg.placesUsed >= SQUAD_LIMIT) boundList++
    else boundForeign++
  }

  const n = clubs.length
  console.log(
    label.padEnd(8)
    + (named / n).toFixed(1).padStart(6)
    + (needing / n).toFixed(1).padStart(9)
    + (homegrown / n).toFixed(1).padStart(11)
    + `${((foreignNationals / players) * 100).toFixed(0)}%`.padStart(10)
    + String(boundList).padStart(15)
    + String(boundForeign).padStart(13)
    + String(boundSupply).padStart(12),
  )
}

line('start')
for (let s = 1; s <= SEASONS; s++) {
  // Read mid-season, where the squad is the one that plays. Week one is five
  // weeks before a ball is kicked and recruiting has not run.
  for (let w = 0; w < 15; w++) advanceWeek(state, deps)
  line(`s${s}`)
  for (let w = 0; w < 37; w++) advanceWeek(state, deps)
}
