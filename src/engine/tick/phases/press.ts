
import { checkForExposure, generateOrganicStories } from '../../systems/media'
import { gotAwayStory, reportOnesThatGotAway } from '../../systems/oneThatGotAway'
import { addInboxItem } from '../../systems/inbox'
import { phrase } from '../../systems/voice'
import { phase } from '../context'
import type { GameState, ID } from '../../types'

/**
 * The press.
 *
 * One phase rather than two, and deliberately so: the organic stories and the
 * ones that got away draw from the same random stream, in that order. Forking
 * a stream costs a draw from its parent, so splitting them into two phases
 * that each forked `media` would not give them the same numbers back — it
 * would quietly reshuffle every remaining roll of the week. They share a
 * stream, so they share a phase, and the coupling is written down instead of
 * being a property of where the lines happen to sit.
 */

export const press = phase({
  name: 'press',
  reads: ['playerClub'],
  run({ state, ids, rng, week, facts }) {
    const { playerClub } = facts
    //
    // Checked on a cadence, because this is a story the press finds when a boy
    // does something rather than a database the club audits every Monday. It is
    // the only moment where being wrong about a sixteen-year-old costs anything
    // a director can feel, and it arrives years after the decision, from
    // somebody else's ground.
    const mediaCtx = { rng: rng.fork('media'), ids }
    if (playerClub && week % 6 === 3) {
      const gotAway = reportOnesThatGotAway(state, playerClub, { ids, rng: rng.fork('gotaway') })
      for (const { player, sting } of gotAway) {
        const story = gotAwayStory(state, playerClub, player, sting, ids, mediaCtx.rng)
        if (!story) continue
        state.mediaStories.push(story)
        addInboxItem(state, ids, {
          category: 'media',
          subject: story.headline,
          // The press officer forwarding a cutting, not the paper texting you.
          // A newspaper is something you read, which is what the media screen
          // is for; this is the man whose job is making sure you have seen it.
          from: 'Press Officer',
          body: forwarded(state, story.outletId, story.headline, story.body),
          link: { view: 'media' },
        })
      }
    }

    const stories = generateOrganicStories(state, mediaCtx)
    for (const story of stories) {
      addInboxItem(state, ids, {
        category: 'media',
        subject: story.headline,
        from: 'Press Officer',
        body: forwarded(state, story.outletId, story.headline, story.body),
        // No id: the media screen is not addressable by story, and a link to
        // a route that does not exist falls through to the catch-all.
        link: { view: 'media' },
      })
    }
    for (const notice of checkForExposure(state, mediaCtx)) {
      addInboxItem(state, ids, {
        category: 'media',
        subject: 'Your briefing has been exposed',
        from: 'Communications',
        body: notice,
        urgent: true,
        link: { view: 'media' },
      })
    }
  },
})

/**
 * A story as the press officer passes it on.
 *
 * Newspapers were arriving in the inbox as if the paper had texted you, which
 * puts a thing you read into the channel for people who want an answer. The
 * story itself belongs on the media screen, set in its own outlet's voice;
 * this is the colleague making sure you have seen it before somebody asks you
 * about it.
 */
function forwarded(state: GameState, outletId: ID, headline: string, body: string): string {
  const outlet = state.outlets[outletId]?.name ?? 'The press'
  const opener = phrase(`forward:${outletId}:${headline}`, [
    `${outlet} have run this:`,
    `Seen this in ${outlet}?`,
    `${outlet}, this morning:`,
    `Worth a look — ${outlet} are running this:`,
    `${outlet} again. You will want to see this before anyone asks you about it:`,
    `Heads up. ${outlet} have this:`,
    `This is in ${outlet} today:`,
    `Flagging this from ${outlet}:`,
  ])
  return `${opener}\n\n"${headline}"\n\n${body}`
}
