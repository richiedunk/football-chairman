import { clamp } from '../rng'
import { squadImportance } from './valuation'
import type { Club, GameState, Player, PlayerTrait } from '../types'

/**
 * The dressing room.
 *
 * The traits have been in the game since the world was first generated and
 * they only ever affected the man carrying them: `professional` gave its owner
 * +0.6 of morale drift a week, `disruptive` −0.8, and a leader lifted nobody
 * at all. A dressing room is precisely the thing that does not work that way.
 *
 * **It cuts both ways, and that is the design.** A senior professional who
 * sets standards raises the players around him as surely as a disruptive one
 * drags them down. A system where every signing is a risk and none is an
 * upside is not a dressing room, it is a tax, so the lift has to be real
 * enough to be worth paying a premium for — which `scripts/roomcheck.ts`
 * measures rather than assumes.
 *
 * **The line this must not cross.** It gives information and consequences,
 * never man-management. There are no team talks here, no praising or fining
 * players, no promises made in a meeting. You learn the room is turning, you
 * see it in morale and in form and in who will re-sign, and you act on it the
 * way a director actually does: by selling someone, by not renewing someone,
 * by signing a certain kind of professional, or by backing or dismissing the
 * head coach. Every one of those already exists.
 */

/**
 * What each trait does to the people around its owner, per week.
 *
 * Deliberately asymmetric. A disruptive player costs more than a professional
 * gives, because that is true and because it is what makes the scout's warning
 * worth paying for — but `leader` is the largest single number here, so a room
 * with one is a room worth building.
 */
const ROOM_INFLUENCE: Partial<Record<PlayerTrait, number>> = {
  leader: 1.5,
  professional: 0.9,
  loyal: 0.3,
  disruptive: -1.7,
  hothead: -0.6,
  mercenary: -0.3,
}

/**
 * How much a player's voice carries.
 *
 * Standing in the squad, not ability alone: a disruptive star does far more
 * damage than a disruptive back-up, and a leader nobody picks sets no tone at
 * all. This is the part that makes *who* you sell matter rather than how many.
 */
export function voice(state: GameState, player: Player, club: Club): number {
  const standing = squadImportance(state, player, club)
  // Age carries its own authority — a senior professional is listened to in a
  // way a promising twenty-year-old with the same rating is not.
  const seniority = clamp((player.age - 20) / 14, 0, 1)
  return clamp(0.35 + standing * 0.8 + seniority * 0.35, 0, 1.5)
}

/** One player's weekly contribution to the room, positive or negative. */
export function influenceOf(state: GameState, player: Player, club: Club): number {
  let raw = 0
  for (const trait of player.traits) raw += ROOM_INFLUENCE[trait] ?? 0
  if (raw === 0) return 0

  // A miserable player is a worse presence whatever he is like normally, and a
  // happy one carries his own weight. Morale feeds the room as well as
  // draining from it, which is what lets a bad spell compound.
  const mood = 0.7 + (player.morale / 100) * 0.6
  return raw * voice(state, player, club) * (raw > 0 ? mood : 2 - mood)
}

export interface RoomReading {
  /** −10 to +10, the weekly morale swing the room applies to everyone in it. */
  tone: number
  /** Players lifting the room, strongest first. */
  setters: { player: Player; influence: number }[]
  /** Players dragging it down, worst first. */
  draggers: { player: Player; influence: number }[]
}

/**
 * Read the room.
 *
 * Derived every time rather than stored, so it cannot drift out of step with
 * the squad it describes — sell the wrong man and the reading changes the same
 * afternoon.
 */
export function readRoom(state: GameState, club: Club): RoomReading {
  const contributions: { player: Player; influence: number }[] = []
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.isAcademy) continue
    const influence = influenceOf(state, player, club)
    if (influence !== 0) contributions.push({ player, influence })
  }

  const total = contributions.reduce((sum, c) => sum + c.influence, 0)
  // Divided by a nominal squad rather than the actual one, so a thin squad
  // does not get a louder room by having fewer people in it.
  const tone = clamp(total / 6, -10, 10)

  return {
    tone,
    setters: contributions.filter((c) => c.influence > 0)
      .sort((a, b) => b.influence - a.influence),
    draggers: contributions.filter((c) => c.influence < 0)
      .sort((a, b) => a.influence - b.influence),
  }
}

