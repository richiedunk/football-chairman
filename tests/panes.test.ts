import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PANES, PANE_PROMPTS } from '../src/ui/panes'

/**
 * The two-pane screens.
 *
 * A pane is named after the route name of the list it shows, and the shell
 * relies on that in two places: it loads the list from the name, and it uses
 * the name to tell whether the current route *is* the list, so that the
 * conversations are not drawn beside themselves.
 *
 * Both break silently. A pane naming a route that does not exist leaves an
 * empty column on a desktop screen with nothing in the console; a route
 * naming a pane that is not registered quietly falls back to one pane, which
 * looks like the feature simply not being finished. Neither shows up in a
 * typecheck, because both are strings.
 */
const source = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
const routeNames = new Set(
  [...source.matchAll(/name: '([^']+)'/g)].map((m) => m[1]),
)
const panesInRoutes = [...source.matchAll(/pane: '([^']+)'/g)].map((m) => m[1])

describe('the pane registry', () => {
  it('has a route table to test against', () => {
    expect(routeNames.size).toBeGreaterThan(20)
    expect(panesInRoutes.length).toBeGreaterThan(0)
  })

  it('names a real route for every pane it registers', () => {
    for (const pane of Object.keys(PANES)) {
      expect(routeNames.has(pane), `pane '${pane}' is not a route name`).toBe(true)
    }
  })

  it('registers every pane the routes ask for', () => {
    for (const pane of panesInRoutes) {
      expect(Object.keys(PANES), `route asks for pane '${pane}'`).toContain(pane)
    }
  })

  it('tells the reader what the empty side is waiting for', () => {
    for (const pane of Object.keys(PANES)) {
      expect(PANE_PROMPTS[pane], `pane '${pane}' has no prompt`).toBeTruthy()
    }
  })

  it('pairs every list route with at least one detail route', () => {
    // A pane whose only route is the list itself would always render the
    // waiting message and never anything else, which is a column of nothing.
    for (const pane of Object.keys(PANES)) {
      const uses = panesInRoutes.filter((p) => p === pane).length
      expect(uses, `pane '${pane}' is used by only one route`).toBeGreaterThan(1)
    }
  })
})
