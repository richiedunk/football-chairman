import { clamp, Rng } from '../rng'
import { IdFactory } from '../ids'
import { executeTransfer } from './transfers'
import { releaseRegistration, settleArrival } from './registration'
import { adjustForPlayer } from './agents'
import { squadImportance } from './valuation'
import { ratingForPositionCached } from '../world/attributes'
import { isTransferWindowOpen } from '../sim/schedule'
import type { Club, GameState, ID, Player } from '../types'

/**
 * Loans.
 *
 * The lever that makes a youth policy work. A prospect who does not play does
 * not develop, and the head coach decides who plays — so the only way to grow a
 * young player the coach will not pick is to send him somewhere he will start.
 * That makes loaning out a genuine strategy rather than squad tidying.
 *
 * Loans are proposed and answered immediately rather than negotiated over
 * weeks. A permanent transfer is a big decision that deserves the back-and-
 * forth; a loan is a phone call.
 */

export interface LoanContext {
  rng: Rng
  ids: IdFactory
}

export interface LoanSuitor {
  club: Club
  /** 0-1: how likely they are to say yes. */
  interest: number
  /** Share of the wage they will cover, 0-1. */
  wageOffer: number
  /** How much football he would realistically get there. */
  playingTime: 'starter' | 'rotation' | 'squad'
}

/**
 * Clubs that would take this player on loan.
 *
 * Ranked by how much football he would actually get — which is the whole point
 * of the exercise. A loan to a club where he would sit on the bench is worse
 * than no loan at all, and the list says so rather than leaving it to be
 * discovered a season later.
 */
export function loanSuitorsFor(state: GameState, player: Player, limit = 12): LoanSuitor[] {
  const parent = player.clubId ? state.clubs[player.clubId] : null
  if (!parent) return []

  const playerRating = ratingForPositionCached(player.id, player.attributes, player.position)

  const suitors: LoanSuitor[] = []
  for (const club of Object.values(state.clubs)) {
    if (club.id === parent.id) continue
    if (club.finances.inCrisis) continue
    if (club.loanedIn.length >= 5) continue

    // Would he improve them? A club only takes a loanee it can use.
    const rivals = club.squad
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.position === player.position)
    const bestRival = rivals.length
      ? Math.max(...rivals.map((p) => ratingForPositionCached(p.id, p.attributes, p.position)))
      : 0

    const margin = playerRating - bestRival
    if (margin < -25) continue

    const playingTime: LoanSuitor['playingTime'] =
      margin > 6 ? 'starter' : margin > -8 ? 'rotation' : 'squad'

    // A club well below the parent's level is more eager; one above is not
    // interested in a player they could sign outright.
    const levelGap = parent.reputation - club.reputation
    let interest = clamp(0.28 + levelGap / 90 + margin / 60, 0.05, 0.95)
    if (player.age <= 21) interest += 0.1
    if (club.strategy.youthEmphasis > 60 && player.age <= 22) interest += 0.08

    // What they will pay depends on how much they want him and what they earn.
    const wageOffer = clamp(0.25 + interest * 0.6 - levelGap / 220, 0.1, 1)

    suitors.push({ club, interest: clamp(interest, 0.05, 0.95), wageOffer, playingTime })
  }

  return suitors
    .sort((a, b) => {
      const rank = { starter: 2, rotation: 1, squad: 0 }
      if (rank[b.playingTime] !== rank[a.playingTime]) {
        return rank[b.playingTime] - rank[a.playingTime]
      }
      return b.interest - a.interest
    })
    .slice(0, limit)
}

export interface LoanOutcome {
  ok: boolean
  message: string
}

/**
 * Send one of your players out on loan.
 *
 * `wageShare` is the fraction of his wage you keep paying: offering to cover
 * more makes a club far more likely to say yes, which is the trade at the
 * heart of a loan. You are paying for his development.
 */
export function proposeLoanOut(
  state: GameState,
  ctx: LoanContext,
  playerId: ID,
  toClubId: ID,
  wageShare: number,
  seasons = 1,
): LoanOutcome {
  const player = state.players[playerId]
  const parent = player?.clubId ? state.clubs[player.clubId] : null
  const borrower = state.clubs[toClubId]
  if (!player || !parent || !borrower) return { ok: false, message: 'That loan is not possible.' }

  if (!isTransferWindowOpen(state.date.week)) {
    return { ok: false, message: 'The transfer window is closed.' }
  }
  if (player.loanClubId) return { ok: false, message: `${player.knownAs} is already out on loan.` }
  if (!player.contract) return { ok: false, message: `${player.knownAs} has no contract to loan.` }
  if (player.injury) return { ok: false, message: 'Nobody will take an injured player on loan.' }

  const suitor = loanSuitorsFor(state, player, 200).find((s) => s.club.id === toClubId)
  if (!suitor) return { ok: false, message: `${borrower.name} have no use for him.` }

  // Covering more of the wage buys goodwill, roughly linearly.
  const generosity = clamp(wageShare - (1 - suitor.wageOffer), -0.5, 0.6)
  const chance = clamp(suitor.interest + generosity * 0.8, 0.03, 0.97)

  if (!ctx.rng.chance(chance)) {
    return {
      ok: false,
      message: `${borrower.name} have declined${wageShare < 0.5 ? ' — they want more of the wage covered' : ''}.`,
    }
  }

  // The player has a say. A move that means less football than he already gets
  // is one he will refuse.
  const importanceAtParent = squadImportance(state, player, parent)
  if (importanceAtParent > 0.72 && suitor.playingTime !== 'starter') {
    return { ok: false, message: `${player.knownAs} will not drop down to sit on another bench.` }
  }

  executeTransfer(state, ctx, {
    player,
    buyer: borrower,
    seller: parent,
    fee: 0,
    kind: 'loan',
    contract: player.contract,
    agentFee: 0,
    sellOnPercentage: 0,
    wageContribution: clamp(wageShare, 0, 1),
    loanUntilSeason: state.date.season + Math.max(0, seasons - 1),
  })

  // Agents take a dim view of a client being sent away, though far less so
  // than of one being sold — a loan that gets him playing is arguably a favour.
  adjustForPlayer(state, parent.id, player, 'loanedClientOut')

  return {
    ok: true,
    message: `${player.knownAs} joins ${borrower.name} on loan${
      suitor.playingTime === 'starter' ? ', where he should start' : ''
    }.`,
  }
}