/**
 * Plain English for a tone figure, because a number alone says nothing.
 *
 * The bands are set from the range the mechanism actually reaches, not from a
 * tidy-looking −10 to +10. Measured across squads, one player swapped between
 * leader and disruptive moves the tone about 0.75, a deliberately stacked room
 * of six leaders reaches 1.95, and an ordinary squad sits near 0.6 — so bands
 * at ±1 and ±3 labelled every real squad "Ordinary" and the reading told the
 * reader nothing. A scale nobody ever moves off the middle of is not a scale.
 *
 * The tone itself is left alone rather than multiplied up to fill the bands,
 * because it is also the morale coefficient and its size there is measured.
 * Display range and mechanical range are different problems.
 */
export function roomLabel(tone: number): string {
  if (tone >= 1.5) return 'Excellent'
  if (tone >= 0.5) return 'Good'
  if (tone > -0.5) return 'Ordinary'
  if (tone > -1.5) return 'Poor'
  return 'Toxic'
}

/** Where a tone sits on a 0-100 meter, for the UI. */
export function roomMeter(tone: number): number {
  return clamp(((tone + 2.5) / 5) * 100, 0, 100)
}

/**
 * What the reading is actually telling you.
 *
 * Named on the strongest voice in the room rather than on the overall tone,
 * because the tone is an average and an average hides the person. One
 * disruptive senior in an otherwise level squad reads about −0.4 — "Ordinary"
 * — and saying "nobody sets the tone here" while somebody plainly is, and is a
 * name the director could act on, is the wrong answer to give him.
 */
export function roomSummary(reading: RoomReading): string {
  const { tone, setters, draggers } = reading
  const worst = draggers[0]
  const best = setters[0]

  if (tone <= -1.5) {
    return 'The room has gone. It will show on Saturday before it shows anywhere else.'
  }
  if (worst && (tone < 0.5 || Math.abs(worst.influence) > (best?.influence ?? 0))) {
    return tone < -0.5
      ? `${worst.player.knownAs} is the problem, and everyone in there knows it.`
      : `${worst.player.knownAs} is doing the room no good, whatever the mood looks like.`
  }
  if (best && tone >= 1.5) {
    return `${best.player.knownAs} sets the standard and the rest follow it.`
  }
  if (best) return `${best.player.knownAs} holds it together.`
  return 'Nobody sets the tone here, for better or worse.'
}

/**
 * The tone an ordinary squad reads, measured rather than assumed.
 *
 * Across a generated world of 238 clubs thirty weeks in: median 0.78, mean
 * 0.78, tenth percentile 0.07, ninetieth 1.47, and only fourteen clubs below
 * zero at all.
 *
 * That number is the whole story of why this system did nothing for so long.
 * Both halves of it treated **zero** as the neutral room. But an ordinary
 * squad already sits at 0.78, so the bad-room penalty — which only fired below
 * zero — reached six per cent of the world, and the good-room reward was
 * measured from an origin every club had already passed. A well-run squad was
 * being rewarded for being normal, and the difference between a median room
 * and a top-decile one came to a few per cent of one term.
 */
export const ROOM_NEUTRAL = 0.78

/**
 * What a room is worth, as a shift in the morale a player settles at.
 *
 * Applied to the **baseline** rather than to the weekly drift, and that is the
 * point. Morale reverts toward its baseline by six per cent a week, so
 * anything added to drift is pulled straight back out again — which is exactly
 * what happened to the two previous attempts. Adding positive drift bought
 * +1.34 morale against a bad room's −5.42 and was abandoned as a tax; damping
 * grievances instead measured at −0.21 for a leader, which is to say nothing
 * at all. Neither failed because the idea was wrong. They failed because a
 * transient cannot survive a mechanism whose whole job is to erase transients.
 *
 * A baseline shift does survive it, by construction: a well-run squad is not a
 * squad having a good week, it is a squad that is a better place to be.
 * Symmetric, so a bad room is the same statement in reverse, and centred on
 * `ROOM_NEUTRAL` so that an ordinary squad is worth nothing either way.
 */
export function roomBaseline(tone: number): number {
  return clamp((tone - ROOM_NEUTRAL) * 3, -6, 6)
}

/**
 * How much harder a bad room makes it to keep people.
 *
 * The consequence that costs a director most, and the one that is hardest to
 * see coming: a player weighing a new contract is weighing the room as well as
 * the money, and a squad nobody wants to be in becomes a squad nobody re-signs
 * for. Returns a multiplier on renewal willingness.
 */
export function renewalAppetite(tone: number): number {
  return clamp(1 + tone * 0.06, 0.7, 1.3)
}
