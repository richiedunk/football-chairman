
import { phaseForWeek, SEASON_WEEKS } from '../../sim/schedule'
import { produceIntake, INTAKE_WEEK } from '../../systems/academy'
import { addInboxItem } from '../../systems/inbox'
import { contact, phrase } from '../../systems/voice'
import { runSeasonRollover } from '../../season'
import { playerClub as clubInCharge } from '../../playerClub'
import { IdFactory } from '../../ids'
import { NameGenerator } from '../../names/generator'
import { Rng } from '../../rng'
import { phase } from '../context'
import type { GameState, SeasonPhase } from '../../types'

/**
 * The year, and where in it we are.
 *
 * Two phases that bracket every other one: the week opens by working out what
 * part of the season this is and who the director works for, and closes by
 * moving the clock — which is the only place a season can end.
 */

/**
 * Establish the two things every later phase asks about.
 *
 * `playerClub` is a fact rather than a lookup because it can change during the
 * week: a director who cannot field a side is sacked before kick-off. Deriving
 * it once, here, and letting the phase that ends his employment overwrite it is
 * what makes that visible — it used to be three separate lookups at three points
 * in the procedure with nothing explaining why they might disagree.
 */
export const openTheWeek = phase({
  name: 'openTheWeek',
  writes: ['playerClub'],
  run({ state, week, facts }) {
    state.phase = phaseForWeek(week) as SeasonPhase
    facts.playerClub = clubInCharge(state)
  },
})

export const academyIntake = phase({
  name: 'academyIntake',
  run({ state, ids, names, rng, week }) {
    if (week === INTAKE_WEEK) {
      runAcademyIntake(state, ids, names, rng)
    }
  },
})

/**
 * Move the clock, and roll the season over if the week that just finished was
 * the last one.
 *
 * Always last. Everything above ran against the week we were in; anything that
 * ran after this would silently be operating on the next one.
 */
export const seasonClock = phase({
  name: 'seasonClock',
  run({ state, ids, names, rng, endSeason }) {
    state.date.week += 1
    if (state.date.week > SEASON_WEEKS) {
      runSeasonRollover(state, { ids, names, rng: rng.fork('rollover') })
      endSeason()
    }
    state.phase = phaseForWeek(state.date.week) as SeasonPhase
    state.savedAt = Date.now()
    state.nextId = ids.value
  },
})

function runAcademyIntake(
  state: GameState,
  ids: IdFactory,
  names: NameGenerator,
  rng: Rng,
): void {
  for (const club of Object.values(state.clubs)) {
    const ctx = { rng: rng.fork(`intake:${club.id}`), ids, names, season: state.date.season }
    const { summary } = produceIntake(state, club, ctx)
    if (club.id === state.playerClubId) {
      const director = club.staff
        .map((id) => state.staff[id])
        .find((member) => member?.role === 'academyDirector')
      addInboxItem(state, ids, {
        category: 'academy',
        subject: 'Youth intake',
        from: contact(director?.knownAs, 'Academy'),
        // The summary is his, so he hands it over rather than having it
        // appear. Keeps the numbers exactly as the system produced them.
        body: `${phrase(`intake:${club.id}:${state.date.season}`, [
          `This year's intake is in.`,
          `Right — the new lads have arrived.`,
          `Intake done for the year.`,
          `We've taken this year's group on.`,
        ])} ${summary}`,
        link: { view: 'academy' },
      })
    }
  }
}
