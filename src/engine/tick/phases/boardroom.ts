
import { processBoard, processCoachRelations } from '../../systems/board'
import { refreshSquadStatuses } from '../../systems/morale'
import { releaseArchitects } from '../../systems/stadium'
import { addInboxItem, addNews } from '../../systems/inbox'
import { expireItems } from '../../systems/inbox'
import { paySeverance } from '../../systems/directorContract'
import { dismissDirector } from '../../systems/jobSearch'
import { phase } from '../context'

/**
 * Judgement, and tidying up after it.
 *
 * The board's weekly assessment is the one that can end a career, and the AI
 * clubs get a cheaper version of the same thing so that their coaches are
 * sacked and their directions change without anybody watching.
 */

export const boardAndCoach = phase({
  name: 'boardAndCoach',
  reads: ['playerClub'],
  writes: ['playerClub'],
  run({ state, ids, rng, facts, sack }) {
    const { playerClub } = facts
    if (playerClub) {
      const boardResult = processBoard(state, playerClub, rng.fork('board'))
      for (const message of boardResult.messages) {
        addInboxItem(state, ids, {
          category: 'board',
          subject: 'Message from the board',
          from: 'Chairman',
          body: message,
          urgent: true,
          link: { view: 'board' },
        })
      }
      if (boardResult.sacked) {
        sack(boardResult.messages[boardResult.messages.length - 1])
        const severance = paySeverance(state, playerClub)
        if (severance > 0) {
          addInboxItem(state, ids, {
            category: 'finance',
            subject: 'Severance settled',
            from: 'Your representative',
            body: `Your contract has been paid up. ${severance.toLocaleString()} has been settled in full.`,
            link: { view: 'career' },
          })
        }
        // And you actually leave. This used to be an announcement: the club
        // stayed yours, so the same board dismissed you again the week after,
        // and the week after that.
        dismissDirector(state, ids, rng.fork('dismissal'))

        // The club stops being his here, and everything after this has to see
        // that — inside this phase as much as outside it. Matchday does the
        // same when a director cannot field a side; this is the other way the
        // job ends mid-week.
        facts.playerClub = null
        return
      }

      const coachResult = processCoachRelations(state, playerClub, ids, rng.fork('coach'))
      for (const message of coachResult.messages) {
        addInboxItem(state, ids, {
          category: 'coach',
          subject: 'From the head coach',
          from: playerClub.headCoachId
            ? state.staff[playerClub.headCoachId]?.knownAs ?? 'Head Coach'
            : 'Head Coach',
          body: message,
          link: { view: 'staff' },
        })
      }
    }
  },
})

export const aiBoard = phase({
  name: 'aiBoard',
  reads: ['allClubs', 'inRotation'],
  run({ state, rng, facts }) {
    const { allClubs, inRotation } = facts
    // Board confidence and coach relations move for AI clubs too, but cheaply —
    // they only need to be roughly right so that AI coaches get sacked and AI
    // clubs change direction.
    for (const club of allClubs) {
      if (club.id === state.playerClubId) continue
      if (!inRotation(club, 4)) continue
      processBoard(state, club, rng.fork(`aiboard:${club.id}`))
    }
  },
})

export const architects = phase({
  name: 'architects',
  run({ state }) {
    releaseArchitects(state)
  },
})

/**
 * Expire what nobody answered, and refresh the squad screen.
 *
 * `expireItems` is the whole inbox and runs whoever you work for. The squad
 * refresh is a club's own business, so it only runs while there is a club:
 * `playerClub` is null from the moment the board's verdict lands above.
 */
export const housekeeping = phase({
  name: 'housekeeping',
  reads: ['playerClub'],
  run({ state, ids, facts }) {
    const { playerClub } = facts
    for (const item of expireItems(state)) {
      addNews(state, ids, item.category, `Auto-resolved: ${item.subject}`, item.link)
    }
    if (playerClub) refreshSquadStatuses(state, playerClub)
  },
})
