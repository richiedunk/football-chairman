import type { Component } from 'vue'

/**
 * The two-pane screens.
 *
 * On a phone a list and the thing you tapped are two screens, and you travel
 * between them. On a monitor that travel is the wrong answer twice over: it
 * wastes two thirds of the width, and it throws away the context — which
 * conversation this reply belongs to, which squad this player is being judged
 * against — that the width was there to keep.
 *
 * So a route can name a *pane*: the list that stays on the left while the
 * right-hand side changes. The name is the route name of the list itself,
 * which is what keeps the two from drifting apart — a pane that named
 * something else would be a second place to decide which list this is.
 *
 * Deliberately a short list. Only screens with a real list-and-detail shape
 * belong here; the boardroom and the finances are single pages and a pane
 * beside them would be furniture.
 */
export const PANES: Record<string, () => Promise<Component>> = {
  inbox: () => import('./views/ThreadsView.vue').then((m) => m.default),
  squad: () => import('./views/SquadView.vue').then((m) => m.default),
}

export function paneLoader(name: string | undefined): (() => Promise<Component>) | null {
  if (!name) return null
  return PANES[name] ?? null
}

/** What the empty right-hand side says, per pane. */
export const PANE_PROMPTS: Record<string, string> = {
  inbox: 'Pick a conversation.',
  squad: 'Pick a player.',
}
