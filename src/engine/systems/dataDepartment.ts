import { clamp, Rng } from '../rng'
import { computeValue } from './valuation'
import { philosophyOf } from './recruitment'
import type { Club, DataFinding, GameState, Player } from '../types'

/**
 * The data department.
 *
 * The single most real thing about the modern job, and the honest way to make
 * an information advantage a purchase rather than a gift. What it produces is
 * an **edge rather than an answer**: a shortlist of players the model believes
 * are underpriced, each with a confidence figure, and both the list and the
 * confidence get better the more you have put into it.
 *
 * **The mispricing it exploits is a real one that was already in the game.**
 * `computeValue` scales a player's price by his league's reputation, from 0.55
 * in the lowest to 1.4 in the highest — so the same footballer costs two and a
 * half times as much in one country as another. The market is paying for the
 * shop window. A department that values the player rather than the window
 * finds the same thing real ones find: good players in unfashionable leagues
 * are cheap, and that is where the edge lives.
 *
 * **The risk it cannot remove.** Not everyone steps up. The further a player
 * has to climb, the less certain the finding is, and no amount of investment
 * makes that go away — it only makes the department better at saying how
 * uncertain it is. That is why the output carries a confidence figure rather
 * than a recommendation.
 *
 * **A badly funded department is not a quiet one. It is a wrong one.** At low
 * levels the model's estimate carries noise large enough to surface players
 * whose edge is negative — it says a man is underpriced when he is not. That
 * is precisely what a badly funded department produces, and hiding it would
 * make the investment pointless.
 */

/** Weeks between refreshes. A model is re-run, not consulted continuously. */
export const DATA_REFRESH_WEEKS = 4

/** The smallest edge worth putting in front of anybody, as a fraction. */
const MIN_EDGE_FRACTION = 0.18

/**
 * What the model thinks a player is worth to *this* club.
 *
 * His value computed in the buyer's league context rather than the seller's,
 * which is the arbitrage: the same player is priced differently either side of
 * a transfer, and the gap is real money.
 */
export function modelValuation(state: GameState, player: Player, club: Club): number {
  const buyerLeague = state.leagues[club.leagueId] ?? null
  const buyerNation = state.nations[club.nationId] ?? null
  return computeValue(player, buyerLeague, buyerNation, state.date.season)
}

/**
 * How sure anybody can be, before the department's own quality is considered.
 *
 * Driven by the size of the move in either direction, which is not the same
 * risk twice over. **Climbing** asks whether he can cope: a player coming up
 * three divisions is a genuine gamble however good the numbers look.
 * **Dropping** asks whether he will bother — a player stepping a long way down
 * for money is a different kind of risk and a real one, and pretending it is a
 * certainty is how a director at a small club ends up with a squad of
 * disinterested names.
 *
 * The first version only counted climbing, which meant every finding at a
 * bottom-division club came back at the ceiling and the confidence figure told
 * the reader nothing about the player at all.
 */
export function moveConfidence(state: GameState, player: Player, club: Club): number {
  const from = player.clubId ? state.clubs[player.clubId] : null
  const fromLeague = from ? state.leagues[from.leagueId] : null
  const toLeague = state.leagues[club.leagueId]
  if (!toLeague) return 0.5
  const gap = toLeague.reputation - (fromLeague?.reputation ?? 20)
  // Climbing is the riskier of the two, but neither is free.
  const risk = gap >= 0 ? gap / 55 : Math.abs(gap) / 90
  // A move of no size at all is not certainty either — he still has to settle.
  return clamp(0.92 - risk, 0.25, 0.92)
}

/** How much noise the department's own quality leaves in its estimate. */
export function modelNoise(level: number): number {
  // Level 1 misprices by around 40%, which is enough to surface players who
  // are not bargains at all. Level 20 is down to 4% and rarely wrong.
  return clamp(0.44 - (level / 20) * 0.4, 0.04, 0.44)
}

/**
 * Whether a player is the kind of player this club is looking for.
 *
 * The edge is expressed in the club's own terms, which is why the department
 * comes after the recruitment model rather than beside it. A develop-and-sell
 * club's model does not spend its time on twenty-nine-year-olds who are ready
 * now, because that club is not going to sign one.
 */
