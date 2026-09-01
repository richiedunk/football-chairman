import { closeCareerEntry } from '../systems/career'
import { contractTermsFor, signContract, type ContractOffer } from '../systems/directorContract'
import type { GameState, ID } from '../types'
import { playerClub as clubInCharge } from '../playerClub'

import { guardedFacts, runPhases } from '../phases'
import { type RolloverContext, type RolloverDeps, type RolloverFacts, type RolloverPhase } from './context'
import { aYearOlder, academyChurn, buyBacks, clubHousekeeping, directorXp, finalTables, internationalReset, jobOffers, leagueReputation, newSeason, openTheRoll, playerYearEnd, promotionAndRelegation, squadRegistration } from './phases'

/**
 * Season rollover.
 *
 * Promotion and relegation, prize money, contract expiry, ageing, retirements,
 * a new fixture list, and — the part that matters for the meta-game — the XP
 * award and the job offers it unlocks. The one point in the year when the
 * whole world moves at once.
 *
 * This file is the manifest and the entry points. The work is in `phases.ts`
 * and `work.ts`, and the reason it is arranged this way is in `../phases.ts`.
 */

export type { RolloverDeps } from './context'

/**
 * Re-exported because it was public before the roll was split up and callers
 * outside the engine use it: the squad screen asks how likely a player is to
 * retire, and `scripts/` measures it.
 */
export { retirementProbability } from './work'

/**
 * A season roll, in order.
 *
 * The order carries more weight here than anywhere else in the engine, because
 * almost everything is judged against a state the next phase destroys: prize
 * money on a ledger about to close, XP on a division a club is about to leave,
 * continental places on tables about to be wiped. Those were comments. They
 * are declared reads of `finalPositions` and a position in this list now.
 */
export const ROLL: readonly RolloverPhase[] = [
  openTheRoll,
  finalTables,
  directorXp,
  promotionAndRelegation,

  playerYearEnd,
  academyChurn,
  squadRegistration,
  internationalReset,

  clubHousekeeping,
  leagueReputation,

  newSeason,
  buyBacks,

  jobOffers,
  aYearOlder,
]

export function runSeasonRollover(state: GameState, deps: RolloverDeps): void {
  const guard = guardedFacts<RolloverFacts>()
  const ctx: RolloverContext = {
    state,
    season: state.date.season,
    ids: deps.ids,
    names: deps.names,
    rng: deps.rng,
    deps,
    facts: guard.facts,
  }
  runPhases(ROLL, guard, ctx)
}

/** Accept a job offer: leave the current club and take over the new one. */
export function acceptJobOffer(
  state: GameState,
  offerId: ID,
  contract?: ContractOffer,
): { ok: boolean; message: string } {
  const offer = state.director.jobOffers.find((o) => o.id === offerId)
  if (!offer) return { ok: false, message: 'That offer is no longer available.' }
  // The UI does not offer a barred post, but the rule belongs here rather than
  // in a template: a listing you cannot apply for must be un-takeable however
  // the call arrives.
  if (offer.barred) {
    return { ok: false, message: offer.barredReason ?? 'They will not consider you.' }
  }
  const newClub = state.clubs[offer.clubId]
  if (!newClub) return { ok: false, message: 'That club no longer exists.' }

  const oldClub = clubInCharge(state)
  if (oldClub) {
    closeCareerEntry(state.director, oldClub.id, state.date.season, 'Left for another club')
  }

  state.playerClubId = newClub.id
  newClub.board.tenureSeasons = 0
  newClub.board.warnings = 0
  state.director.jobOffers = []
  state.director.careerHistory.push({
    clubId: newClub.id,
    clubName: newClub.name,
    fromSeason: state.date.season,
    toSeason: null,
    outcome: 'In post',
    bestFinish: 99,
    trophies: [],
    netSpend: 0,
    xpEarned: 0,
  })

  // A new club means a clean scouting slate — the reports belonged to the
  // previous employer's recruitment department, not to you.
  state.scoutReports = {}
  state.shortlist = []
  state.negotiations = []

  signContract(state, newClub, contract ?? contractTermsFor(state, newClub, state.director).opening)

  return { ok: true, message: `You are now director of football at ${newClub.name}.` }
}
