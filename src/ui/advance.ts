/**
 * What the advance button says, and whether it advances at all.
 *
 * Weeks are an engine detail. "Advance to Week 23" leaks it — nobody wants
 * week 23, they want the Chelsea game — and a bare "Advance" hides what is
 * about to be set off, which matters in a game with weeks that are dangerous
 * to step through.
 *
 * So the button takes two lines: a verb phrase naming the next real event, and
 * a mono line carrying what the week actually holds. It stays in one place and
 * keeps one shape, because a control that disappears when it matters teaches
 * people to distrust it.
 *
 * Pure, and deliberately given plain data rather than the store, so the
 * wording can be tested without mounting anything.
 */

import type { SeasonPhase } from '../engine/types'

export type AdvanceKind = 'blocked' | 'deadline' | 'seasonStart' | 'match' | 'week'

export interface AdvanceIntent {
  kind: AdvanceKind
  /** The verb phrase. Names an event, never a week number. */
  label: string
  /** The mono second line: what this week actually contains. */
  detail: string
  tone: 'accent' | 'warn' | 'danger'
  /**
   * Where the tap goes when it should not advance. Null means advance.
   * The button never becomes inert — a disabled primary action on the one
   * screen the player lives on is a dead end.
   */
  route: string | null
}

export interface AdvanceContext {
  /** Decisions that expire if ignored. These, and only these, block. */
  blockers: number
  isDeadlineWeek: boolean
  openDeadlineOffers: number
  phase: SeasonPhase
  nextFixture: {
    /** Weeks away. 0 is this week. */
    inWeeks: number
    opponent: string
    isHome: boolean
    competition: string
  } | null
  /**
   * Squad availability, for the line under a match. Both are states a player
   * is actually in: injured or suspended. An earlier version reported
   * "doubtful" from match sharpness, which is not a fitness doubt at all — it
   * is how long since someone played — and it declared half the squad a doubt
   * in September.
   */
  out: number
  suspended: number
}

const PHASE_DETAIL: Record<SeasonPhase, string> = {
  preseason: 'PRE-SEASON',
  earlySeason: 'NO FIXTURE',
  autumn: 'NO FIXTURE',
  winterWindow: 'WINTER WINDOW',
  runIn: 'NO FIXTURE',
  endOfSeason: 'SEASON OVER',
  summerWindow: 'SUMMER WINDOW',
}

function joined(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(' · ')
}

function availability(out: number, suspended: number): string | null {
  const bits: string[] = []
  if (out) bits.push(`${out} OUT`)
  if (suspended) bits.push(`${suspended} SUSP`)
  return bits.length ? bits.join(' ') : null
}

export function advanceIntent(ctx: AdvanceContext): AdvanceIntent {
  // 1. Anything that expires if ignored comes first. The button keeps its
  //    place and its shape but opens the blocker rather than stepping over it.
  //    It never blocks merely to make something be read: that is how a game
  //    teaches you to tap through without looking.
  if (ctx.blockers > 0) {
    return {
      kind: 'blocked',
      label: ctx.blockers === 1 ? 'One thing needs you first' : `${ctx.blockers} things need you first`,
      detail: 'THEY LAPSE IF YOU MOVE ON',
      tone: 'warn',
      route: '/inbox',
    }
  }

  // 2. Deadline day. The one week where stepping forward cannot be undone, so
  //    it is the one week the button changes character — but it still steps
  //    forward. An earlier version sent the tap to the deadline screen
  //    instead, which meant the only control that moves the clock stopped
  //    moving it: you went to the offers, came back, and the button sent you
  //    straight there again. The day is not the thing that expires; the offers
  //    on it are, and those reach the player as their own items.
  if (ctx.isDeadlineWeek) {
    return {
      kind: 'deadline',
      label: 'Deadline day',
      detail: ctx.openDeadlineOffers
        ? `${ctx.openDeadlineOffers} OFFER${ctx.openDeadlineOffers === 1 ? '' : 'S'} OPEN · WINDOW CLOSES`
        : 'WINDOW CLOSES TONIGHT',
      tone: 'danger',
      route: null,
    }
  }

  // 3. Named moments get named. The first competitive week of a season is a
  //    thing that happens to you, not a week number.
  if (ctx.phase === 'preseason' && ctx.nextFixture && ctx.nextFixture.inWeeks <= 1) {
    return {
      kind: 'seasonStart',
      label: 'Start the season',
      detail: joined([
        ctx.nextFixture.isHome ? 'HOME' : 'AWAY',
        ctx.nextFixture.opponent.toUpperCase(),
      ]),
      tone: 'accent',
      route: null,
    }
  }

  // 4. The ordinary week: name the opponent, because that is the event.
  if (ctx.nextFixture && ctx.nextFixture.inWeeks <= 1) {
    const f = ctx.nextFixture
    return {
      kind: 'match',
      label: `Advance to ${f.opponent}`,
      detail: joined([
        f.isHome ? 'HOME' : 'AWAY',
        f.competition.toUpperCase(),
        availability(ctx.out, ctx.suspended),
      ]),
      tone: 'accent',
      route: null,
    }
  }

  // 5. A blank week. The subtitle carries whatever it actually is, so the
  //    button never lies about an empty one.
  const upcoming =
    ctx.nextFixture && ctx.nextFixture.inWeeks > 1
      ? `${ctx.nextFixture.opponent.toUpperCase()} IN ${ctx.nextFixture.inWeeks} WEEKS`
      : null
  return {
    kind: 'week',
    label: 'Advance a week',
    detail: joined([PHASE_DETAIL[ctx.phase], upcoming]) || 'NO FIXTURE',
    tone: 'accent',
    route: null,
  }
}
