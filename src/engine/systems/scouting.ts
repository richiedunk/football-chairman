import { clamp, Rng } from '../rng'
import { ratingForPosition } from '../world/attributes'
import { computeAskingPrice, computeWageDemand } from './valuation'
import type {
  AttributeKey, Club, GameState, ID, Player, Position, ScoutAssignment, ScoutReport, Staff,
} from '../types'

/**
 * Scouting.
 *
 * The defining system of the role. You never see a player's true attributes —
 * you see a *range*, and the range narrows as your scouts spend time on him.
 * Every transfer decision is therefore made on incomplete information, and the
 * quality of your scouting department is the difference between a £4m bargain
 * and a £4m mistake.
 *
 * Two knobs control how good your information is: the individual scout's
 * judgement, and the club's data department, which tightens estimates across
 * the board. That gives two genuinely different ways to spend money on
 * knowing more.
 */

/** How much knowledge a scout accumulates per week on an assignment. */
const KNOWLEDGE_PER_WEEK = 9

/** Knowledge above which a report is considered complete. */
export const FULL_KNOWLEDGE = 100

/** Weeks after which a report is flagged stale and needs refreshing. */
const STALE_AFTER_WEEKS = 26

export interface ScoutingContext {
  rng: Rng
  week: number
  season: number
}

/**
 * Weekly scouting pass for the player's club. Only the human club is scouted
 * in this detail — AI clubs use a cheaper heuristic in the transfer system,
 * because nobody ever reads their reports.
 */
export function processScouting(
  state: GameState,
  club: Club,
  ctx: ScoutingContext,
): { discovered: Player[]; updated: ScoutReport[] } {
  const discovered: Player[] = []
  const updated: ScoutReport[] = []

  const scouts = club.staff
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s) && s.role === 'scout')

  const networkLevel = club.facilities.scoutingNetwork
  const dataLevel = club.facilities.dataDepartment

  for (const scout of scouts) {
    if (!scout.assignment) continue
    scout.assignment.weeksOnAssignment += 1

    if (scout.assignment.type === 'player') {
      // A focused brief on one player: knowledge accrues fast.
      const target = state.players[scout.assignment.targetId]
      if (!target) continue
      const report = advanceKnowledge(state, club, scout, target, ctx, KNOWLEDGE_PER_WEEK * 2.4, dataLevel)
      updated.push(report)
      continue
    }

    // Broad briefs: the scout works through a pool, finding new players and
    // deepening knowledge of ones already seen. The network level determines
    // how many players a scout can hold in view at once.
    const pool = candidatePool(state, scout.assignment, club)
    if (pool.length === 0) continue

    const throughput = Math.max(1, Math.round(1 + networkLevel / 5))
    for (let i = 0; i < throughput; i++) {
      const player = ctx.rng.pick(pool)
      const existing = state.scoutReports[player.id]
      if (!existing) {
        // A newly-found player. Whether he is worth reporting on at all
        // depends on the scout's judgement — a poor scout wastes weeks on
        // players who are not good enough.
        const judged = judgedAbility(scout, player, ctx.rng)
        if (judged < scout.assignment.minAbility) continue
        if (player.age > scout.assignment.maxAge) continue
        discovered.push(player)
      }
      const report = advanceKnowledge(state, club, scout, player, ctx, KNOWLEDGE_PER_WEEK, dataLevel)
      updated.push(report)
    }
  }

  // Reports age. A twelve-month-old report on a 19-year-old is close to
  // worthless, and the UI needs to say so.
  for (const report of Object.values(state.scoutReports)) {
    const weeksOld = (ctx.season - report.seasonFiled) * 52 + (ctx.week - report.weekFiled)
    report.stale = weeksOld > STALE_AFTER_WEEKS
  }

  return { discovered, updated }
}

