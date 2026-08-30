import type { Router } from 'vue-router'

/**
 * Following a link out of a message.
 *
 * Inbox items and news stories carry a `{ view, id }` rather than a URL, and
 * the UI used to turn one into the other by concatenation in two different
 * places. That works until a link carries an id the destination has no
 * parameter for — a media story was written as `{ view: 'media', id }` when
 * `/media` takes no id — and then the URL matches nothing, the catch-all
 * fires, and the reader is somewhere they did not ask to be.
 *
 * Fixing the writer is not enough, because the messages are saved. A career
 * that is a season old has fifty of the old links sitting in its inbox and
 * they will still be there after the fix. So the repair belongs at the point
 * of use: try the link as written, fall back to the bare screen, and only give
 * up when neither exists.
 */
export interface MessageLink {
  view: string
  id?: string
}

/** The best URL this link resolves to, or null if it names nothing real. */
export function resolveLink(router: Router, link: MessageLink): string | null {
  const candidates = link.id ? [`/${link.view}/${link.id}`, `/${link.view}`] : [`/${link.view}`]
  for (const path of candidates) {
    if (router.resolve(path).name !== 'not-found') return path
  }
  return null
}

/** Follow a link. Returns false when there was nowhere to go. */
export function followLink(router: Router, link: MessageLink): boolean {
  const path = resolveLink(router, link)
  if (!path) return false
  void router.push(path)
  return true
}
