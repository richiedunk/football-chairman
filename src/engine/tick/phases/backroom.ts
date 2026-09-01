
import { modelDue, pruneFindings, runModel } from '../../systems/dataDepartment'
import { processContracts } from '../../systems/contracts'
import { addInboxItem } from '../../systems/inbox'
import { phase } from '../context'

/**
 * The departments that only ever report to you.
 *
 * Neither runs for the rest of the world: nobody is simulating another club's
 * recruitment analytics, and an AI club's contract renewals are handled where
 * its squad is managed. Both are on a cadence rather than weekly, because a
 * model is consulted rather than watched and sweeping every player in the
 * world every week would cost more than the rest of the tick put together.
 */

export const dataDepartment = phase({
  name: 'dataDepartment',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    //
    // Re-run on a cadence rather than every week, because a model is consulted
    // rather than watched, and because sweeping the world's players every week
    // would cost more than the rest of the tick.
    if (playerClub) {
      state.dataFindings = pruneFindings(state, playerClub)
      if (modelDue(state)) {
        const before = state.dataFindings.length
        state.dataFindings = runModel(state, playerClub, rng.fork(`data:${week}`))
        const level = playerClub.facilities.dataDepartment
        const best = state.dataFindings[0]
        if (best && (state.dataFindings.length > before || week === 1)) {
          const player = state.players[best.playerId]
          addInboxItem(state, ids, {
            category: 'scouting',
            subject: `The model has ${state.dataFindings.length} name${state.dataFindings.length === 1 ? '' : 's'}`,
            from: 'Data Department',
            body: player
              ? `This run puts ${player.knownAs} at the top: valued at `
                + `${best.marketValue.toLocaleString()}, and the model has him at `
                + `${best.modelValue.toLocaleString()}. ${best.rationale} `
                + `Confidence ${Math.round(best.confidence * 100)}%`
                + (level < 8
                  ? ' — which is as much as a department this size can honestly claim.'
                  : '.')
              : 'The list has been refreshed.',
            link: { view: 'data' },
          })
        }
      }
    }
  },
})

export const contracts = phase({
  name: 'contracts',
  reads: ['playerClub'],
  run({ state, ids, rng, facts }) {
    const { playerClub } = facts
    if (playerClub) {
      const alerts = processContracts(state, playerClub, rng.fork('contracts'))
      for (const alert of alerts) {
        addInboxItem(state, ids, {
          category: 'player',
          subject: `Contract: ${alert.player.knownAs}`,
          from: 'Club Secretary',
          body: alert.message,
          urgent: alert.urgent,
          link: { view: 'player', id: alert.player.id },
        })
      }
    }
  },
})
