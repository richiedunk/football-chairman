import { clamp } from '../rng'
import type { Agent, Club, GameState, ID, Player } from '../types'

/**
 * Agents.
 *
 * A transfer has three parties, and only two of them want the deal to be
 * about football. The agent is the one who remembers: he represents a bloc of
 * players rather than one, he deals with you again next window and the window
 * after, and how you treated his last client is priced into what he asks for
 * the next one.
 *
 * That memory is the whole point. Squeezing an agent on his fee is free once
 * and expensive for years, and the director who pays up cheerfully finds that
 * the good players start being available to him. It is the only system in the
 * game where being liked is worth money.
 */

/** Relationship bands, for the UI and for the thresholds below. */
export type AgentStanding = 'trusted' | 'warm' | 'neutral' | 'strained' | 'hostile'

export function standingFor(relationship: number): AgentStanding {
  if (relationship >= 78) return 'trusted'
  if (relationship >= 60) return 'warm'
  if (relationship >= 38) return 'neutral'
  if (relationship >= 20) return 'strained'
  return 'hostile'
}

export const STANDING_LABELS: Record<AgentStanding, string> = {
  trusted: 'Trusted',
  warm: 'Warm',
  neutral: 'Neutral',
  strained: 'Strained',
  hostile: 'Hostile',
}

export const STANDING_NOTES: Record<AgentStanding, string> = {
  trusted: 'He brings you deals before anyone else hears about them, and does not squeeze you on the fee.',
  warm: 'He will take your call and deal straight with you.',
  neutral: 'Business is business. He has no particular reason to help you or hinder you.',
  strained: 'He remembers how you treated his clients, and it costs you on every fee.',
  hostile: 'He would rather his clients went anywhere else, and prices accordingly.',
}

export function agentFor(state: GameState, player: Player): Agent | null {
  return player.agentId ? state.agents[player.agentId] ?? null : null
}

/** Clients of this agent, best first. Used by the agent screen. */
export function clientsOf(state: GameState, agent: Agent): Player[] {
  return agent.clientIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => b.currentAbility - a.currentAbility)
}

/**
 * What the agent wants to complete a deal.
 *
 * Reputation sets his rate, aggression sets how hard he pushes it, and the
 * relationship discounts or inflates the result — which is what makes the
 * relationship worth money rather than worth flavour text.
 */
export function agentFee(agent: Agent | null, annualWage: number): number {
  if (!agent) return 0
  const base = 0.05 + (agent.reputation / 100) * 0.06 + (agent.aggression / 100) * 0.08
  return Math.round(annualWage * base * relationshipMultiplier(agent))
}

/** 0.72 when trusted, 1.45 when hostile. */
export function relationshipMultiplier(agent: Agent): number {
  return clamp(1.45 - (agent.relationship / 100) * 0.73, 0.72, 1.45)
}

/**
 * How willing the agent is to let a deal happen at all.
 *
 * Applied to the player's own satisfaction with an offer, so a hostile agent
 * makes his client harder to sign without making the terms look worse — which
 * is exactly how it feels from the outside: the numbers are fine and the deal
 * keeps not happening.
 */
export function agentWillingness(agent: Agent | null): number {
  if (!agent) return 1
  return clamp(0.82 + (agent.relationship / 100) * 0.26, 0.82, 1.08)
}

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

/**
 * Every way a director can move an agent's opinion of him.
 *
 * Deliberately weighted so that the things that cost nothing at the time —
 * freezing a client out, haggling a fee down, letting a contract run down —
 * are the ones that cost most later.
 */
export const RELATIONSHIP_EVENTS = {
  signedClient: 7,
  renewedClient: 5,
  paidFeeWithoutArgument: 3,
  promotedClientFromAcademy: 4,
  hagglingAccepted: -4,
  hagglingRefused: -9,
  soldClient: -5,
  releasedClient: -8,
  loanedClientOut: -2,
  clientFrozenOut: -3,
  refusedRenewal: -6,
  clientRanDownContract: -7,
} as const

