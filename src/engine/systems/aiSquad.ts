import { clamp, hashString, Rng } from '../rng'
import { IdFactory } from '../ids'
import { abilityCeilingFor } from '../world/playerGen'
import { isTransferWindowOpen } from '../sim/schedule'
import { ratingForPositionCached } from '../world/attributes'
import { promoteToSenior } from './academy'
import { targetSquadFor } from './recruitment'
import { U21_AGE } from './registration'
import { suggestRenewal } from './contracts'
import { executeTransfer, moveAppeal } from './transfers'
import { computeValue, computeWageDemand, totalWageBill } from './valuation'
import type { Club, Contract, GameState, Player } from '../types'

/**
 * How AI clubs keep a squad together.
 *
 * Without this the world quietly empties itself. Contracts expired, nobody
 * renewed them, academies produced players nobody promoted, and the transfer
 * market replaced perhaps half a player per club per season against four or
 * five leaving. Measured from a fresh world, senior squads fell from 26
 * players to 22.9 after two seasons, 12.2 after four and 2.6 after six, with
 * almost 8,000 free agents stacked up outside the game — clubs unable to field
 * eleven men while a queue of unemployed professionals waited to be asked.
 *
 * The three things missing were the three things every club actually does:
 * renew the players it wants to keep, promote from its own academy, and sign
 * free agents when it is short. The fourth follows from them — a player an
 * upper-tier club lets go is picked up further down, and drops through the
 * divisions until nobody calls at all.
 */

/** Senior players an AI club aims to carry. */
export const TARGET_SENIOR_SQUAD = 24

/** Below this a club is short enough to take what it can get. */
export const THIN_SENIOR_SQUAD = 20

/**
 * The squad size a club will fill up to out of the free-agent pool.
 *
 * Deliberately below the target. Free agents are available every week of the
 * year and cost no fee, so a club that used them to reach its full squad size
 * arrived at every transfer window already full and with its wage budget
 * spent — which is what kept fee-paying transfers down at one a season per
 * club against a real six to eight. The gap between this and the target is
 * the room a club keeps back for the window.
 */
export const FREE_AGENT_TARGET = 21

/** Below this a club cannot field a side and hires whoever will come. */
export const EMERGENCY_SQUAD = 16

/** Weeks without a club after which a player stops waiting for the phone. */
export const PATIENCE_WEEKS = 104

export interface AiSquadContext {
  rng: Rng
  ids: IdFactory
}

export function seniorSquad(state: GameState, club: Club): Player[] {
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)
}

/**
 * The players who actually take up a place.
 *
 * The squad list has twenty-five places and under-21s sit outside it — that is
 * the real rule and the game already plays by it when registering. The AI's
 * squad-size target did not: it counted every senior player including the
 * under-21s, so a club that promoted seven teenagers was "full" at twenty-four
 * and stopped signing professionals it had places for.
 *
 * That is the whole young drift, and the arithmetic is exact. Measured over
 * ten seasons, squads held at 24.3 while players aged 21 and over fell from
 * 19.9 to 17.2 and under-21s rose to 7.1 — and 24.3 minus 7.1 is 17.2. The
 * kids were not arriving too fast; they were crowding out the professionals
 * from places the rules never asked them to occupy.
 *
 * Availability is a different question and still counts everybody: an
 * eighteen-year-old can play on Saturday, he just does not use up a place.
 */
export function registrableSquad(state: GameState, club: Club): Player[] {
  return seniorSquad(state, club).filter((p) => p.age >= U21_AGE)
}

/**
 * Weekly squad management for every club the human does not run.
 *
 * The free-agent pool is built once and shared, because scanning every player
 * in the world for each of 238 clubs would cost more than the rest of the tick
 * put together.
 */
