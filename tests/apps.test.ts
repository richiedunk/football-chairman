import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PHONE_APPS } from '../src/ui/apps'
import { SCREEN_LABELS } from '../src/ui/screens'

/**
 * The home screen.
 *
 * Every app on it has to go somewhere real. An icon that leads nowhere is
 * worse than a missing one: the reader taps it, lands on the catch-all, and
 * learns not to trust the screen.
 */
const source = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
const paths = new Set([...source.matchAll(/path: '([^']+)'/g)].map((m) => m[1]))

describe('the apps on the phone', () => {
  it('has a route table to test against', () => {
    expect(paths.size).toBeGreaterThan(20)
  })

  it('sends every icon somewhere that exists', () => {
    for (const app of PHONE_APPS) {
      expect(paths.has(app.to), `${app.label} points at ${app.to}, which is not a route`).toBe(true)
    }
  })

  it('uses no id twice', () => {
    const ids = PHONE_APPS.map((a) => a.id)
    expect(new Set(ids).size, 'two apps share an id').toBe(ids.length)
  })

  it('sends no two icons to the same place', () => {
    const routes = PHONE_APPS.map((a) => a.to)
    expect(new Set(routes).size, 'two icons lead to the same screen').toBe(routes.length)
  })

  it('names every app, and draws every one', () => {
    for (const app of PHONE_APPS) {
      expect(app.label, `${app.id} has no label`).toBeTruthy()
      expect(app.d, `${app.id} has no icon`).toBeTruthy()
    }
  })

  it('reaches the screens a player would look for', () => {
    // The point of the grid is that these stopped being drill-downs. If one
    // falls off the home screen it goes back to being three taps deep.
    for (const id of ['inbox', 'squad', 'transfers', 'league', 'finance', 'board', 'media', 'academy']) {
      expect(PHONE_APPS.some((a) => a.id === id), `${id} is not on the home screen`).toBe(true)
    }
  })

  it('labels each app with something the rest of the game would recognise', () => {
    // Not necessarily the same word — "Table" is a better icon label than
    // "League table" — but every destination should be a screen the game
    // already names, so a link and an icon cannot disagree about where they go.
    for (const app of PHONE_APPS) {
      expect(SCREEN_LABELS[app.id], `${app.id} is not a named screen`).toBeTruthy()
    }
  })
})