/** Build the pool of players a scout on this assignment could be watching. */
function candidatePool(state: GameState, assignment: ScoutAssignment, club: Club): Player[] {
  const all = Object.values(state.players)

  const matches = (player: Player): boolean => {
    if (player.isAcademy) return false
    if (player.clubId === club.id) return false
    if (player.age > assignment.maxAge) return false

    switch (assignment.type) {
      case 'nation': {
        if (player.nationalityId === assignment.targetId) return true
        const playerClub = player.clubId ? state.clubs[player.clubId] : null
        return playerClub?.nationId === assignment.targetId
      }
      case 'league': {
        const playerClub = player.clubId ? state.clubs[player.clubId] : null
        return playerClub?.leagueId === assignment.targetId
      }
      case 'position':
        return player.position === assignment.position
          || player.altPositions.includes(assignment.position as Position)
      default:
        return false
    }
  }

  return all.filter(matches)
}

/**
 * Deepen the club's knowledge of a player and rewrite the report.
 *
 * Knowledge is stored per player rather than per scout: two scouts watching
 * the same player build one shared picture, which is how a real recruitment
 * department works.
 */
function advanceKnowledge(
  state: GameState,
  club: Club,
  scout: Staff,
  player: Player,
  ctx: ScoutingContext,
  gain: number,
  dataLevel: number,
): ScoutReport {
  const existing = state.scoutReports[player.id]
  const previousKnowledge = existing?.knowledge ?? 0

  // A better scout learns faster, and the data department accelerates everyone.
  const scoutFactor = 0.5 + (scout.attributes.judgingAbility / 100) * 0.9
  const dataFactor = 1 + (dataLevel / 20) * 0.5
  const knowledge = clamp(previousKnowledge + gain * scoutFactor * dataFactor, 0, FULL_KNOWLEDGE)

  const report = buildReport(state, club, scout, player, knowledge, ctx, dataLevel)
  state.scoutReports[player.id] = report
  return report
}

/**
 * Produce the report the director actually reads.
 *
 * The width of every range is a function of knowledge, the scout's judgement,
 * and the data department. At zero knowledge the range spans most of the
 * plausible scale; at full knowledge with an excellent scout it is within a
 * few points of the truth — but never exactly the truth, because certainty
 * would remove the risk that makes recruitment interesting.
 */
export function buildReport(
  state: GameState,
  club: Club,
  scout: Staff,
  player: Player,
  knowledge: number,
  ctx: ScoutingContext,
  dataLevel: number,
): ScoutReport {
  const { rng } = ctx

  // Error band, in ability points, for current ability.
  const abilityError = errorBand(knowledge, scout.attributes.judgingAbility, dataLevel, 46, 4)
  // Potential is always harder to judge than present ability, and stays
  // meaningfully uncertain even with a top scout — as it should.
  const potentialError = errorBand(knowledge, scout.attributes.judgingPotential, dataLevel, 62, 11)

  // A stable per-player bias so the same scout does not report a different
  // centre point every week. Scouts have opinions, and they stick to them.
  const bias = stableBias(player.id, scout.id)

  const abilityCentre = clamp(
    player.currentAbility + bias * abilityError * 0.6,
    1,
    200,
  )
  const potentialCentre = clamp(
    player.potentialAbility + bias * potentialError * 0.6,
    abilityCentre,
    200,
  )

  const abilityRange: [number, number] = [
    Math.round(clamp(abilityCentre - abilityError, 1, 200)),
    Math.round(clamp(abilityCentre + abilityError, 1, 200)),
  ]
  const potentialRange: [number, number] = [
    Math.round(clamp(Math.max(potentialCentre - potentialError, abilityRange[0]), 1, 200)),
    Math.round(clamp(potentialCentre + potentialError, 1, 200)),
  ]

  // Attribute estimates only appear once the scout has watched him enough to
  // have a view. Below that the report is a summary judgement, which is
  // exactly what a first look at a player gives you.
  const attributeEstimates: Partial<Record<AttributeKey, [number, number]>> = {}
  if (knowledge >= 35) {
    const attrError = Math.max(0.6, (abilityError / 200) * 22)
    for (const key of Object.keys(player.attributes) as AttributeKey[]) {
      const value = player.attributes[key]
      if (value <= 1 && !isRelevantAttribute(player.position, key)) continue
      const spread = Math.round(attrError * rng.float(0.7, 1.3))
      attributeEstimates[key] = [
        Math.max(1, value - spread),
        Math.min(20, value + spread),
      ]
    }
  }

  const sellingClub = player.clubId ? state.clubs[player.clubId] : null
  const trueFee = sellingClub ? computeAskingPrice(state, player, sellingClub, club) : 0
  const feeError = 0.45 - (knowledge / 100) * 0.3
  const estimatedFee: [number, number] = [
    Math.round((trueFee * (1 - feeError)) / 10_000) * 10_000,
    Math.round((trueFee * (1 + feeError)) / 10_000) * 10_000,
  ]

  const league = player.clubId ? state.leagues[state.clubs[player.clubId]?.leagueId] : null
  const nation = state.nations[player.nationalityId]
  const trueWage = computeWageDemand(player, league ?? null, nation ?? null)
  const wageError = 0.35 - (knowledge / 100) * 0.25
  const estimatedWage: [number, number] = [
    Math.round((trueWage * (1 - wageError)) / 50) * 50,
    Math.round((trueWage * (1 + wageError)) / 50) * 50,
  ]

  return {
    playerId: player.id,
    scoutId: scout.id,
    knowledge: Math.round(knowledge),
    abilityRange,
    potentialRange,
    attributeEstimates,
    verdict: writeVerdict(player, abilityCentre, potentialCentre, knowledge, scout),
    recommendation: computeRecommendation(state, club, player, abilityCentre, potentialCentre),
    estimatedFee,
    estimatedWage,
    weekFiled: ctx.week,
    seasonFiled: ctx.season,
    stale: false,
  }
}