export function runAiSquadManagement(state: GameState, ctx: AiSquadContext): void {
  const freeAgents: Player[] = []

  for (const player of Object.values(state.players)) {
    if (player.clubId || player.isAcademy) continue
    player.weeksUnattached += 1
    // Demands soften the longer nobody calls. This is the mechanism that lets
    // a player released by a second-tier club end up playing non-league.
    if (player.weeksUnattached % 4 === 0) {
      player.wageDemand = Math.max(90, Math.round(player.wageDemand * 0.93))
    }
    freeAgents.push(player)
  }

  freeAgents.sort((a, b) => b.currentAbility - a.currentAbility)

  const week = state.date.week
  for (const club of Object.values(state.clubs)) {
    const clubRng = ctx.rng.fork(club.id)

    // The human's squad is his own problem, all the way down.
    //
    // The secretary used to sign free agents for him once the squad fell below
    // the emergency floor, on the reasoning that a club with seven players is
    // a broken game state rather than a hard lesson. It is a hard lesson: the
    // one thing a director of football is unambiguously employed to do is put
    // eleven players on a pitch, and a game that quietly does it for him has
    // removed the only unarguable failure condition it had. He is warned every
    // week the squad cannot field a side, and dismissed if it is still true on
    // the morning of a match — see `matchday.ts`.
    if (club.id === state.playerClubId) continue

    // Renewals run through the second half of the season rather than on one
    // fixed afternoon. A club whose wage bill leaves no room in March may have
    // room in April once someone else's deal has run down, and one attempt per
    // season meant a failed wage check was the same as a decision to let the
    // player go.
    if (week >= RENEWAL_FIRST_WEEK && week <= RENEWAL_LAST_WEEK) {
      processAiRenewals(state, club)
    }

    // A club in crisis still has to field a team, and in fact does exactly
    // this: promotes from within and signs whoever is free. Only renewals at
    // market wages are beyond it, and the wage budget already says so.
    promoteFromAcademy(state, club, clubRng)
    recruitFreeAgents(state, ctx, club, freeAgents, clubRng)
  }
}

/** Weeks in which AI clubs work through their expiring contracts. */
const RENEWAL_FIRST_WEEK = 26
const RENEWAL_LAST_WEEK = 46

/**
 * A stable per-player, per-season coin flip.
 *
 * Renewals get many attempts across the spring, so a fresh roll each week
 * would erode every probability to one. Deriving the roll from the player and
 * the season means "these talks broke down" stays broken down.
 */
function settledChance(key: string, probability: number): boolean {
  return (hashString(key) % 10_000) / 10_000 < probability
}

/**
 * Decide who to keep before their deal runs out.
 *
 * A club keeps roughly the players it would pick, within the wage budget, and
 * lets the rest walk. The deliberate leak is that a handful of deals fall
 * through anyway — that is where the free-transfer market comes from, and a
 * world where every club renews everyone has no free agents worth signing.
 */