export type RelationshipEvent = keyof typeof RELATIONSHIP_EVENTS

/**
 * Move an agent's opinion. Only ever tracked for the human's club — the world
 * has no interest in how two AI clubs get on with each other, and tracking it
 * would be tens of thousands of numbers nobody reads.
 */
export function adjustRelationship(
  state: GameState,
  clubId: ID,
  agent: Agent | null,
  event: RelationshipEvent,
): number {
  if (!agent || clubId !== state.playerClubId) return 0
  const delta = RELATIONSHIP_EVENTS[event]
  const before = agent.relationship
  agent.relationship = clamp(agent.relationship + delta, 0, 100)
  return agent.relationship - before
}

/** Convenience: move the agent of a specific player. */
export function adjustForPlayer(
  state: GameState,
  clubId: ID,
  player: Player,
  event: RelationshipEvent,
): number {
  return adjustRelationship(state, clubId, agentFor(state, player), event)
}

/**
 * Agents drift back towards indifference.
 *
 * Without it a single bad window would follow a director for a whole career,
 * and a good one would buy permanent goodwill. Memories fade; grudges fade
 * more slowly than favours, which is also true.
 */
export function decayRelationships(state: GameState): void {
  for (const agent of Object.values(state.agents)) {
    const target = 50
    const rate = agent.relationship < target ? 0.012 : 0.02
    agent.relationship = clamp(
      agent.relationship + (target - agent.relationship) * rate,
      0,
      100,
    )
  }
}

// ---------------------------------------------------------------------------
// The market a relationship opens up
// ---------------------------------------------------------------------------

export interface AgentIntroduction {
  agent: Agent
  player: Player
  note: string
}

/**
 * Players an agent will quietly put in front of you.
 *
 * The reward for a good relationship, and the thing that makes cultivating one
 * a strategy rather than a courtesy: clients who would move, at clubs that
 * have not announced anything, offered to you before the market knows.
 */
export function introductions(state: GameState, club: Club): AgentIntroduction[] {
  const out: AgentIntroduction[] = []

  for (const agent of Object.values(state.agents)) {
    if (standingFor(agent.relationship) !== 'trusted') continue

    for (const player of clientsOf(state, agent)) {
      if (player.clubId === club.id || player.isAcademy) continue
      if (out.length >= 6) break

      // Somebody who would actually move: out of favour, out of contract, or
      // plainly better than the club he is at.
      const unhappy = player.morale < 45 || player.transferRequested
      const running = player.contract
        && player.contract.expiresSeason - state.date.season <= 1
      const free = !player.clubId
      if (!unhappy && !running && !free) continue

      // Not fantasy: he has to be gettable.
      if (player.currentAbility > club.reputation * 1.9) continue

      const note = free
        ? 'He is out of contract and available now.'
        : running
          ? 'His deal is nearly up and the club have not moved.'
          : 'He is unhappy and would listen to an offer.'
      out.push({ agent, player, note })
    }
  }

  return out.sort((a, b) => b.player.currentAbility - a.player.currentAbility)
}

/**
 * The blocs. A handful of agents represent a disproportionate share of the
 * good players, and falling out with one of them closes a door that stays
 * closed.
 */
export function influentialAgents(state: GameState, limit = 8): Agent[] {
  return Object.values(state.agents)
    .map((agent) => ({
      agent,
      weight: clientsOf(state, agent).reduce((sum, p) => sum + Math.max(0, p.currentAbility - 90), 0),
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => entry.agent)
}

/** Agents the human club has actually dealt with or whose clients it holds. */
export function agentsInvolvedWith(state: GameState, club: Club): Agent[] {
  const seen = new Set<ID>()
  for (const id of [...club.squad, ...club.loanedIn]) {
    const player = state.players[id]
    if (player?.agentId) seen.add(player.agentId)
  }
  const own = [...seen].map((id) => state.agents[id]).filter((a): a is Agent => Boolean(a))
  const notable = influentialAgents(state).filter((a) => !seen.has(a.id))
  return [...own, ...notable].sort((a, b) => b.relationship - a.relationship)
}
