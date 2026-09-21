import { clamp, Rng } from '../rng'
import { IdFactory } from '../ids'
import { addInboxItem, addNews } from './inbox'
import { formatMoney } from './valuation'
import type { CompletedTransfer, GameState, ID } from '../types'

/**
 * What became of them.
 *
 * You sign a player, you are sacked two seasons later, and that is the last
 * the game ever tells you about him. Everything you built carries on being
 * played by somebody else and the career screen records only where *you* were,
 * as though the clubs stopped existing when you left them.
 *
 * They do not. The simulation keeps running every club in the world whether
 * you are there or not, so the answer to "what happened to him" is already
 * sitting in the state — it has simply never been asked for.
 *
 * ## Why this is a verdict and not a feed
 *
 * The temptation is a news ticker of every club you have ever left. That is
 * noise, and worse, it is noise that arrives weekly and stops meaning
 * anything. What lands is the *judgement*: the striker you paid eight million
 * for, sold for nine hundred thousand by the man who replaced you. That is one
 * message, it arrives once, and it is the only message that was ever worth
 * sending.
 *
 * So this reports a signing exactly once, only when something has actually
 * become of him, and only from clubs you no longer run. A player still at the
 * club you left, still in the side, is not news. A player the successor could
 * not get rid of fast enough is.
 *
 * Nothing here is a decision. Like `oneThatGotAway.ts`, it is a consequence of
 * one made years ago arriving when nothing can be done about it, which is the
 * shape of the real thing.
 */

export type VerdictKind =
  | 'sold'
  | 'soldAtLoss'
  | 'released'
  | 'retired'
  | 'thriving'
  | 'stillThere'

export interface SuccessorVerdict {
  playerId: ID
  playerName: string
  /** The club you signed him for. */
  clubId: ID
  clubName: string
  /** The season you signed him. */
  signedSeason: number
  /** What you paid. */
  paid: number
  kind: VerdictKind
  /** Where he is now, if anywhere. */
  nowClubName: string | null
  /** What he went for, when he went. */
  soldFor: number | null
  /** The one line of it. */
  line: string
}

/**
 * Signings from a spell that has ended.
 *
 * `coachView.yourSignings` answers the same question for the job you are in
 * now and deliberately filters to players still at the club, because it is
 * feeding a team-selection verdict. This one wants precisely the players who
 * are *not* there any more, so it shares the shape and none of the filter.
 */
export function signingsFromSpell(
  state: GameState,
  clubId: ID,
  fromSeason: number,
  toSeason: number,
): CompletedTransfer[] {
  const seen = new Set<ID>()
  const out: CompletedTransfer[] = []
  for (const t of state.completedTransfers) {
    if (t.toClubId !== clubId) continue
    if (t.season < fromSeason || t.season > toSeason) continue
    if (seen.has(t.playerId)) continue
    seen.add(t.playerId)
    out.push(t)
  }
  return out
}

/**
 * What became of one signing.
 *
 * Returns null when nothing has, which is most of them. A player who is still
 * at the club doing what he was bought to do is not a verdict on anybody.
 */
export function verdictFor(
  state: GameState,
  transfer: CompletedTransfer,
  clubName: string,
): SuccessorVerdict | null {
  const player = state.players[transfer.playerId]
  const base = {
    playerId: transfer.playerId,
    playerName: transfer.playerName,
    clubId: transfer.toClubId,
    clubName,
    signedSeason: transfer.season,
    paid: transfer.fee,
  }

  // Gone from the world entirely: he has hung them up.
  if (!player) {
    return {
      ...base,
      kind: 'retired',
      nowClubName: null,
      soldFor: null,
      line: `${transfer.playerName} has retired.`,
    }
  }

  // No club at all. Somebody let him go and nobody came.
  if (!player.clubId) {
    return {
      ...base,
      kind: 'released',
      nowClubName: null,
      soldFor: null,
      line: `${player.knownAs} was released. He has not found a club.`,
    }
  }

  // Still where you left him.
  if (player.clubId === transfer.toClubId) {
    // Worth saying only if he has become the thing you hoped for.
    const club = state.clubs[transfer.toClubId]
    const seasons = state.date.season - transfer.season
    if (club && seasons >= 3 && player.currentAbility >= 140) {
      return {
        ...base,
        kind: 'stillThere',
        nowClubName: club.name,
        soldFor: null,
        line: `${player.knownAs} is still at ${club.name}, ${seasons} years on.`,
      }
    }
    return null
  }

  // He moved on. Find the deal that moved him.
  const exit = lastExitFrom(state, player.id, transfer.toClubId, transfer.season)
  const now = state.clubs[player.clubId]
  const nowName = now?.name ?? null
  const soldFor = exit?.fee ?? null

  // The sting: a fee that went backwards. Judged against what you paid, and
  // only when you paid something — a free transfer sold for nothing is not a
  // loss, it is how a free transfer ends.
  if (transfer.fee > 0 && soldFor !== null && soldFor < transfer.fee * 0.5) {
    const currency = state.settings.currency
    return {
      ...base,
      kind: 'soldAtLoss',
      nowClubName: nowName,
      soldFor,
      line: `${player.knownAs}, who cost ${formatMoney(transfer.fee, currency)}, `
        + `was sold to ${nowName ?? 'another club'} for ${formatMoney(soldFor, currency)}.`,
    }
  }

  // He went up in the world, which is a verdict of a better kind.
  const oldClub = state.clubs[transfer.toClubId]
  if (now && oldClub && now.reputation > oldClub.reputation + 12) {
    return {
      ...base,
      kind: 'thriving',
      nowClubName: nowName,
      soldFor,
      line: `${player.knownAs} is at ${now.name} now. You signed him for ${oldClub.name}.`,
    }
  }

  if (soldFor !== null) {
    const currency = state.settings.currency
    return {
      ...base,
      kind: 'sold',
      nowClubName: nowName,
      soldFor,
      line: `${player.knownAs} was sold to ${nowName ?? 'another club'} for `
        + `${formatMoney(soldFor, currency)}.`,
    }
  }

  return null
}