export function processAiRenewals(state: GameState, club: Club): number {
  const season = state.date.season
  const seniors = seniorSquad(state, club)
  const ranked = seniors
    .map((p) => ({ p, score: ratingForPositionCached(p.id, p.attributes, p.position) }))
    .sort((a, b) => b.score - a.score)
  const rank = new Map(ranked.map((entry, i) => [entry.p.id, i]))

  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  let renewed = 0
  let wageBill = totalWageBill(state, club)

  for (const player of seniors) {
    if (!player.contract) continue
    // A deal is fixed in its final year, not on the day it runs out.
    //
    // Renewing only in the expiry season let the whole world reach expiry
    // together: contract lengths are set by age band, players age in lockstep
    // at the roll, and a cohort signed for four years all comes due four
    // summers later. Measured, that is the season-four cliff — squads held at
    // 26.1 for three seasons, then 21.8 with 1,835 free agents in one roll.
    // Clubs really do renew a year out, and for exactly the reason the game
    // already models: a player in his last year is worth a fraction of a
    // player with three to run, so waiting is how a club destroys its own
    // asset.
    const seasonsLeft = player.contract.expiresSeason - season
    if (seasonsLeft > 1) continue
    const early = seasonsLeft === 1

    // Keepers last longer than outfielders, and a thin squad is less fussy.
    const ageLimit = player.position === 'GK' ? 37 : 35
    if (player.age > ageLimit) continue

    // How good a player has to be to be worth another contract, by age.
    //
    // Ranking on ability alone quietly turns every club into a retirement
    // home: an ageing player still rates well, so he keeps renewing while the
    // 22-year-old behind him is let go. Measured over ten seasons that put 27%
    // of the top flight past 32 and only 10% of non-league, which is the age
    // pyramid upside down. A thirty-three-year-old now has to be a genuine
    // first-teamer to be kept, and the ones who are not go down a division
    // rather than out of the game.
    // Lower down the pyramid a thirty-four-year-old who knows the level is an
    // asset, not a problem. Applying one standard everywhere left the top
    // flight three times as old as non-league, which is the age pyramid the
    // wrong way up: in reality the experienced pro drops down and keeps
    // playing, and it is the biggest clubs that will not carry him.
    const veteranAllowance = club.reputation < 40 ? 7 : club.reputation < 65 ? 3 : 0

    // A slope, not a staircase.
    //
    // The step version applied to a world whose players age in lockstep: a
    // squad generated at mean age 24.4 crosses 28 together, then 31 together,
    // and the whole distribution falls off a cliff edge in the same summer.
    // Measured, senior releases went 84, 210, 501, then 1,312 in season four
    // as the mass crossed the bands, and the world settled five players a club
    // lower for good. Ageing is gradual; the decision that follows it should
    // be too.
    const curve = player.age <= 24 ? 24
      : player.age <= 31 ? 24 - (player.age - 24) * (9 / 7)
      : Math.max(8, 15 - (player.age - 31) * 2.5)
    const threshold = Math.round(curve + (player.age > 28 ? veteranAllowance : 0))
    const position = rank.get(player.id) ?? 99
    // A year out, a club only moves for the players it is sure about. The ones
    // it is unsure about it lets run, which is where the free market comes
    // from — the point is to spread the decisions, not to abolish them.
    const bar = early ? Math.round(threshold * 0.6) : threshold
    const wanted = position < bar
      || (seniors.length <= THIN_SENIOR_SQUAD && position < bar + 6)
    if (!wanted) continue

    // Some talks break down however much both sides want it to work — the
    // reason a free-transfer market exists at all.
    if (!settledChance(`${player.id}:${season}:${early ? 'early' : 'renew'}`, 0.86)) continue

    // An ambitious player at a club going nowhere would rather take his
    // chances, which is how good players reach the free market.
    if (player.traits.includes('ambitious') && club.board.confidence < 40
      && settledChance(`${player.id}:${season}:ambition`, 0.4)) {
      continue
    }

    const offer = suggestRenewal(state, club, player)
    let wage = offer.wage
    if (wageBill + (wage - player.contract.wage) > club.finances.wageBudget) {
      // A squad player who is not in demand will sign for close to what he is
      // already on. A first-teamer will not, and the club has to let him go.
      if (position >= 11 && wageBill <= club.finances.wageBudget) {
        wage = Math.max(player.contract.wage, Math.round(offer.wage * 0.8))
      }
      if (wageBill + (wage - player.contract.wage) > club.finances.wageBudget) continue
    }
    const delta = wage - player.contract.wage

    player.contract.wage = wage
    player.contract.expiresSeason = season + offer.seasons
    player.contract.inNegotiation = false
    player.contract.weeksSinceRenewalRequest = 0
    wageBill += delta
    renewed += 1

    player.value = computeValue(player, league, nation, season)
  }

  return renewed
}

/**
 * Push the best of the academy up when the senior squad needs bodies.
 *
 * The season-roll pass already promotes the exceptional; this promotes the
 * merely useful, which is what actually keeps a lower-league squad stocked.
 */
