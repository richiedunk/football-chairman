import type { DeadlineOpportunity } from './deadlineDay'

/**
 * Deadline day, at the speed it is actually played.
 *
 * The deadline screen already says the window shuts tonight and already
 * stamps every offer with the hours it has left. Both were fiction: nothing
 * moved, and an offer marked "1h" sat there as long as one marked "24h". This
 * makes the clock real.
 *
 * ## Why this is not the engagement theatre the phone document rules out
 *
 * `docs/the-phone.md` rejects fabricated typing indicators and any latency
 * added to a tick, and it is right to. The distinction is that those inventions
 * make you wait for something that has already happened, whereas this is the
 * one day in the football calendar that genuinely is a clock — the thing being
 * modelled is having to decide now, which is what the screen's own header has
 * claimed since it was written.
 *
 * Three constraints keep it on the right side of that line:
 *
 * - **Nothing is hidden.** Every offer is on screen from the first second,
 *   with its own countdown visible. You are never waiting to find out what is
 *   available; you are watching what is available run out.
 * - **It can be ended at any time.** Shutting the window early is one tap and
 *   it settles immediately. A player who does not want a timer is never held
 *   by one.
 * - **It is never started without being asked for.** The setting is off by
 *   default, and even with it on the day still opens with a question and a
 *   choice of length. Nobody is handed a timer they did not agree to.
 * - **It does not hold you on one screen.** The clock runs in the store
 *   against a wall-clock timestamp, so going to look at the squad list or the
 *   finances does not pause it and does not lose it. At an hour that is not a
 *   nicety: an hour of being unable to leave one page would be the worst
 *   screen in the game.
 *
 * Nothing here touches the simulation. The set of offers is generated exactly
 * as before and is fixed for the week; this decides only which of them are
 * still live at a given moment, so a reload cannot reroll the market and a
 * clock that is never started changes nothing at all.
 */

/**
 * How long the last day lasts, in real minutes.
 *
 * An hour by default, which is the length the thing wants to be. Six minutes
 * was a demonstration of the mechanic rather than the mechanic: the whole
 * point is that a window closing is something you live alongside for an
 * evening while you weigh up a signing, and six minutes is over before the
 * first one can be weighed.
 *
 * The other lengths exist because an hour is a real commitment and the game
 * should not be the one deciding somebody has it spare.
 */
export const WINDOW_MINUTES = 60

/** The lengths offered when the day opens. */
export const WINDOW_CHOICES: { minutes: number; label: string; detail: string }[] = [
  { minutes: 60, label: 'The full day', detail: 'An hour. Go and do other things; it keeps running.' },
  { minutes: 20, label: 'A short day', detail: 'Twenty minutes, same shape.' },
  { minutes: 5, label: 'The last hours', detail: 'Five minutes. Everything at once.' },
]

/** Hours in the fictional day the window compresses. */
export const WINDOW_HOURS = 24

export function windowMs(minutes = WINDOW_MINUTES): number {
  return Math.max(1, minutes) * 60_000
}

/**
 * How much of the fictional day is left, as hours.
 *
 * Returns a fraction rather than a whole number so the countdown can show
 * minutes: a clock that only moves once every fifteen real seconds looks
 * broken rather than tense.
 */
export function hoursLeft(elapsedMs: number, totalMs: number): number {
  if (totalMs <= 0) return 0
  const fraction = 1 - elapsedMs / totalMs
  return Math.max(0, Math.min(WINDOW_HOURS, fraction * WINDOW_HOURS))
}

/**
 * Has this offer gone?
 *
 * `DeadlineOpportunity.hours` is how long the offer stands from the start of
 * the day, which is why the list stamps the biggest fee with the most hours:
 * a marquee deal is live all day and the scraps are gone by lunchtime. So an
 * offer lapses once that many hours have been used up.
 */
export function hasLapsed(
  offer: Pick<DeadlineOpportunity, 'hours'>,
  elapsedMs: number,
  totalMs: number,
): boolean {
  return WINDOW_HOURS - hoursLeft(elapsedMs, totalMs) >= offer.hours
}

/** Hours left on one offer, floored at zero. */
export function offerHoursLeft(
  offer: Pick<DeadlineOpportunity, 'hours'>,
  elapsedMs: number,
  totalMs: number,
): number {
  const used = WINDOW_HOURS - hoursLeft(elapsedMs, totalMs)
  return Math.max(0, offer.hours - used)
}

/**
 * The countdown, as a clock face.
 *
 * Hours and minutes of the fictional day rather than real seconds, because
 * the fiction is that it is eleven at night and the window shuts at midnight.
 * Showing "4:32" of real time would say out loud that this is a minigame.
 */
export function clockFace(hours: number): string {
  const whole = Math.floor(hours)
  const minutes = Math.floor((hours - whole) * 60)
  return `${whole}:${String(minutes).padStart(2, '0')}`
}

/** Everything the screen needs for one frame. */
export interface ClockFrame {
  hoursLeft: number
  face: string
  /** 0 at the start of the day, 1 when it shuts. */
  progress: number
  shut: boolean
  /** The offers still standing, in the order they were generated. */
  live: DeadlineOpportunity[]
  /** The ones that have gone while you were reading. */
  gone: DeadlineOpportunity[]
  /**
   * Whole hours left on each offer, keyed by player.
   *
   * Computed here rather than by the screen so that the list and the clock
   * can never disagree: both read one frame, taken at one instant. A view
   * that recomputed elapsed time per row would be sampling the clock once per
   * offer, and the last row would be a fraction of a second behind the first.
   */
  remaining: Record<string, number>
}

export function frameAt(
  offers: readonly DeadlineOpportunity[],
  elapsedMs: number,
  totalMs: number,
): ClockFrame {
  const left = hoursLeft(elapsedMs, totalMs)
  const live: DeadlineOpportunity[] = []
  const gone: DeadlineOpportunity[] = []
  const remaining: Record<string, number> = {}

  for (const offer of offers) {
    remaining[offer.playerId] = Math.ceil(offerHoursLeft(offer, elapsedMs, totalMs))
    if (hasLapsed(offer, elapsedMs, totalMs)) gone.push(offer)
    else live.push(offer)
  }

  return {
    hoursLeft: left,
    face: clockFace(left),
    progress: totalMs <= 0 ? 1 : Math.max(0, Math.min(1, elapsedMs / totalMs)),
    shut: left <= 0,
    live,
    gone,
    remaining,
  }
}
