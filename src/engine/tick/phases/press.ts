
import { checkForExposure, generateOrganicStories } from '../../systems/media'
import { gotAwayStory, reportOnesThatGotAway } from '../../systems/oneThatGotAway'
import { addInboxItem } from '../../systems/inbox'
import { phase } from '../context'

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
          from: state.outlets[story.outletId]?.name ?? 'The press',
          body: story.body,
          link: { view: 'media' },
        })
      }
    }

    const stories = generateOrganicStories(state, mediaCtx)
    for (const story of stories) {
      addInboxItem(state, ids, {
        category: 'media',
        subject: story.headline,
        from: state.outlets[story.outletId]?.name ?? 'The press',
        body: story.body,
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
