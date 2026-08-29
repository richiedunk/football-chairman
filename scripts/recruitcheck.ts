import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { seniorSquad, TARGET_SENIOR_SQUAD } from '../src/engine/systems/aiSquad'
import { totalWageBill, computeWageDemand } from '../src/engine/systems/valuation'
import { abilityCeilingFor } from '../src/engine/world/playerGen'
import { moveAppeal } from '../src/engine/systems/transfers'
import { clamp } from '../src/engine/rng'

const setup = prepareNewGame({
  seed: 'SQ1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 6; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}

// Why can't the short clubs fill up?
const short = Object.values(state.clubs)
  .filter((c) => seniorSquad(state, c).length < 18)
  .sort((a, b) => seniorSquad(state, a).length - seniorSquad(state, b).length)
  .slice(0, 8)

const pool = Object.values(state.players)
  .filter((p) => !p.clubId && !p.isAcademy)
  .sort((a, b) => b.currentAbility - a.currentAbility)
console.log(`free agents: ${pool.length}\n`)

for (const club of short) {
  const squad = seniorSquad(state, club)
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const ceiling = abilityCeilingFor(club.reputation)
  const desperation = clamp((TARGET_SENIOR_SQUAD - squad.length) / 8, 0, 1)
  const emergency = squad.length < 16
  const floor = emergency ? 0 : ceiling * (0.5 - desperation * 0.28)
  const bill = totalWageBill(state, club)
  const budget = club.finances.wageBudget * (emergency ? 1.25 : 1)

  let tooGood = 0, tooPoor = 0, tooDear = 0, unwilling = 0, ok = 0
  for (const p of pool) {
    if (p.currentAbility > ceiling * 1.02) { tooGood++; continue }
    if (p.currentAbility < floor) { tooPoor++; continue }
    const wage = Math.max(90, Math.round(computeWageDemand(p, league, nation)))
    if (bill + wage > budget) { tooDear++; continue }
    if (!emergency) {
      const patience = clamp(p.weeksUnattached / 45, 0, 1)
      if (moveAppeal(state, p, club) + patience * 0.55 < 0.55) { unwilling++; continue }
    }
    ok++
  }
  console.log(
    `${club.name.slice(0, 20).padEnd(21)} sq ${String(squad.length).padStart(2)} `
    + `crisis ${club.finances.inCrisis ? 'Y' : 'n'} rep ${String(Math.round(club.reputation)).padStart(2)} `
    + `wages ${Math.round(bill).toLocaleString().padStart(9)}/${Math.round(budget).toLocaleString().padStart(9)} `
    + `| good ${ok} · too-good ${tooGood} · too-poor ${tooPoor} · too-dear ${tooDear} · unwilling ${unwilling}`,
  )
}

// Age profile by tier, to see whether veterans actually descend.
console.log()
for (const tier of [1, 2, 3, 4, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)
  if (!league) continue
  const players = league.clubIds.flatMap((id) => seniorSquad(state, state.clubs[id]))
  const pct = (f: (a: number) => boolean) =>
    ((players.filter((p) => f(p.age)).length / players.length) * 100).toFixed(0)
  console.log(
    `${league.name.padEnd(22)} u21 ${pct((a) => a < 21)}%  21-27 ${pct((a) => a >= 21 && a <= 27)}%  `
    + `28-31 ${pct((a) => a >= 28 && a <= 31)}%  32+ ${pct((a) => a >= 32)}%`,
  )
}
