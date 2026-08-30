/**
 * Do the links in inbox messages actually go anywhere?
 *
 * Every inbox item and every news story can carry a link, and the UI turns it
 * into a URL by concatenation — `/${view}` or `/${view}/${id}`. Nothing has
 * ever checked that the result matches a route, or that the thing on the other
 * end still exists, and a link that misses lands on the catch-all, which sends
 * you to the title screen. "Start new career" appearing under a message about
 * a contract renewal is the symptom; this is the measurement.
 *
 * Two separate faults are counted, because they need different fixes:
 *   - unroutable: the URL matches no route at all
 *   - dangling:   the URL routes, but the record it names has gone
 */
import { readFileSync } from 'node:fs'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { advanceWeek } from '../src/engine/tick'
import type { GameState, InboxItem, NewsItem } from '../src/engine/types'

// The router's own table, read from source rather than restated here, so this
// cannot drift into agreeing with a copy of the routes that no longer exists.
const routerSource = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
const paths = [...routerSource.matchAll(/path: '([^']+)'/g)].map((m) => m[1])
const patterns = paths
  .filter((p) => !p.includes('pathMatch'))
  .map((p) => ({
    path: p,
    re: new RegExp('^' + p.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/') + '$'),
  }))

console.log(`routes: ${patterns.length}`)

function url(link: { view: string; id?: string }): string {
  return link.id ? `/${link.view}/${link.id}` : `/${link.view}`
}

function routes(u: string): boolean {
  return patterns.some((p) => p.re.test(u))
}

/** Whether the record the link names is still in the world. */
function target(state: GameState, link: { view: string; id?: string }): 'ok' | 'gone' {
  if (!link.id) return 'ok'
  if (link.view === 'player') return state.players[link.id] ? 'ok' : 'gone'
  if (link.view === 'league') return state.leagues[link.id] ? 'ok' : 'gone'
  if (link.view === 'match') {
    return Object.values(state.fixtures).some((f) => f.id === link.id) ? 'ok' : 'gone'
  }
  return 'ok'
}

const SEASONS = 3
const setup = prepareNewGame({
  seed: 'LINK1', directorName: 'T', background: 'scout',
  worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
})
const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)

const seen = new Set<string>()
const byView = new Map<string, { total: number; unroutable: number; dangling: number }>()
const examples: string[] = []

function record(state: GameState, id: string, subject: string, link?: { view: string; id?: string }) {
  if (!link || seen.has(id)) return
  seen.add(id)
  const u = url(link)
  const row = byView.get(link.view) ?? { total: 0, unroutable: 0, dangling: 0 }
  row.total++
  if (!routes(u)) {
    row.unroutable++
    if (examples.length < 12) examples.push(`  UNROUTABLE ${u.padEnd(24)} "${subject}"`)
  } else if (target(state, link) === 'gone') {
    row.dangling++
    if (examples.length < 12) examples.push(`  DANGLING   ${u.padEnd(24)} "${subject}"`)
  }
  byView.set(link.view, row)
}

for (let week = 0; week < SEASONS * 52; week++) {
  advanceWeek(state, { ids: setup.ids, names: setup.names })
  if (state.playerClubId === null) break
  for (const item of state.inbox as InboxItem[]) record(state, item.id, item.subject, item.link)
  for (const item of state.newsFeed as NewsItem[]) record(state, item.id, item.text.slice(0, 44), item.link)
}

// A link is only as good as it is at the moment you tap it, and an inbox item
// sits there for weeks. So every link is re-checked against the world as it
// stands at the end, not only as it stood when the message was written.
let lateDangling = 0
for (const item of state.inbox as InboxItem[]) {
  if (item.link && routes(url(item.link)) && target(state, item.link) === 'gone') lateDangling++
}

console.log(`\nweeks: ${state.date.week} of season ${state.date.season}`)
console.log(`links seen: ${seen.size}\n`)
console.log('view          total  unroutable  dangling')
for (const [view, row] of [...byView].sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `${view.padEnd(14)}${String(row.total).padStart(5)}${String(row.unroutable).padStart(12)}${String(row.dangling).padStart(10)}`,
  )
}
const totals = [...byView.values()].reduce(
  (a, r) => ({ u: a.u + r.unroutable, d: a.d + r.dangling }), { u: 0, d: 0 },
)
console.log(`\nunroutable: ${totals.u}   dangling at write time: ${totals.d}`)
console.log(`still in the inbox now and dangling: ${lateDangling} of ${state.inbox.length}`)
if (examples.length) {
  console.log('\nexamples')
  for (const line of examples) console.log(line)
}
