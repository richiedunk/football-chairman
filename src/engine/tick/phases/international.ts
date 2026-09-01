
import {
  INTERNATIONAL_WEEKS, TOURNAMENT_WEEK, callUpsFor, clubsAffected, dutyInjury,
  dutyInjuryChance, dutyTravel, isAwayOnDuty, isTournamentSeason, runTournament, sendOnDuty,
} from '../../systems/international'
import { addInboxItem, addNews } from '../../systems/inbox'
import { phase } from '../context'

/**
 * International football, as a director experiences it.
 *
 * Consequences, not management. You pick nobody. Players leave, some come back
 * hurt, and the good ones come back more expensive.
 *
 * Three phases because it is three separate events at three separate moments,
 * and collapsing them is what broke it the first time: squads were named and
 * the break played in the same tick, so nobody was ever visibly away and the
 * squad list's "Away" chip was dead code. A call-up arrives days ahead of the
 * game, and that gap is the whole feeling — a loss you can see coming and can
 * do nothing about is not the same as one you find out about afterwards.
 */

export const internationalCallUps = phase({
  name: 'internationalCallUps',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    //
    // Consequences, not management. Players leave, some come back hurt, and the
    // good ones come back more expensive. The league plays on regardless, which
    // is not a simplification — a twenty-four club division is forty-six rounds
    // in a thirty-nine week window and has no room to stop.
    //
    // **Squads are named the week before.** The first version called players up
    // and played the week in the same tick, which meant nobody was ever visibly
    // away: the flag was set and consumed before a screen could render it, and
    // the squad list's "Away" chip was dead code. A real call-up arrives days
    // ahead, and that gap is the whole point — the loss is something you see
    // coming and cannot do anything about, which is a different feeling from
    // finding out afterwards.
    if (INTERNATIONAL_WEEKS.includes(week + 1)) {
      const dutyRng = rng.fork(`callup:${state.date.season}:${week}`)
      const callUps = callUpsFor(state, dutyRng)
      for (const { player, tournament } of callUps) sendOnDuty(player, week + 1, tournament)

      if (playerClub) {
        // Keyed by the club that has to pick a side without him, so a player we
        // have borrowed counts as ours and one we have loaned out does not.
        const ours = clubsAffected(callUps).get(playerClub.id) ?? []
        if (ours.length > 0) {
          addInboxItem(state, ids, {
            category: 'player',
            subject: `${ours.length} player${ours.length === 1 ? '' : 's'} away with `
              + `${ours.length === 1 ? 'his' : 'their'} country next week`,
            from: 'Club Secretary',
            body: `${ours.map((p) => p.knownAs).join(', ')} `
              + `${ours.length === 1 ? 'has' : 'have'} been called up and will miss next week. `
              + 'We play on without them, as everybody does.',
            link: { view: 'squad' },
          })
        }
      }
    }
  },
})

export const internationalDuty = phase({
  name: 'internationalDuty',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    // The break itself. They are already out of the side — the selection knows
    // it — so all that happens here is the part nobody chose: somebody else's
    // pitch, somebody else's meaningless friendly, and your player out until
    // March. The oldest grievance in the job.
    if (INTERNATIONAL_WEEKS.includes(week)) {
      const dutyRng = rng.fork(`duty:${state.date.season}:${week}`)
      const tournament = false
      for (const player of Object.values(state.players)) {
        if (!isAwayOnDuty(player, week)) continue
        if (!dutyRng.chance(dutyInjuryChance(state, player))) continue
        const injury = dutyInjury(dutyRng, tournament)
        player.injury = injury
        if (playerClub && (player.loanClubId ?? player.clubId) === playerClub.id) {
          addInboxItem(state, ids, {
            category: 'player',
            subject: `${player.knownAs} is hurt, and not by us`,
            from: 'Physiotherapist',
            body: `${player.knownAs} has come back from international duty injured and is out `
              + `for ${injury.weeksRemaining} week${injury.weeksRemaining === 1 ? '' : 's'}. `
              + (dutyTravel(state, player) === 'intercontinental'
                ? 'Two days of flying each way and a pitch nobody here has seen. '
                : '')
              + 'There is nothing to be done about it and no one to send the bill to.',
            urgent: true,
            link: { view: 'player', id: player.id },
          })
        }
      }
    }
  },
})

export const internationalTournament = phase({
  name: 'internationalTournament',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    // A tournament summer. Nothing else is happening in week fifty, which is the
    // one honest thing about the international calendar: the tournament gets its
    // own space in the year and the qualifiers do not.
    if (week === TOURNAMENT_WEEK && isTournamentSeason(state.date.season)) {
      const results = runTournament(state, rng.fork(`tournament:${state.date.season}`))
      if (playerClub) {
        const ours = results.filter((r) => r.player.clubId === playerClub.id)
        if (ours.length > 0) {
          const best = ours.slice().sort((a, b) => b.boost - a.boost)[0]
          addInboxItem(state, ids, {
            category: 'transfer',
            subject: `${best.player.knownAs} had a tournament`,
            from: 'Head of Recruitment',
            body: `${ours.map((r) => r.player.knownAs).join(', ')} `
              + `${ours.length === 1 ? 'has' : 'have'} come back from the summer with the market `
              + 'looking at them differently. Expect calls. Expect the asking price to be a '
              + 'conversation rather than a number, and remember the interest fades by next '
              + 'summer whether we sell or not.',
            link: { view: 'player', id: best.player.id },
          })
        }
      }
      if (results.length > 0) {
        addNews(state, ids, 'transfer',
          `${results.length} player${results.length === 1 ? '' : 's'} left the tournament worth `
          + 'more than they arrived, and every one of them belongs to somebody who has to decide.')
      }
    }
  },
})