/**
 * Half-width of an estimate range.
 *
 * At zero knowledge the band is `maxBand`; it closes toward `minBand` as
 * knowledge and scout quality rise, but never reaches zero.
 */
function errorBand(
  knowledge: number,
  scoutSkill: number,
  dataLevel: number,
  maxBand: number,
  minBand: number,
): number {
  const knowledgeFactor = 1 - Math.pow(knowledge / 100, 0.8)
  const skillFactor = 1 - (scoutSkill / 100) * 0.55
  const dataFactor = 1 - (dataLevel / 20) * 0.25
  return clamp(minBand + (maxBand - minBand) * knowledgeFactor * skillFactor * dataFactor, minBand, maxBand)
}

/**
 * A stable, deterministic bias in [-1, 1] for a scout's view of a player.
 * Derived from the two ids so the same scout always over- or under-rates the
 * same player, and a second opinion from a different scout genuinely differs.
 */
function stableBias(playerId: ID, scoutId: ID): number {
  let h = 2166136261 >>> 0
  const combined = `${playerId}:${scoutId}`
  for (let i = 0; i < combined.length; i++) {
    h ^= combined.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return ((h >>> 8) / 16777216) * 2 - 1
}

/** A scout's snap judgement of a player he has just watched once. */
function judgedAbility(scout: Staff, player: Player, rng: Rng): number {
  const error = (100 - scout.attributes.judgingAbility) / 2
  return clamp(player.currentAbility + rng.normal(0, error), 1, 200)
}

function isRelevantAttribute(position: Position, key: AttributeKey): boolean {
  const keeperKeys: AttributeKey[] = ['reflexes', 'handling', 'distribution', 'command']
  if (position === 'GK') return keeperKeys.includes(key)
  return !keeperKeys.includes(key)
}

function writeVerdict(
  player: Player,
  ability: number,
  potential: number,
  knowledge: number,
  scout: Staff,
): string {
  if (knowledge < 20) {
    return `${scout.knownAs} has seen him once. Too early to form a view — needs more watching.`
  }

  const headroom = potential - ability
  const parts: string[] = []

  if (ability >= 155) parts.push('An outstanding player at this level')
  else if (ability >= 130) parts.push('A very good player')
  else if (ability >= 105) parts.push('A solid professional')
  else if (ability >= 80) parts.push('Lower-division standard')
  else parts.push('Not up to much')

  if (headroom > 45 && player.age <= 21) parts.push('with a genuinely high ceiling')
  else if (headroom > 22) parts.push('with room to improve')
  else if (player.age >= 31) parts.push('and past his best')
  else parts.push('at or near his ceiling')

  // Personality read, which is where a good scout earns his money — and where
  // an unreliable one does real damage.
  if (knowledge >= 60) {
    if (player.traits.includes('professional')) parts.push('Trains impeccably.')
    else if (player.traits.includes('clubhouseCancer')) parts.push('Warning: he is trouble in a dressing room.')
    else if (player.traits.includes('hothead')) parts.push('Discipline is a concern.')
    else if (player.traits.includes('injuryProne')) parts.push('Worrying injury history.')
    else if (player.traits.includes('leader')) parts.push('A natural leader.')
  }

  return `${parts.join(' ')}${parts[parts.length - 1].endsWith('.') ? '' : '.'}`
}

/**
 * How strongly the scout recommends signing him *for this club specifically*.
 * A brilliant player a club could never afford or fit in is not a
 * recommendation, it is a distraction.
 */
function computeRecommendation(
  state: GameState,
  club: Club,
  player: Player,
  ability: number,
  potential: number,
): number {
  const squad = club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy)

  const inPosition = squad.filter((p) => p.position === player.position)
  const bestInPosition = inPosition.length
    ? Math.max(...inPosition.map((p) => ratingForPosition(p.attributes, p.position)))
    : 0

  let score = 50

  // Is he an upgrade?
  const upgrade = ability - bestInPosition
  score += clamp(upgrade * 0.8, -35, 35)

  // Is the position thin?
  if (inPosition.length <= 1) score += 15

  // Does he fit the club's strategy?
  if (club.strategy.youthEmphasis > 60 && player.age <= 23) score += 12
  if (club.strategy.youthEmphasis > 60 && player.age >= 30) score -= 15
  if (potential - ability > 35 && club.strategy.youthEmphasis > 50) score += 10

  // Is he affordable? A recommendation the club cannot act on is worth little.
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const wage = computeWageDemand(player, league, nation)
  if (wage > club.finances.wageBudget * 0.25) score -= 22
  if (player.value > club.finances.transferBudget) score -= 25

  return clamp(Math.round(score), 0, 100)
}

