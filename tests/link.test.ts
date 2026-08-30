import { describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'node:fs'
import { resolveLink } from '../src/ui/link'
import { SCREEN_LABELS } from '../src/ui/screens'

/**
 * Links in messages.
 *
 * A message carries `{ view, id }` and the UI makes a URL out of it. When the
 * two disagree — an id on a screen that takes none, a screen that does not
 * exist — the URL matches nothing, the catch-all fires, and the reader is
 * dumped somewhere they did not ask to be. That happened for a whole release
 * with media stories, so it is worth a test rather than a fix.
 */

// The real route table, minus the lazy component imports, which a test does
// not need and cannot resolve headlessly.
const source = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
const paths = [...source.matchAll(/path: '([^']+)'/g)].map((m) => m[1])

const router = createRouter({
  history: createMemoryHistory(),
  routes: paths.map((path) => ({
    path,
    name: path.includes('pathMatch') ? 'not-found' : path,
    component: { template: '<div/>' },
  })),
})

/** Every screen a message is allowed to name. */
const views = Object.keys(SCREEN_LABELS)

/** The two that are meaningless without a subject. */
const needsId = new Set(['player', 'match'])

describe('message links', () => {
  it('has a route table to test against', () => {
    expect(paths.length).toBeGreaterThan(20)
    expect(paths.some((p) => p.includes('pathMatch')), 'no catch-all found').toBe(true)
  })

  it('resolves every screen a message can name', () => {
    for (const view of views) {
      const link = needsId.has(view) ? { view, id: 'x1' } : { view }
      expect(resolveLink(router, link), `${view} goes nowhere`).not.toBeNull()
    }
  })

  it('refuses a subject screen with no subject', () => {
    // Better nowhere than a profile page for nobody: the button is hidden.
    for (const view of needsId) expect(resolveLink(router, { view })).toBeNull()
  })

  it('falls back to the screen when a link carries an id it cannot take', () => {
    // The exact shape of the bug: media stories were written with the story id
    // on a route that takes no parameter. Old saves still hold these.
    expect(resolveLink(router, { view: 'media', id: 'nws_12' })).toBe('/media')
    expect(resolveLink(router, { view: 'board', id: 'req_3' })).toBe('/board')
  })

  it('keeps the id where the screen does take one', () => {
    expect(resolveLink(router, { view: 'player', id: 'plr_9' })).toBe('/player/plr_9')
    expect(resolveLink(router, { view: 'match', id: 'fix_4' })).toBe('/match/fix_4')
  })

  it('gives up rather than landing on the catch-all', () => {
    expect(resolveLink(router, { view: 'dressingRoom' })).toBeNull()
    expect(resolveLink(router, { view: 'nowhere', id: 'x' })).toBeNull()
  })

  it('names a screen for every route the game links to', () => {
    // A view with no label reads as "Open transfers" rather than "Open
    // Transfers", which is how the media link was missed in the first place.
    for (const view of views) expect(SCREEN_LABELS[view]).toBeTruthy()
  })
})
