import { IdFactory, ID_PREFIX } from '../ids'
import type {
  GameState, ID, InboxCategory, InboxDecision, InboxItem, InboxOption, NewsItem,
} from '../types'

/**
 * The inbox.
 *
 * The layered loop's interrupt channel. The squad board is where you work; the
 * inbox is where the world demands answers. Items that require a decision can
 * block the week from advancing, which is what stops "next, next, next" being
 * a viable way to play.
 */

export interface InboxBuilder {
  category: InboxCategory
  subject: string
  from: string
  body: string
  urgent?: boolean
  link?: { view: string; id?: ID } | null
  decision?: {
    prompt: string
    options: InboxOption[]
    defaultOptionId: string
  }
  expiresInWeeks?: number
  payload?: Record<string, string | number> | null
}

export function addInboxItem(
  state: GameState,
  ids: IdFactory,
  builder: InboxBuilder,
): InboxItem {
  const decision: InboxDecision | null = builder.decision
    ? {
        prompt: builder.decision.prompt,
        options: builder.decision.options,
        chosenId: null,
        defaultOptionId: builder.decision.defaultOptionId,
        outcomeText: null,
      }
    : null

  const item: InboxItem = {
    id: ids.next(ID_PREFIX.inbox),
    season: state.date.season,
    week: state.date.week,
    category: builder.category,
    subject: builder.subject,
    from: builder.from,
    body: builder.body,
    read: false,
    urgent: builder.urgent ?? false,
    decision,
    link: builder.link ?? null,
    expiresWeek: builder.expiresInWeeks ? state.date.week + builder.expiresInWeeks : null,
    payload: builder.payload ?? null,
  }

  state.inbox.unshift(item)
  // The inbox is a working surface, not an archive. Old resolved items are
  // dropped so the list stays navigable on a phone.
  if (state.inbox.length > 150) {
    state.inbox = state.inbox
      .filter((i) => !i.read || i.decision?.chosenId === null)
      .slice(0, 150)
  }
  return item
}

export function addNews(
  state: GameState,
  ids: IdFactory,
  category: InboxCategory,
  text: string,
  link: { view: string; id?: ID } | null = null,
  /** The club the item concerns, if any. Its division files the item. */
  clubId?: ID,
): NewsItem {
  const item: NewsItem = {
    id: ids.next(ID_PREFIX.news),
    season: state.date.season,
    week: state.date.week,
    category,
    text,
    link,
    leagueId: clubId ? state.clubs[clubId]?.leagueId : undefined,
  }
  state.newsFeed.unshift(item)
  if (state.newsFeed.length > 250) state.newsFeed.length = 250
  return item
}

/** Convenience for the common two-option decision. */
export function yesNo(
  yesLabel: string,
  yesHint: string,
  noLabel: string,
  noHint: string,
): InboxOption[] {
  return [
    { id: 'yes', label: yesLabel, hint: yesHint, available: true },
    { id: 'no', label: noLabel, hint: noHint, available: true },
  ]
}

/** Items still awaiting a decision, which block the week from advancing. */
export function blockingItems(state: GameState): InboxItem[] {
  return state.inbox.filter((i) => i.urgent && i.decision && i.decision.chosenId === null)
}

export function unreadCount(state: GameState): number {
  return state.inbox.filter((i) => !i.read).length
}

export function pendingDecisionCount(state: GameState): number {
  return state.inbox.filter((i) => i.decision && i.decision.chosenId === null).length
}

/**
 * Resolve items whose deadline has passed by applying their default option.
 * Returns the items that auto-resolved, so the player is told what happened
 * rather than discovering it later.
 */
export function expireItems(state: GameState): InboxItem[] {
  const expired: InboxItem[] = []
  for (const item of state.inbox) {
    if (!item.decision || item.decision.chosenId !== null) continue
    if (item.expiresWeek === null || state.date.week < item.expiresWeek) continue
    item.decision.chosenId = item.decision.defaultOptionId
    item.decision.outcomeText = 'No response was given in time, so the matter resolved itself.'
    expired.push(item)
  }
  return expired
}

export const CATEGORY_LABELS: Record<InboxCategory, string> = {
  board: 'Board',
  coach: 'Head Coach',
  player: 'Players',
  transfer: 'Transfers',
  scouting: 'Scouting',
  media: 'Media',
  finance: 'Finance',
  facilities: 'Facilities',
  academy: 'Academy',
  match: 'Matches',
  league: 'League',
}