export function fitsPolicy(club: Club, player: Player): boolean {
  switch (philosophyOf(club).id) {
    case 'developAndSell': return player.age <= 24
    case 'winNow': return player.age >= 23 && player.currentAbility >= club.reputation * 1.1
    case 'homegrown': return player.nationalityId === club.nationId
    case 'starNames': return player.currentAbility >= club.reputation * 1.35
    // Value hunting looks everywhere, which is the point of it.
    default: return true
  }
}

/** How many names a department of this level can put in front of you. */
export function shortlistSize(level: number): number {
  return clamp(Math.round(2 + level * 0.6), 2, 14)
}

/**
 * Run the model.
 *
 * Deliberately samples rather than sweeping the whole world: a department
 * looks at what it has data on, and sweeping 20,000 players every four weeks
 * would cost more than the rest of the tick put together.
 */
export function runModel(state: GameState, club: Club, rng: Rng): DataFinding[] {
  const level = club.facilities.dataDepartment
  const noise = modelNoise(level)
  const budget = club.finances.transferBudget

  const pool = rng.shuffle(
    Object.values(state.players).filter((p) => {
      if (p.clubId === club.id || p.isAcademy || p.loanClubId) return false
      if (p.currentAbility < club.reputation * 0.7) return false
      if (!fitsPolicy(club, p)) return false
      return true
    }),
  ).slice(0, 400 + level * 40)

  const findings: DataFinding[] = []
  for (const player of pool) {
    const market = player.value
    if (market <= 0 || market > budget * 1.6) continue

    const worth = modelValuation(state, player, club)
    const trueEdge = worth - market
    // The estimate the department actually produces, wrong in proportion to
    // how little has been spent on it.
    const estimated = worth * (1 + rng.normal(0, noise))
    const seenEdge = estimated - market
    if (seenEdge < market * MIN_EDGE_FRACTION) continue

    const confidence = clamp(
      moveConfidence(state, player, club) * (0.35 + (level / 20) * 0.65),
      0.05, 0.95,
    )

    findings.push({
      playerId: player.id,
      modelValue: Math.round(estimated),
      marketValue: Math.round(market),
      confidence: Math.round(confidence * 100) / 100,
      rationale: rationaleFor(state, player, club, trueEdge),
      week: state.date.week,
      season: state.date.season,
    })
  }

  return findings
    .sort((a, b) =>
      (b.modelValue - b.marketValue) * b.confidence - (a.modelValue - a.marketValue) * a.confidence)
    .slice(0, shortlistSize(level))
}

function rationaleFor(state: GameState, player: Player, club: Club, edge: number): string {
  const from = player.clubId ? state.clubs[player.clubId] : null
  const fromLeague = from ? state.leagues[from.leagueId] : null
  const toLeague = state.leagues[club.leagueId]
  const gap = (toLeague?.reputation ?? 50) - (fromLeague?.reputation ?? 20)

  if (!from) return 'Out of contract, and the market has stopped looking at him.'
  if (gap > 25) {
    return `${fromLeague?.name ?? 'His division'} prices him for ${fromLeague?.name ?? 'that level'}. `
      + 'Our division does not.'
  }
  if (player.age <= 21 && player.potentialAbility - player.currentAbility > 30) {
    return 'The model is paying for what he becomes, and the market is paying for what he is.'
  }
  if (player.contract && player.contract.expiresSeason - state.date.season <= 1) {
    return 'Into the last year of his deal, and priced as though he were not.'
  }
  if (edge < 0) {
    // The department does not know this one is wrong; it is why confidence is
    // the number that matters and the level is what buys it.
    return 'The numbers like him more than the eye does.'
  }
  return 'Producing more than the players his division values at his price.'
}

/** Whether the model is due to be re-run. */
export function modelDue(state: GameState): boolean {
  return state.date.week % DATA_REFRESH_WEEKS === 1
}

/** Findings whose player has since moved, retired or become unaffordable. */
export function pruneFindings(state: GameState, club: Club): DataFinding[] {
  return (state.dataFindings ?? []).filter((f) => {
    const player = state.players[f.playerId]
    return Boolean(player) && player.clubId !== club.id && !player.loanClubId
  })
}
