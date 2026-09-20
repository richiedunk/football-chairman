import type {
  AttributeKey, Club, CoachProfile, CompletedTransfer, Fixture, GameState, MatchResult, Player,
  Position, Staff,
} from '../types'
import { FORMATION_SHAPES, isAvailable, selectableSquad, selectionScore } from '../sim/selection'
import { isRegisteredFor } from './registration'
import { coachRegister, pickBy, type CoachRegister } from './voice'

/**
 * What the head coach makes of your players.
 *
 * Your own players train with your staff every day, so their attributes are
 * known to the pound. What was never shown is the one opinion that decides
 * whether any of that matters: his. He picks the team, he over-weights the
 * attributes his style depends on, he distrusts anyone under twenty-one if
 * that is the kind of coach he is — and the game had all of this modelled in
 * `selectionScore` and none of it on a screen. "He doesn't rate your signing"
 * was a sentence in the README.
 *
 * So this derives his view from the same score the selector uses, without the
 * weekly whim, and says it in words. Where the reason is legible it is given.
 * Nothing here is stored and nothing here changes what he does on Saturday;
 * it only stops that being a surprise.
 */

export type CoachOpinion =
  | 'firstName'   // top of the pecking order for his slot
  | 'inPlans'     // starts, in a slot with room for more than one
  | 'squad'       // first off the bench
  | 'notFancied'  // behind the bench
  | 'ratherNot'   // a long way behind
  | 'barred'      // not on the squad list, which is your doing
  | 'noPlace'     // his formation has no slot the player can fill

export interface CoachView {
  opinion: CoachOpinion
  /** The opinion as the coach would say it. */
  label: string
  /** Why, where it can be said in one line. */
  reason: string | null
  /** The slot he would be picked for, if any. */
  slot: Position | null
  /** 1 = nobody at the club scores higher for that slot. */
  rank: number
  /** How many of that slot the formation has. */
  places: number
}

const LABELS: Record<CoachOpinion, string> = {
  firstName: 'First name on the sheet',
  inPlans: 'In his plans',
  squad: 'First off the bench',
  notFancied: 'Not fancied',
  ratherNot: 'Would rather not',
  barred: 'Cannot pick him',
  noPlace: 'No place for him',
}

/** `workRate` → "work rate", for a sentence. */
function attributeWord(key: AttributeKey): string {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase()
}

/** Everyone the coach considers when he picks, by the selector's own rules. */
function candidates(state: GameState, club: Club): Player[] {
  const fit = selectableSquad(state, club).filter((p) => isAvailable(p, club.id) && !p.isAcademy)
  const eligible = fit.filter((p) => isRegisteredFor(club, p))
  return eligible.length >= 11 ? eligible : fit
}

export function coachView(state: GameState, club: Club, player: Player): CoachView | null {
  const coachStaff: Staff | null = club.headCoachId ? state.staff[club.headCoachId] ?? null : null
  const coach = coachStaff?.coachProfile ?? null
  if (!coach) return null

  const shape = FORMATION_SHAPES[coach.formation]
  const slots = Array.from(new Set(shape))

  // His best slot in this shape, by the score the selector would give him.
  let slot: Position | null = null
  let best = 0
  for (const s of slots) {
    const score = selectionScore(player, s, coach, club)
    if (score > best) {
      best = score
      slot = s
    }
  }

  if (!slot || best <= 0) {
    return {
      opinion: 'noPlace',
      label: LABELS.noPlace,
      reason: `Nowhere to put ${positionWord(player.position)} in a ${coach.formation}.`,
      slot: null, rank: 0, places: 0,
    }
  }

  const pool = candidates(state, club)
  if (!pool.some((p) => p.id === player.id)) {
    const registered = isRegisteredFor(club, player)
    return {
      opinion: 'barred',
      label: LABELS.barred,
      reason: registered
        ? 'Not available to him this week.'
        : 'Not on the squad list. That one is on you.',
      slot, rank: 0, places: 0,
    }
  }

  const places = shape.filter((s) => s === slot).length
  const rank = 1 + pool.filter(
    (p) => p.id !== player.id && selectionScore(p, slot!, coach, club) > best,
  ).length

  const opinion: CoachOpinion =
    rank === 1 ? 'firstName'
    : rank <= places ? 'inPlans'
    : rank === places + 1 ? 'squad'
    : rank <= places + 3 ? 'notFancied'
    : 'ratherNot'

  return {
    opinion,
    label: LABELS[opinion],
    reason: reasonFor(opinion, player, coach, club),
    slot, rank, places,
  }
}

