import { clamp, Rng } from '../rng'
import type { IdFactory } from '../ids'
import type { Club, GameState, ID, Player, SquadStatus } from '../types'
import { addInboxItem } from './inbox'
import { freshPhrase } from './voice'

/**
 * The player who was good enough to start and did not.
 *
 * `selectTeam` has always computed `unluckyOmissions` — everyone who scored
 * higher than the weakest man the coach actually picked — and the comment
 * above it said it feeds unrest. It fed nothing. The value was computed for
 * every match in the world, returned, and thrown away at the call site, so
 * the £12m signing on the bench was a sentence in a code comment.
 *
 * This is the mechanical half of the thing the game is about. The coach now
 * tells you he left your signing out; this is the signing minding. Nothing
 * here is man-management — there is no team talk, no promise to make, no
 * button that fixes it. You get told, it costs you, and what you do about it
 * is a transfer, a contract, a conversation with the coach, or nothing. That
 * is the dressing room's standing rule and it is not relaxed here.
 *
 * **Only your club.** The selector produces omissions for all ~9,000 fixtures
 * in a season and every one of them but yours is discarded, because no AI club
 * models how its fourth-choice left-back feels. That is the same reason
 * detailed results exist only where you can look.
 */

/**
 * How much a man minds, by the status he believes he has.
 *
 * A star left out is a crisis; a backup left out is a Tuesday. This is the
 * status he *wants* rather than the one you gave him, because the grievance
 * is the gap between them — a player told he is a squad man who considers
 * himself a starter is exactly the case that corrodes a dressing room.
 */
const STING: Record<SquadStatus, number> = {
  star: 3.0,
  firstTeam: 2.2,
  rotation: 1.1,
  backup: 0.4,
  prospect: 0.25,
  surplus: 0,
}

/** A run bites harder than a one-off, up to a ceiling. Nobody sulks forever. */
export function runMultiplier(run: number): number {
  return 1 + Math.min(Math.max(run, 1), 6) * 0.22
}

/** What one snub costs a player's morale, before it is applied. */
export function snubCost(player: Player, run: number): number {
  return STING[player.desiredStatus] * runMultiplier(run)
}

/**
 * When he says something rather than just sulking.
 *
 * Third match running, then every fourth after that. A message every week
 * would be the badge-inflation the phone document refuses: the reader learns
 * to skip a sender who always has the same complaint, and then misses the one
 * that mattered.
 */
export function speaksUpAt(run: number): boolean {
  return run === 3 || (run > 3 && (run - 3) % 4 === 0)
}

const LINES: readonly string[] = [
  '{name} has been in. Third time running he has watched from the bench and he wants to know what he is here for.',
  'Quiet word from {name}. He is fit, he is training well, and he is not playing. He notices who is.',
  '{name} asked me a question I could not answer: what does he have to do to get picked?',
  '{name} is not making a scene about it, which is almost worse. He has stopped asking.',
  '{name} caught me in the car park. Three games, not a minute. He wanted to know if it was something he had done.',
  'I have had {name} in my office. He is not angry yet. He is confused, and confused turns into angry.',
  '{name} wants a meeting with the coach. I have told him I will see what I can do, which is not much.',
  'Word from the training ground: {name} has gone quiet. Three matches on the outside will do that.',
]

const LONG_LINES: readonly string[] = [
  '{name} again. {weeks} matches now. He is asking whether anyone here rates him, and he means you as much as the coach.',
  '{name} has been left out {weeks} times running. His agent has started ringing me instead of him.',
  '{name}, {weeks} matches out. He was polite about it. He will not be next time.',
  '{weeks} games and {name} has not had a kick. He asked me straight out whether he should be looking elsewhere.',
  '{name} has stopped coming to me about it. He has started talking to the other lads instead, which is worse.',
  'That is {weeks} matches for {name} without a game. His family have been on the phone. I did not know what to tell them.',
]

export interface SnubOutcome {
  player: Player
  run: number
  cost: number
  spoke: boolean
}

/**
 * Apply one match's selection to your squad's sense of itself.
 *
 * Everyone who started has his run reset — a game is a game, whatever came
 * before it. Everyone left out with a claim has his run extended and pays for
 * it. A player nobody selected and who had no claim is untouched: he is not
 * being snubbed, he is being ranked, and the profile screen already tells him
 * so in the coach's own words.
 */
export function applySnubs(
  state: GameState,
  club: Club,
  lineup: readonly ID[],
  snubbed: readonly ID[],
  ids: IdFactory,
  rng: Rng,
): SnubOutcome[] {
  const out: SnubOutcome[] = []

  for (const id of lineup) {
    const player = state.players[id]
    if (player && player.snubbedRun) player.snubbedRun = 0
  }

  for (const id of snubbed) {
    const player = state.players[id]
    if (!player || player.clubId !== club.id || player.isAcademy) continue

    const run = (player.snubbedRun ?? 0) + 1
    player.snubbedRun = run

    const cost = snubCost(player, run)
    if (cost <= 0) continue
    player.morale = clamp(player.morale - cost, 1, 100)

    // He does not say it every time, and a contented man lets it go: the
    // threshold is a man already unhappy enough for this to be the thing he
    // leads with, rather than one grievance among several.
    const spoke = speaksUpAt(run) && player.morale < 62 && rng.chance(0.85)
    if (spoke) {
      const key = `snub:${player.id}:${state.date.season}:${state.date.week}`
      const subject = `${player.knownAs} is not being picked`
      // What he has already been heard to say, as templates, so a man who
      // complains every few weeks all season is not given the same sentence
      // each time.
      const said = new Set(
        state.inbox
          .filter((item) => item.subject === subject)
          .map((item) => item.body.replaceAll(player.knownAs, '{name}').replace(/\b\d+\b/, '{weeks}')),
      )
      const body = run >= 7
        ? freshPhrase(key, LONG_LINES, said).replace('{weeks}', String(run))
        : freshPhrase(key, LINES, said)
      addInboxItem(state, ids, {
        category: 'player',
        subject,
        from: 'Player Liaison',
        body: body.replaceAll('{name}', player.knownAs),
        urgent: false,
        link: { view: 'player', id: player.id },
      })
    }

    out.push({ player, run, cost, spoke })
  }

  return out
}

/**
 * How long he has been out, in words.
 *
 * The dressing room is somebody's read, not a gauge — a liaison says "he has
 * not played since before Christmas", not "5". The end-to-end run asserts no
 * figure appears in that column, and it caught this one the first time it was
 * written as a number, which is exactly what that guard is for.
 */
export function runWord(run: number): string {
  if (run >= 8) return 'Has not played in months'
  if (run >= 5) return 'Not picked since he can remember'
  if (run >= 3) return 'Weeks without a game'
  return 'Out of the last two'
}

/** Everyone currently on a run, worst first. For the dressing-room screen. */
export function onARun(state: GameState, club: Club): Player[] {
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && !p.isAcademy && (p.snubbedRun ?? 0) >= 2)
    .sort((a, b) => (b.snubbedRun ?? 0) - (a.snubbedRun ?? 0))
}
