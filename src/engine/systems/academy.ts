import { clamp, Rng } from '../rng'
import { generateYouthIntake } from '../world/playerGen'
import { staffEffectiveness } from '../world/staffGen'
import { computeValue, computeWageDemand } from './valuation'
import type { Club, GameState, Player, Staff } from '../types'
import type { IdFactory } from '../ids'
import type { NameGenerator } from '../names/generator'

/**
 * The academy.
 *
 * Youth intake arrives once a year, in pre-season. Prospects sit outside the
 * senior squad until promoted, which is a decision the director makes — and
 * a costly one, because a promoted player takes a squad place, a wage and a
 * registration slot, while an unpromoted one cannot play and does not develop
 * as fast.
 */

export const INTAKE_WEEK = 3

export interface AcademyContext {
  rng: Rng
  ids: IdFactory
  names: NameGenerator
  season: number
}

/** Generate this season's intake for a club. */
export function produceIntake(
  state: GameState,
  club: Club,
  ctx: AcademyContext,
): { players: Player[]; summary: string } {
  const nation = state.nations[club.nationId]
  const director = club.staff
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s) && s.role === 'academyDirector')[0]
  const directorSkill = director ? staffEffectiveness(director) : 30

  // Intake size scales with facilities: a better academy simply sees more
  // players, which matters as much as the quality of the ones it sees.
  const count = clamp(
    Math.round(2 + club.facilities.youthFacilities / 3 + ctx.rng.normal(0, 1)),
    2,
    9,
  )

  const players = generateYouthIntake(
    { rng: ctx.rng, ids: ctx.ids, names: ctx.names, nations: Object.values(state.nations), season: ctx.season },
    club.id,
    nation,
    club.facilities.youthFacilities,
    directorSkill,
    count,
  )

  const league = state.leagues[club.leagueId]
  for (const player of players) {
    player.contract = {
      wage: Math.max(120, Math.round(computeWageDemand(player, league, nation) * 0.2)),
      expiresSeason: ctx.season + 3,
      signingBonus: 0,
      releaseClause: null,
      appearanceFee: 0,
      goalBonus: 0,
      loyaltyBonus: 0,
      inNegotiation: false,
      weeksSinceRenewalRequest: 0,
    }
    player.value = computeValue(player, league, nation, ctx.season)
    player.wageDemand = computeWageDemand(player, league, nation)
    state.players[player.id] = player
    club.squad.push(player.id)
  }

  const best = players.slice().sort((a, b) => b.potentialAbility - a.potentialAbility)[0]
  const summary = best
    ? `${players.length} players have come through this year's intake. The academy director is most excited about ${best.knownAs}, a ${best.age}-year-old ${best.position}.`
    : 'This year\'s intake has produced nobody the academy director rates.'

  return { players, summary }
}

/**
 * Promote an academy player to the senior squad. Returns an error if the squad
 * is already at its registered limit — the constraint that makes promotion a
 * real trade-off rather than a free upgrade.
 */
export function promoteToSenior(
  state: GameState,
  club: Club,
  player: Player,
): { ok: true } | { ok: false; error: string } {
  if (!player.isAcademy) return { ok: false, error: `${player.knownAs} is already in the senior squad.` }
  if (player.clubId !== club.id) return { ok: false, error: 'That player is not at this club.' }

  const seniorCount = club.squad
    .map((id) => state.players[id])
    .filter((p) => p && !p.isAcademy).length
  if (seniorCount >= 30) {
    return { ok: false, error: 'The senior squad is full. Move someone on first.' }
  }

  player.isAcademy = false
  player.squadStatus = 'prospect'
  player.desiredStatus = 'prospect'

  // A promoted player expects a professional wage.
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  if (player.contract) {
    player.contract.wage = Math.max(
      player.contract.wage,
      Math.round(computeWageDemand(player, league, nation) * 0.55),
    )
  }
  return { ok: true }
}

/** Send a player back to the academy — rarely a good idea, but available. */
export function demoteToAcademy(player: Player): void {
  if (player.age > 21) return
  player.isAcademy = true
  player.squadStatus = 'prospect'
}

/**
 * The academy director's own assessment of a prospect, which is what the
 * director of football actually sees. Deliberately imprecise: the whole point
 * of a youth system is that you are betting on incomplete information.
 */
export function academyAssessment(
  state: GameState,
  club: Club,
  player: Player,
): { verdict: string; starRating: number; confidence: 'low' | 'medium' | 'high' } {
  const director = club.staff
    .map((id) => state.staff[id])
    .filter((s): s is Staff => Boolean(s) && s.role === 'academyDirector')[0]
  const skill = director ? director.attributes.judgingPotential : 30

  // A poor judge of potential produces a noisier estimate, so a badly-staffed
  // academy is worse at telling you which of its own players is worth keeping.
  const noise = (100 - skill) / 100
  const seed = hashForPlayer(player.id)
  const bias = (seed - 0.5) * 2 * noise * 40
  const estimate = clamp(player.potentialAbility + bias, 20, 200)

  const starRating = clamp(Math.round((estimate / 200) * 5 * 2) / 2, 0.5, 5)
  const confidence = skill > 70 ? 'high' : skill > 45 ? 'medium' : 'low'

  let verdict: string
  if (estimate >= 160) verdict = 'Could play at the very highest level. Do not let him go.'
  else if (estimate >= 135) verdict = 'Has a top-flight career in him if he is handled properly.'
  else if (estimate >= 110) verdict = 'Should make a solid professional. Worth a contract.'
  else if (estimate >= 85) verdict = 'Might make the lower divisions. Nothing more.'
  else verdict = 'Unlikely to make it. Kindest to release him now.'

  return { verdict, starRating, confidence }
}

/**
 * Deterministic pseudo-random in [0,1) from a player id. Used so the academy
 * director's assessment of a given player is stable across screens and
 * reloads — an estimate that changed every time you opened the profile would
 * be no estimate at all.
 */
function hashForPlayer(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 8) / 16777216
}

/** Academy players eligible for release, with the reason. */
export function releaseCandidates(state: GameState, club: Club): { player: Player; reason: string }[] {
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && p.isAcademy)
    .filter((p) => p.age >= 18)
    .map((p) => {
      const assessment = academyAssessment(state, club, p)
      return { player: p, assessment }
    })
    .filter((entry) => entry.assessment.starRating <= 2)
    .map((entry) => ({
      player: entry.player,
      reason: entry.assessment.verdict,
    }))
}
