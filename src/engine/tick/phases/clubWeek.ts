
import { IdFactory } from '../../ids'
import { processInjuries } from '../../systems/injuries'
import { processMorale } from '../../systems/morale'
import { updateFanMood } from '../../systems/board'
import { developPlayer } from '../../systems/development'
import { processFinances } from '../../systems/finance'
import { progressProjects } from '../../systems/facilities'
import { decayStadium, maintainStadium, progressStadiumWork } from '../../systems/stadium'
import { canFieldEleven, warnHuman } from '../../systems/matchday'
import { addInboxItem, addNews } from '../../systems/inbox'
import { payDirectorSalary } from '../../systems/directorContract'
import { phase } from '../context'
import type { Club, GameState, ID, Player } from '../../types'

/**
 * A week at every club in the world.
 *
 * Wages leave, the ground wears out, players get hurt and get better. Most of
 * it runs for the whole world, because a world where only your players improve
 * has a broken transfer market inside two years.
 *
 * The staggering is deliberate and is the reason a tick fits in a phone's
 * frame budget. Anything the player can see happens every week; everything
 * else is spread across a rotation, at proportionally heavier weight, so the
 * totals over a season match what running it weekly would have produced. The
 * rotation is a declared fact so that every pass which uses it agrees on
 * whose turn it is — three passes computing their own would drift apart, and
 * a club could be due for morale but not for development in the same week for
 * no reason anybody intended.
 */

export const worldRotation = phase({
  name: 'worldRotation',
  writes: ['allClubs', 'inRotation'],
  run({ state, week, facts }) {
    // Several passes below run over the whole world. Everything the player can
    // see happens every week; everything they cannot is staggered across a
    // rotation, which keeps the tick responsive on a phone without the world
    // visibly freezing in place. `clubIndex` gives each club a stable slot.
    const allClubs = Object.values(state.clubs)
    const clubIndex = new Map<ID, number>()
    allClubs.forEach((club, index) => clubIndex.set(club.id, index))
    facts.allClubs = allClubs
    facts.inRotation = (club: Club, period: number): boolean =>
      club.id === state.playerClubId || (clubIndex.get(club.id) ?? 0) % period === week % period
  },
})

export const clubWeek = phase({
  name: 'clubWeek',
  reads: ['allClubs', 'playedClubs', 'gateReceipts'],
  run({ state, ids, rng, facts }) {
    const { allClubs, playedClubs, gateReceipts } = facts
    for (const club of allClubs) {
      const played = playedClubs.has(club.id)
      const clubRng = rng.fork(club.id)

      updateFanMood(state, club)
      // The director is on the payroll like everyone else, so his salary leaves
      // the same balance he is judged on.
      if (club.id === state.playerClubId) payDirectorSalary(state, club)
      const { newInjuries } = processInjuries(state, club, clubRng, played)
      processFinances(state, club, clubRng, gateReceipts.has(club.id)
        ? { attendance: gateReceipts.get(club.id) ?? 0 }
        : null)
      progressProjects(club)

      // The ground wears out whether or not anyone is looking at it, and the
      // safety officer starts closing places long before it falls down.
      const wear = decayStadium(state, club, clubRng)
      const building = progressStadiumWork(state, club, clubRng)

      // A club with nobody in the chair still looks after its own ground.
      // Until this existed nothing in the world ever repaired a stand, so
      // every stadium bar the player's slowly closed itself down — see
      // `maintainStadium`, which is the largest single thing that was missing.
      if (club.id !== state.playerClubId) maintainStadium(state, club, ids, clubRng)

      if (club.id === state.playerClubId) {
        reportInjuries(state, ids, newInjuries)
        for (const closure of wear.closures) {
          addInboxItem(state, ids, {
            category: 'facilities',
            subject: 'Safety notice served',
            from: 'Safety Officer',
            body: closure,
            urgent: true,
            link: { view: 'stadium' },
          })
        }
        for (const warning of wear.warnings) {
          addNews(state, ids, 'facilities', warning, { view: 'stadium' })
        }
        for (const notice of building.notices) {
          addInboxItem(state, ids, {
            category: 'facilities',
            subject: building.completed ? 'Building work complete' : 'Update from the architects',
            from: club.facilities.stadiumProject?.architectFirm ?? 'Project Office',
            body: notice,
            link: { view: 'stadium' },
          })
        }
      }
    }
  },
})