export function promoteFromAcademy(state: GameState, club: Club, rng: Rng): Player | null {
  const seniors = seniorSquad(state, club).length
  // Promotion is bounded by bodies, not by places.
  //
  // Counting only the over-21s here was a plain error and the measurement
  // caught it: a club with seventeen professionals and seven teenagers never
  // reached a target of twenty-four, so it promoted for ever. Players aged 21
  // and over fell to 16.8 a club against 18.7 on the baseline — the fix made
  // the thing it was aimed at worse, by removing the only brake on the inflow
  // it was trying to slow.
  //
  // Places govern who a club signs; bodies govern how many it can carry to
  // training. Only the first of those is a rule about registration.
  if (seniors >= targetSquadFor(club, TARGET_SENIOR_SQUAD)) return null
  if (seniors >= EMERGENCY_SQUAD && !rng.chance(0.35)) return null

  // Promoted on potential, with no readiness bar.
  //
  // One was tried — a boy had to beat the bottom of the senior squad or the
  // club signed a free agent instead — and it was a regression: promotions
  // fell by up to 38%, but blocking one did not reliably produce a signing, so
  // clubs simply ended up shorter. Measured at season six, squads went 24.6 to
  // 23.7 mid-season and clubs below the emergency floor went 34 to 54.
  //
  // It was also the wrong idea. There is nothing wrong with a recent recruit
  // being the worst player in the squad: `development.ts` improves a player
  // toward his potential every week he is at the club, weighted by coaching
  // and playing time, and under-21s draw on the academy director as well as
  // the coaching staff. Being the worst player at a club is where almost every
  // career starts, and the engine already models what happens next.
  const candidate = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && p.isAcademy && p.age >= 17)
    .sort((a, b) => b.potentialAbility - a.potentialAbility)[0]
  if (!candidate) return null

  const result = promoteToSenior(state, club, candidate)
  return result.ok ? candidate : null
}

/**
 * Sign a free agent when short.
 *
 * Free agents can be signed outside a window, which is exactly why this is the
 * mechanism that stops a club being unable to field eleven in February. What a
 * club considers "our level" comes from the same curve squad generation uses,
 * so a club short of players reaches down rather than sideways.
 */
export function recruitFreeAgents(
  state: GameState,
  ctx: AiSquadContext,
  club: Club,
  pool: Player[],
  rng: Rng,
): Player | null {
  // A club nine men short does not sign one player a week and wait. Below the
  // floor it keeps going until it can field a side, which is the difference
  // between a bad season and a club that never recovers.
  let signed: Player | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = recruitOne(state, ctx, club, pool, rng)
    if (!next) break
    signed = next
    if (seniorSquad(state, club).length >= EMERGENCY_SQUAD) break
  }
  return signed
}