function positionWord(position: Position): string {
  const words: Record<Position, string> = {
    GK: 'a goalkeeper', DC: 'a centre-back', DL: 'a left-back', DR: 'a right-back',
    DM: 'a holding midfielder', MC: 'a central midfielder', ML: 'a left-sided player',
    MR: 'a right-sided player', AM: 'a number ten', ST: 'a striker',
  }
  return words[position]
}

/**
 * The first reason that applies, in the order a coach would give them. Only
 * the ones that are actually legible in the model; where he simply has
 * better players, the honest answer is that, and it is said.
 */
function reasonFor(opinion: CoachOpinion, player: Player, coach: CoachProfile, club: Club): string | null {
  if (opinion === 'firstName') return 'Picks himself.'
  if (opinion === 'inPlans') return null

  if (player.age <= 20 && coach.trustInYouth < 40) {
    return 'He does not trust anyone under twenty-one.'
  }
  if (player.fitness < 60) return 'Not match fit, and he will not carry anyone.'
  if (player.form < 40) return 'Has not been playing well, and the coach has noticed.'

  // The attribute his style leans on hardest that the player has least of.
  if (club.strategy.systemFit > 0 && coach.valuedAttributes.length) {
    let worst: AttributeKey | null = null
    let worstValue = 21
    for (const key of coach.valuedAttributes) {
      const v = player.attributes[key]
      if (v < worstValue) {
        worstValue = v
        worst = key
      }
    }
    if (worst && worstValue < 10) {
      return `He wants ${attributeWord(worst)}, and the lad has ${worstValue} of it.`
    }
  }

  if (opinion === 'squad') return 'Somebody ahead of him is better. For now.'
  return 'He has better players. He may be right.'
}

// ---------------------------------------------------------------------------
// Your signings, and whether he picked them
// ---------------------------------------------------------------------------

/**
 * The players you brought in: anyone who arrived by transfer or loan during
 * your time at this club and is still here. Season granularity, because the
 * career record keeps seasons rather than weeks — a signing made in the same
 * season before you arrived counts as yours, which is the price of not adding
 * a field to the save for a footnote.
 */
export function yourSignings(state: GameState, club: Club): Player[] {
  const spell = state.director.careerHistory.find((e) => e.clubId === club.id && e.toSeason === null)
  if (!spell) return []
  const here = new Set<string>([...club.squad, ...club.loanedIn])
  const seen = new Set<string>()
  const out: Player[] = []
  for (const t of state.completedTransfers as CompletedTransfer[]) {
    if (t.toClubId !== club.id || t.season < spell.fromSeason) continue
    if (seen.has(t.playerId) || !here.has(t.playerId)) continue
    const p = state.players[t.playerId]
    if (!p) continue
    seen.add(t.playerId)
    out.push(p)
  }
  return out
}

export interface SigningsVerdict {
  signings: Player[]
  started: Player[]
  leftOut: Player[]
  register: CoachRegister
  /** What he has to say about it, in his own voice. */
  line: string
}

/**
 * What he says, and — more often — what he does not.
 *
 * `scripts/voicecheck.ts` played a season and read these in order, which is
 * the only way this kind of fault shows up: every line passes a unit test on
 * its own call. It found the coach saying "Nothing of yours to pick from yet"
 * twenty-four times, "No signings yet. Noted." twenty-three times, and the
 * identical sentence seven weeks running. A pool of two is a pool of one by
 * March.
 *
 * The fix is not more lines. It is that **he only speaks when something
 * happened.** No signings is not news, and the headline beside him already
 * says so in three words. All of them starting is not news either — it is the
 * week going as you hoped. What is news is a man you paid for watching from
 * the bench, which is the thing this whole screen exists to surface, and that
 * is the only case with a pool behind it now.
 */
