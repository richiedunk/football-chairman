import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { totalWageBill, computeWageDemand } from '../src/engine/systems/valuation'
import { seniorSquad } from '../src/engine/systems/aiSquad'
import { weeklyRevenue } from '../src/engine/systems/finance'
import type { Player, Position } from '../src/engine/types'

/**
 * Why an AI club does not sign anybody.
 *
 * Replicates the buy filter exactly and counts where each candidate is lost,
 * because the alternative is guessing which of five conditions is binding.
 */
const setup = prepareNewGame({
  seed: 'BUY', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, setup.candidates[0].id)
for (let s = 0; s < 3; s++) {
  for (let w = 0; w < 52; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })
}
// Park in an open window.
while (state.date.week !== 2) advanceWeek(state, { ids: setup.ids, names: setup.names })

const market = new Map<Position, Player[]>()
for (const p of Object.values(state.players)) {
  if (p.isAcademy || p.loanClubId) continue
  const list = market.get(p.position)
  if (list) list.push(p)
  else market.set(p.position, [p])
}
for (const l of market.values()) l.sort((a, b) => b.currentAbility - a.currentAbility)

for (const tier of [1, 3, 5]) {
  const league = Object.values(state.leagues).find((l) => l.nationId === 'eng' && l.tier === tier)!
  let noRoom = 0, squadFull = 0, viable = 0, noCandidates = 0
  let totalRoomPct = 0, affordableCount = 0
  const clubs = league.clubIds.map((id) => state.clubs[id])

  for (const club of clubs) {
    const squad = seniorSquad(state, club)
    if (squad.length >= 28) { squadFull++; continue }
    const wageRoom = club.finances.wageBudget - totalWageBill(state, club)
    totalRoomPct += (wageRoom / Math.max(1, weeklyRevenue(state, club))) * 100
    if (wageRoom <= 0) { noRoom++; continue }

    // Count candidates across every position, not just the weakest, to see
    // whether the market or the money is the constraint.
    let found = 0
    const league2 = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]
    for (const list of market.values()) {
      for (const p of list) {
        if (p.currentAbility < club.reputation * 1.1) break
        if (p.clubId === club.id) continue
        const price = p.clubId ? p.value * 1.3 : 0
        if (price > club.finances.transferBudget) continue
        if (computeWageDemand(p, league2, nation) > wageRoom) continue
        found++
        if (found > 60) break
      }
      if (found > 60) break
    }
    affordableCount += found
    if (found === 0) noCandidates++
    else viable++
  }

  console.log(
    `${league.name.padEnd(22)} squad full ${squadFull}  no wage room ${noRoom}  `
    + `no affordable target ${noCandidates}  can buy ${viable}/${clubs.length}  `
    + `avg room ${(totalRoomPct / clubs.length).toFixed(1)}% of revenue  `
    + `avg targets ${(affordableCount / clubs.length).toFixed(0)}`,
  )
}