function recruitOne(
  state: GameState,
  ctx: AiSquadContext,
  club: Club,
  pool: Player[],
  rng: Rng,
): Player | null {
  // The free-agent ceiling sits three below whatever this club is working to,
  // which is the gap it keeps back for the window. It used to sit three below
  // a constant every club in the world shared, because `targetSquadSize` was
  // generated for each club and read by nothing.
  //
  // The gap only makes sense while there is a window to keep it for. Applied
  // all year it was the binding constraint on the whole world: measured over
  // six seasons, 95 of 237 clubs sat parked at 21-23 with 2,174 free agents
  // and 1,825 academy players aged seventeen or over unused, against a total
  // shortfall of 876 — four times the supply anybody needed, and nobody able
  // to sign it. Outside a window a club with nineteen players cannot buy
  // anyone, so declining a free agent is choosing to be short until February.
  // Which is exactly why real clubs sign free agents in October.
  const squad = seniorSquad(state, club)
  // Places for the ceiling, bodies for the emergency — the same distinction the
  // registration rules make, and the reason under-21s never blocked a signing
  // in real football.
  const places = registrableSquad(state, club).length
  const target = targetSquadFor(club, TARGET_SENIOR_SQUAD)
  const reserving = isTransferWindowOpen(state.date.week)
  const freeAgentCeiling = reserving
    ? Math.max(EMERGENCY_SQUAD, target - (TARGET_SENIOR_SQUAD - FREE_AGENT_TARGET))
    : target
  if (places >= freeAgentCeiling) return null

  const shortfall = freeAgentCeiling - places
  const desperation = clamp(shortfall / 8, 0, 1)
  // Below the floor the club cannot put out a side with anyone left over, and
  // it stops shopping and starts hiring. Without this a club that fell behind
  // never caught up, and a handful reached zero senior players.
  const emergency = squad.length < EMERGENCY_SQUAD
  if (!emergency && !rng.chance(0.45 + desperation * 0.5)) return null

  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const ceiling = abilityCeilingFor(club.reputation)
  // A club will not sign someone plainly above its station without a fee, and
  // will not sign someone plainly beneath it unless it is desperate.
  const floor = emergency ? 0 : ceiling * (0.5 - desperation * 0.28)
  const wageBill = totalWageBill(state, club)
  const budget = club.finances.wageBudget

  let best: Player | null = null
  let bestScore = -Infinity

  for (const player of pool) {
    if (player.clubId) continue // signed earlier in this same pass
    // The ability ceiling stops a non-league club signing a player plainly
    // above its station, and it stays on in an emergency.
    //
    // It was lifted here once, on the reasoning that 34 clubs sat below the
    // floor while 2,174 free agents went unsigned. That is co-occurrence, not
    // cause, and `docs/bugs.md` already records the hypothesis as tested and
    // disproved: `scripts/stuckclubs.ts` found that of 30 clubs below the
    // floor, **zero** had nobody under their ceiling, and the median had 1,119
    // signable free agents. Those clubs are not blocked from signing. Do not
    // lift it again without a measurement that says which clubs it blocks.
    if (player.currentAbility > ceiling * 1.02) continue
    if (player.currentAbility < floor) break // the list is sorted, so we are done

    const wage = Math.max(90, Math.round(computeWageDemand(player, league, nation)))

    // Below the floor the wage budget stops applying. A club that cannot
    // fulfil its fixtures signs players and answers for the overspend later —
    // which the crisis machinery already handles, and which is the correct
    // outcome rather than a club quietly ceasing to exist.
    //
    // The smallest clubs cannot afford sixteen players at prevailing wages at
    // all: one measured non-league side had a budget of £11,638 a week and
    // nine players already on £10,344 of it. Left to the budget it stalled at
    // thirteen players for ever.
    if (!emergency && wageBill + wage > budget) continue

    // Would he come? A player nobody has called for a year is not choosy, and
    // a club with nine fit men is not in a position to be turned down.
    if (!emergency) {
      const patience = clamp(player.weeksUnattached / 45, 0, 1)
      if (moveAppeal(state, player, club) + patience * 0.55 < 0.55) continue
    }

    // A club in trouble shops on price, not on quality. One that is merely
    // short takes the best player it can get — discounting age by how much
    // this club can afford to care about it. A Premier club has no use for a
    // thirty-four-year-old free agent; a non-league club is delighted with
    // one, and that asymmetry is what carries a career down the divisions
    // instead of ending it.
    const ageWeight = clamp(club.reputation / 55, 0.15, 1.6)
    const veteranValue = player.age >= 30 && club.reputation < 40 ? 8 : 0
    // Where this club looks for players. `domesticBias` reached only the
    // human's scouting shortlist, so every AI club in the world recruited as
    // though nationality were no object and a stated homegrown policy changed
    // nothing about who a club actually signed. Free agents are the highest
    // volume channel in the game, so this is where saying so has to bite.
    const bias = (club.strategy.domesticBias ?? 50) - 50
    const home = player.nationalityId === club.nationId
    const domesticPull = emergency ? 0 : (home ? bias : -bias) * 0.22
    const score = emergency
      ? -wage
      : player.currentAbility
        - (player.age > 31 ? (player.age - 31) * 6 * ageWeight : 0)
        + veteranValue
        + domesticPull
    if (score > bestScore) {
      best = player
      bestScore = score
    }
  }

  if (!best) return null

  // Short deals for free agents cycled the same players back onto the market
  // every year and doubled the churn the renewal pass had to absorb.
  const seasons = best.age <= 23 ? 4 : best.age <= 30 ? 3 : 2
  const contract: Contract = {
    wage: Math.max(90, Math.round(computeWageDemand(best, league, nation))),
    expiresSeason: state.date.season + seasons,
    signingBonus: 0,
    releaseClause: null,
    appearanceFee: 0,
    goalBonus: 0,
    loyaltyBonus: 0,
    inNegotiation: false,
    weeksSinceRenewalRequest: 0,
  }

  executeTransfer(state, ctx, {
    player: best,
    buyer: club,
    seller: null,
    fee: 0,
    kind: 'free',
    contract,
    agentFee: 0,
    sellOnPercentage: 0,
    wageContribution: 0,
    loanUntilSeason: null,
  })

  return best
}