export const development = phase({
  name: 'development',
  reads: ['inRotation'],
  run({ state, ids, rng, week, facts }) {
    const { inRotation } = facts
    // Development runs for every player in the world, because a world where only
    // your players improve would have a broken transfer market within two years.
    const devRng = rng.fork('development')
    for (const player of Object.values(state.players)) {
      if (!player.clubId) continue
      const club = state.clubs[player.clubId]
      // Development for other clubs is applied fortnightly at double weight —
      // identical over a season, half the work.
      if (!club || !inRotation(club, 2)) continue
      const note = developPlayer(state, player, { rng: devRng, week })
      if (note && player.clubId === state.playerClubId) {
        addNews(state, ids, 'player', note, { view: 'player', id: player.id })
      }
    }
  },
})

/**
 * Said as early as it is true, and repeated every week it stays true.
 *
 * By match day it is a dismissal rather than a warning, and a director sacked
 * for something nobody ever told him is a bug rather than a consequence.
 */
export const squadWarning = phase({
  name: 'squadWarning',
  reads: ['playerClub'],
  run({ state, ids, week, facts }) {
    const { playerClub } = facts
    //
    // Said as early as it is true, and repeated every week it stays true. By
    // match day it is a dismissal rather than a warning, and a director sacked
    // for something nobody ever told him is a bug rather than a consequence.
    if (playerClub) {
      const nextFixture = state.fixtures.find(
        (f) => f.season === state.date.season && f.week > week && !f.result
          && (f.homeClubId === playerClub.id || f.awayClubId === playerClub.id),
      )
      // Checked against the week the match is played, not this one: a squad that
      // is whole today and loses three men to a break next Tuesday is already in
      // trouble, and that is precisely when it can still be fixed.
      const matchWeek = nextFixture?.week ?? week + 1
      if (!canFieldEleven(state, playerClub, matchWeek)) {
        warnHuman(state, playerClub, ids, matchWeek, nextFixture ? nextFixture.week - week : null)
      }
    }
  },
})

export const morale = phase({
  name: 'morale',
  reads: ['allClubs', 'inRotation'],
  run({ state, ids, rng, facts }) {
    const { allClubs, inRotation } = facts
    for (const club of allClubs) {
      // Squad harmony at clubs the player never looks at only needs to be
      // roughly right, so it is refreshed monthly rather than weekly.
      if (!inRotation(club, 4)) continue
      const grievances = processMorale(state, club, rng.fork(`morale:${club.id}`))
      if (club.id === state.playerClubId) {
        for (const grievance of grievances) {
          addInboxItem(state, ids, {
            category: 'player',
            subject: `${grievance.player.knownAs} — ${grievance.severity === 'high' ? 'serious concern' : 'unhappy'}`,
            from: 'Player Liaison',
            body: grievance.reason,
            urgent: grievance.severity === 'high',
            link: { view: 'player', id: grievance.player.id },
          })
        }
      }
    }
  },
})

function reportInjuries(
  state: GameState,
  ids: IdFactory,
  injured: Player[],
): void {
  for (const player of injured) {
    if (!player.injury) continue
    const weeks = player.injury.weeksRemaining
    addInboxItem(state, ids, {
      category: 'player',
      subject: `${player.knownAs} injured`,
      from: 'Medical Department',
      body: `${player.knownAs} has picked up a ${player.injury.type.toLowerCase()} and will be unavailable for around ${weeks} week${weeks === 1 ? '' : 's'}.`,
      urgent: weeks >= 8,
      link: { view: 'player', id: player.id },
    })
  }
}