/** The deal that took him away from a club, if there was one. */
function lastExitFrom(
  state: GameState,
  playerId: ID,
  clubId: ID,
  afterSeason: number,
): CompletedTransfer | null {
  let found: CompletedTransfer | null = null
  for (const t of state.completedTransfers) {
    if (t.playerId !== playerId || t.fromClubId !== clubId) continue
    if (t.season < afterSeason) continue
    if (!found || t.season > found.season || (t.season === found.season && t.week > found.week)) {
      found = t
    }
  }
  return found
}

export interface SuccessorDeps {
  ids: IdFactory
  rng: Rng
}

/**
 * Look in on the clubs you have left, and report once on each signing.
 *
 * Run at the season roll rather than weekly. This is a thing you hear about
 * when somebody mentions it, not a wire you are subscribed to, and a yearly
 * cadence is also what stops it becoming the noise the header warns about.
 *
 * At most two per season. The cap is doing real work: a director who spent
 * six years somewhere signed thirty players, and thirty verdicts in one week
 * is a spreadsheet of regret rather than a moment of it.
 */
export const VERDICTS_PER_SEASON = 2

export function reportSuccessorVerdicts(
  state: GameState,
  deps: SuccessorDeps,
): SuccessorVerdict[] {
  const past = state.director.careerHistory.filter(
    (entry) => entry.toSeason !== null && entry.clubId !== state.playerClubId,
  )
  if (past.length === 0) return []

  const reported = state.reportedSignings ?? []
  const seen = new Set<ID>(reported)
  const candidates: SuccessorVerdict[] = []

  for (const spell of past) {
    // Give it a season. A player sold the week you left is the club tidying
    // up after you, not a judgement on the signing.
    if (state.date.season - (spell.toSeason ?? 0) < 1) continue

    for (const transfer of signingsFromSpell(
      state, spell.clubId, spell.fromSeason, spell.toSeason ?? spell.fromSeason,
    )) {
      if (seen.has(transfer.playerId)) continue
      const verdict = verdictFor(state, transfer, spell.clubName)
      if (verdict) candidates.push(verdict)
    }
  }

  if (candidates.length === 0) return []

  // The ones that sting first, then the largest fees, so the two that arrive
  // are the two worth hearing rather than the two that sorted first.
  candidates.sort((a, b) => weightOf(b) - weightOf(a) || b.paid - a.paid)

  const chosen = candidates.slice(0, VERDICTS_PER_SEASON)
  const keep = [...reported]

  for (const verdict of chosen) {
    keep.push(verdict.playerId)

    addInboxItem(state, deps.ids, {
      category: 'transfer',
      subject: `${verdict.playerName} — ${SUBJECTS[verdict.kind]}`,
      from: 'Your representative',
      body: `${verdict.line} You signed him for ${verdict.clubName} in `
        + `${verdict.signedSeason}. Thought you would want to know before you `
        + 'read it somewhere else.',
      urgent: false,
      link: state.players[verdict.playerId] ? { view: 'player', id: verdict.playerId } : null,
    })

    addNews(state, deps.ids, 'transfer', verdict.line,
      state.players[verdict.playerId] ? { view: 'player', id: verdict.playerId } : null,
      verdict.clubId)
  }

  // Reported ids are kept rather than a flag per player, because a player who
  // has left the world entirely still must not be reported twice — and a
  // retired player has no object left to carry a flag.
  state.reportedSignings = keep.length > 400 ? keep.slice(-400) : keep

  // A bad verdict costs you something. Not much, and not for long, but the
  // trade a director makes is his judgement against his reputation and this is
  // the only place the second half of that ever arrives.
  const damage = chosen.filter((v) => v.kind === 'soldAtLoss').length
  if (damage > 0) {
    state.director.reputation = clamp(state.director.reputation - damage * 1.5, 1, 100)
  }

  return chosen
}

const SUBJECTS: Record<VerdictKind, string> = {
  sold: 'sold on',
  soldAtLoss: 'sold at a loss',
  released: 'released',
  retired: 'retired',
  thriving: 'moved up',
  stillThere: 'still there',
}

/** How much a verdict deserves the slot. */
function weightOf(verdict: SuccessorVerdict): number {
  switch (verdict.kind) {
    case 'soldAtLoss': return 5
    case 'thriving': return 4
    case 'released': return 3
    case 'retired': return 2
    case 'sold': return 1
    case 'stillThere': return 1
  }
}

/**
 * Everything the save has ever reported, for a screen that wants the lot.
 *
 * Recomputed rather than stored: the verdicts are derived from transfers and
 * the current world, both of which are already in the save, and storing the
 * text would mean a migration every time a line was rewritten.
 */
export function allVerdicts(state: GameState): SuccessorVerdict[] {
  const out: SuccessorVerdict[] = []
  const reported = new Set(state.reportedSignings ?? [])
  for (const spell of state.director.careerHistory) {
    if (spell.toSeason === null) continue
    for (const transfer of signingsFromSpell(
      state, spell.clubId, spell.fromSeason, spell.toSeason,
    )) {
      if (!reported.has(transfer.playerId)) continue
      const verdict = verdictFor(state, transfer, spell.clubName)
      if (verdict) out.push(verdict)
    }
  }
  return out.sort((a, b) => b.signedSeason - a.signedSeason)
}
