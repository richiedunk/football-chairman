/**
 * Does a stated policy actually change what a club does?
 *
 * The whole risk with this feature is that it becomes a label: a name on a
 * screen over dials nobody reads. Four of the seven it consolidates were
 * genuinely read by nothing before this, so the test that matters is whether
 * clubs recruiting under different policies end up with visibly different
 * squads and different business — not whether the screen renders.
 *
 * Run: `npx tsx scripts/recruitcheck2.ts` (SEASONS, SEED)
 */
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { acceptJobOffer } from '../src/engine/season'
import { startingClubCandidates } from '../src/engine/systems/career'
import { philosophyOf } from '../src/engine/systems/recruitment'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import type { GameState } from '../src/engine/types'

const SEASONS = Number(process.env.SEASONS ?? 4)
const setup = prepareNewGame({
  seed: process.env.SEED ?? 'RC2', directorName: 'R', background: 'scout',
  worldSize: 'standard', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
const deps = { ids: setup.ids, names: setup.names }

function report(state: GameState, label: string) {
  const byPolicy = new Map<string, {
    clubs: number; age: number; squad: number; foreign: number; wage: number; players: number
  }>()

  for (const club of Object.values(state.clubs)) {
    const name = philosophyOf(club).name
    const squad = seniorSquad(state, club).filter((p) => !p.loanClubId)
    if (squad.length === 0) continue
    const row = byPolicy.get(name)
      ?? { clubs: 0, age: 0, squad: 0, foreign: 0, wage: 0, players: 0 }
    row.clubs++
    row.squad += squad.length
    for (const p of squad) {
      row.players++
      row.age += p.age
      if (p.nationalityId !== club.nationId) row.foreign++
      row.wage += p.contract?.wage ?? 0
    }
    byPolicy.set(name, row)
  }

  console.log(`\n${label}`)
  console.log('policy               clubs   squad   mean age   foreign   mean wage')
  for (const [name, r] of [...byPolicy].sort((a, b) => b[1].clubs - a[1].clubs)) {
    console.log(
      name.padEnd(21)
      + String(r.clubs).padStart(5)
      + (r.squad / r.clubs).toFixed(1).padStart(8)
      + (r.age / r.players).toFixed(1).padStart(11)
      + `${((r.foreign / r.players) * 100).toFixed(0)}%`.padStart(10)
      + `${Math.round(r.wage / r.players / 100) / 10}k`.padStart(12),
    )
  }
}

report(state, 'at world creation (squads as generated)')

for (let season = 1; season <= SEASONS; season++) {
  for (let week = 0; week < 52; week++) {
    advanceWeek(state, deps)
    if (state.playerClubId === null) {
      const offer = state.director.jobOffers.find((o) => !o.barred)
      if (offer) acceptJobOffer(state, offer.id)
    }
    if (state.director.retiredAtSeason !== undefined) break
  }
  if (season === SEASONS) report(state, `after ${season} seasons of recruiting to it`)
  if (state.director.retiredAtSeason !== undefined) break
}