/**
 * Borrow a player from another club.
 *
 * The owning club says yes when he is not central to them and the move gets
 * him football, and no when he is — which is why the good loans are the ones
 * you spot before anyone else does.
 */
export function proposeLoanIn(
  state: GameState,
  ctx: LoanContext,
  playerId: ID,
  wageShare: number,
): LoanOutcome {
  const player = state.players[playerId]
  const owner = player?.clubId ? state.clubs[player.clubId] : null
  const club = state.clubs[state.playerClubId]
  if (!player || !owner || !club) return { ok: false, message: 'That loan is not possible.' }

  if (!isTransferWindowOpen(state.date.week)) {
    return { ok: false, message: 'The transfer window is closed.' }
  }
  if (player.loanClubId) return { ok: false, message: `${player.knownAs} is already out on loan.` }
  if (!player.contract) return { ok: false, message: 'He is a free agent — sign him outright.' }
  if (club.loanedIn.length >= 5) {
    return { ok: false, message: 'You already have the maximum number of loanees.' }
  }

  const importance = squadImportance(state, player, owner)
  if (importance > 0.7 && !player.listedForLoan) {
    return { ok: false, message: `${owner.name} will not let a key player go.` }
  }

  // Would he play more here than there? That is what the owner cares about.
  const rivals = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && p.position === player.position)
  const bestRival = rivals.length
    ? Math.max(...rivals.map((p) => ratingForPositionCached(p.id, p.attributes, p.position)))
    : 0
  const playerRating = ratingForPositionCached(player.id, player.attributes, player.position)
  const wouldStart = playerRating > bestRival - 4

  let chance = clamp(0.3 + (1 - importance) * 0.4, 0.05, 0.9)
  if (wouldStart) chance += 0.2
  if (player.listedForLoan) chance += 0.25
  if (player.age <= 21 && owner.strategy.youthEmphasis > 55) chance += 0.12
  // Taking more of the wage off their hands is persuasive.
  chance += (1 - wageShare) * 0.25
  // A club well above yours is less inclined to send a player down.
  chance -= clamp((owner.reputation - club.reputation) / 140, 0, 0.3)

  if (!ctx.rng.chance(clamp(chance, 0.03, 0.95))) {
    return { ok: false, message: `${owner.name} have turned the approach down.` }
  }

  executeTransfer(state, ctx, {
    player,
    buyer: club,
    seller: owner,
    fee: 0,
    kind: 'loan',
    contract: player.contract,
    agentFee: 0,
    sellOnPercentage: 0,
    wageContribution: clamp(wageShare, 0, 1),
    loanUntilSeason: state.date.season,
  })

  return { ok: true, message: `${player.knownAs} joins on loan from ${owner.name}.` }
}

/** Recall a player early. Costs him morale — he was settled somewhere. */
export function recallLoan(state: GameState, playerId: ID): LoanOutcome {
  const player = state.players[playerId]
  if (!player?.loanClubId) return { ok: false, message: 'He is not out on loan.' }

  const borrower = state.clubs[player.loanClubId]
  if (borrower) {
    borrower.loanedIn = borrower.loanedIn.filter((id) => id !== player.id)
    releaseRegistration(borrower, player.id)
  }

  player.loanClubId = null
  player.loanUntilSeason = null
  player.loanWageShare = 0
  player.morale = clamp(player.morale - 10, 1, 100)

  // He needs a place at his parent club again, and there may not be one — a
  // recall in March can leave a player registered nowhere at all.
  const owner = player.clubId ? state.clubs[player.clubId] : null
  if (owner) settleArrival(state, owner, player)

  return { ok: true, message: `${player.knownAs} has been recalled. He is not thrilled about it.` }
}

/** Players this club currently has out on loan. */
export function loanedOut(state: GameState, club: Club): Player[] {
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && Boolean(p.loanClubId))
}

/** Players this club has borrowed. */
export function loanedIn(state: GameState, club: Club): Player[] {
  return club.loanedIn.map((id) => state.players[id]).filter((p): p is Player => Boolean(p))
}