// ---------------------------------------------------------------------------
// Assignment management
// ---------------------------------------------------------------------------

export function assignScout(
  scout: Staff,
  assignment: Omit<ScoutAssignment, 'weeksOnAssignment'>,
): void {
  scout.assignment = { ...assignment, weeksOnAssignment: 0 }
}

export function unassignScout(scout: Staff): void {
  scout.assignment = null
}

/** Human-readable description of what a scout is currently doing. */
export function describeAssignment(state: GameState, scout: Staff): string {
  const a = scout.assignment
  if (!a) return 'Unassigned'
  switch (a.type) {
    case 'nation':
      return `Scouting ${state.nations[a.targetId]?.name ?? 'unknown'}`
    case 'league':
      return `Scouting ${state.leagues[a.targetId]?.name ?? 'unknown'}`
    case 'position':
      return `Searching for ${a.position}s`
    case 'player': {
      const player = state.players[a.targetId]
      return player ? `Watching ${player.knownAs}` : 'Watching a specific player'
    }
  }
}

/** What the UI shows in place of a true ability figure. */
export function knowledgeLabel(knowledge: number): string {
  if (knowledge >= 90) return 'Complete'
  if (knowledge >= 70) return 'Thorough'
  if (knowledge >= 45) return 'Good'
  if (knowledge >= 25) return 'Partial'
  if (knowledge > 0) return 'Minimal'
  return 'None'
}

/** Format an ability range for display, e.g. "115-140". */
export function formatRange(range: [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`
}

/**
 * Star rating derived from a reported ability range, relative to the standard
 * of a given league. Ranges mean nothing to a player without context: 130 is
 * a star in the fourth tier and a squad player in the first.
 */
export function starsForLeague(ability: number, leagueReputation: number): number {
  // A league of reputation R is roughly populated by players around 45 + R*1.3.
  const leagueAverage = 45 + leagueReputation * 1.3
  const relative = (ability - leagueAverage) / 40
  return clamp(Math.round((3 + relative * 2) * 2) / 2, 0.5, 5)
}
