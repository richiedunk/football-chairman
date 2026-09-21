import type { useGameStore } from '../stores/game'
import type { PhoneApp } from './apps'

/**
 * What sits on an app's icon.
 *
 * Lifted out of `PhoneView` because the navigation rail needs exactly the same
 * answer, and two places counting the same thing is how they come to disagree.
 * It stays out of `apps.ts`, which is deliberately free of the store: the list
 * of apps is data, and what is pressing is a question about the game.
 *
 * Only ever "this wants something from you". A count that is always there is a
 * count nobody reads, so a squad of twenty-five with nothing wrong shows
 * nothing at all.
 */
export function badgeFor(store: ReturnType<typeof useGameStore>, app: PhoneApp): number {
  switch (app.badge) {
    case 'unread':
      return store.unread
    case 'deadline':
      // Only on the day. The market always has something in it; that is not
      // the same as the market needing you.
      return store.isDeadline ? store.deadlineOffers.length : 0
    case 'milestones':
      return store.newAchievements.length
    case 'registration':
      // Players who cannot be picked, while there is still time to fix it.
      return store.registrationOpen ? (store.registration?.unregistered.length ?? 0) : 0
    default:
      return 0
  }
}