const LINES = {
  noMatch: {
    warm: [
      'Ask me after Saturday.',
      'Give me a game to judge them on.',
      'I have seen them train. Training is not Saturday.',
    ],
    brisk: ['No match yet.', 'Ask me after a game.', 'Nothing to judge yet.'],
    terse: ['Not yet.', 'Saturday.', 'Ask me later.'],
    pointed: [
      'Ask me after Saturday. If you are still here.',
      'I have seen them train. Ask me after a match.',
      'No game, no opinion. That is how it works.',
    ],
  },
  some: {
    warm: [
      '{name} needs a bit longer. Not a knock on you.',
      '{name} will get his chance. Just not this week.',
      'Left {name} out. He took it well, which tells you something about him.',
      '{name} is close. One more week in that shape and he is in.',
      'No room for {name} today. That is on the shape, not on him.',
    ],
    brisk: [
      '{name} was not ready.',
      'Left {name} out. Nothing personal.',
      '{name} did not make it this week.',
      'No {name} today. He knows why.',
      '{name} missed out. We move on.',
    ],
    terse: [
      'Left {name} out.',
      '{name}: no.',
      'Not {name}. Not this week.',
      'No room for {name}.',
      '{name} sat.',
    ],
    pointed: [
      'I left {name} out. You will want to ask why. I would want to ask why you bought him.',
      '{name} did not make it. I pick footballers.',
      'You signed {name}. I did not. He watched.',
      '{name} is not in my side and I am not going to pretend otherwise to keep you happy.',
      'Left {name} out again. At some point that becomes a conversation about recruitment.',
    ],
  },
  noneOfThem: {
    warm: [
      'Could not fit any of yours in this week. Next week, maybe.',
      'None of yours today, sorry. It is a squad game.',
      'Not one of your lads got on. That is how it fell, not a verdict.',
    ],
    brisk: [
      'None of yours this week.',
      'Nobody you signed started.',
      'Not one of yours today.',
    ],
    terse: ['None.', 'No.', 'Not one.'],
    pointed: [
      'I pick players who can play. None of yours qualified.',
      'Not one of them. Have a think about that.',
      'Your entire recruitment watched that from the bench.',
    ],
  },
} as const satisfies Record<string, Record<CoachRegister, readonly string[]>>

/**
 * How many of the players you signed the coach actually started, and what he
 * says about it. The number that matters weekly in a game where somebody else
 * picks the team, and until now it lived in nobody's head but his.
 */
export function signingsVerdict(
  state: GameState,
  club: Club,
  match: { fixture: Fixture; result: MatchResult } | null,
): SigningsVerdict | null {
  const coachStaff: Staff | null = club.headCoachId ? state.staff[club.headCoachId] ?? null : null
  const coach = coachStaff?.coachProfile ?? null
  if (!coachStaff || !coach) return null

  const register = coachRegister(coachStaff.attributes.mediaHandling, coach.dofRelationship)
  const signings = yourSignings(state, club)
  const key = `signings:${club.id}:${coachStaff.id}:${match?.fixture.id ?? 'none'}`

  // No signings is not news, and the screen beside him already says so. He is
  // silent rather than filling the space, which is what the season read said
  // he had to be.
  if (!signings.length) {
    return { signings, started: [], leftOut: [], register, line: '' }
  }
  if (!match) {
    return { signings, started: [], leftOut: [], register, line: pickBy(key, register, LINES.noMatch) }
  }

  const isHome = match.fixture.homeClubId === club.id
  const lineup = new Set(isHome ? match.result.homeLineup : match.result.awayLineup)
  const started = signings.filter((p) => lineup.has(p.id))
  const leftOut = signings.filter((p) => !lineup.has(p.id))

  // Everyone you signed played. That is the week going as you hoped, and a
  // manager who rings you to report that is a manager inventing a phone call.
  if (!leftOut.length) return { signings, started, leftOut, register, line: '' }

  const pool = started.length ? LINES.some : LINES.noneOfThem
  const line = pickBy(key, register, pool).replace('{name}', leftOut[0].knownAs)
  return { signings, started, leftOut, register, line }
}
