/**
 * Prove the Career card in a browser.
 *
 * The walkthrough in `e2e.mjs` stops at week 30, so it never crosses a season
 * roll and never sees a player with a season behind him — the Career card is
 * invisible for the whole of it, correctly, and "absent" is all that run can
 * establish. Career records are written at the roll, so the only way to see the
 * card populated is to play a season.
 *
 * That is a minute of wall clock, which is why it is a script of its own rather
 * than another step in a suite that is run on every change. What it checks:
 * the read path from the screen (`store.careerHistory` → the save's history
 * part) returns rows, and the table renders them.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/careershot.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import { chromium } from 'playwright'

const SHOT = process.env.SHOT ?? `${os.tmpdir()}/dof-career-shots`
fs.mkdirSync(SHOT, { recursive: true })
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
)
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

const readNotice = async () => {
  for (let i = 0; i < 8 && (await page.locator('.notice').count()); i++) {
    await page.click('.notice .advance')
    await page.waitForTimeout(150)
  }
}

const tap = async (target) => {
  const locator = typeof target === 'string' ? page.locator(target) : target
  for (let attempt = 0; attempt < 4; attempt++) {
    await readNotice()
    try {
      await locator.click({ timeout: 6000 })
      return
    } catch (err) {
      if (!(await page.locator('.notice').count())) throw err
    }
  }
  throw new Error('a notice would not clear')
}

/** Match reports are a screen that has to be dismissed, not a toast. */
async function clearMatchReports() {
  for (let i = 0; i < 12 && page.url().includes('#/match/'); i++) {
    await tap('.advance-bar .advance')
    await page.waitForTimeout(250)
  }
}

/**
 * Where the game is, read off the chrome.
 *
 * The week is in the status strip and the season is in the top bar — the first
 * version of this looked for both in the status strip and read every season as
 * zero, which made "have we crossed a roll?" permanently false.
 *
 * Neither is on screen while the director is out of work, so that reads as
 * `null` and the caller goes job-hunting rather than waiting for a selector
 * that is never coming.
 */
async function date() {
  if (!(await page.locator('.statusbar').count())) return null
  const week = Number(/W(\d+)/.exec(await page.textContent('.statusbar') ?? '')?.[1] ?? 0)
  const top = await page.textContent('.topbar').catch(() => '')
  const season = Number(/(\d{4})/.exec(top ?? '')?.[1] ?? 0)
  return { week, season }
}

/**
 * Take the first post on the board.
 *
 * Used twice: once to start the career, and again every time the board loses
 * patience. Being sacked is not a reason to abandon the run — career records
 * belong to players and are stored against the save, so the next club's squad
 * answers the question just as well as the last one's would have.
 */
async function takeAJob() {
  // Two boards offer a post and they do not work the same way. The opening
  // one runs a contract negotiation; the out-of-work one takes the job on the
  // spot. And a post can simply refuse — barred, or taken between the render
  // and the tap — so this tries the rows in turn rather than betting the run
  // on the first one.
  await page.waitForSelector('.list__row', { timeout: 120000 })
  const open = page.locator('.list__row:not(.search-post--barred)')
    .filter({ hasText: /\/wk wages|\/WK/i })
  const count = Math.min(await open.count(), 6)
  if (count === 0) throw new Error('no post on the board to take')
  for (let i = 0; i < count; i++) {
    const board = page.url()
    await tap(open.nth(i))
    if (await page.locator('.btn:has-text("Open contract talks")').count()) {
      await tap('.btn:has-text("Open contract talks")')
      await page.waitForSelector('text=Performance bonuses')
      await tap('.btn--primary:has-text("Put it to them")')
      await page.waitForTimeout(600)
    }
    const landed = await page.locator('text=Welcome to')
      .waitFor({ timeout: 15000 }).then(() => true, () => false)
    if (landed) {
      await tap('.btn--primary:has-text("Get to work")')
      await page.waitForSelector('.tabbar', { timeout: 60000 })
      await page.evaluate(() => { window.__dofNoLoadingFloor = true })
      return
    }
    console.log(`  post ${i} did not open (at ${page.url().split('#')[1]}) — trying the next`)
    await page.goto(board)
    await page.waitForSelector('.list__row', { timeout: 30000 })
  }
  throw new Error('every post on the board refused')
}

/** Lifted wholesale from `e2e.mjs`: a tick refused by a decision is not a week. */
async function advanceOneWeek() {
  await readNotice()
  if (!page.url().includes('#/home')) {
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance-bar .advance')
  }
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 60000 })
  await tap('.advance-bar .advance')
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 60000 })
  await page.waitForTimeout(150)
  await readNotice()
  await clearMatchReports()

  if (page.url().includes('#/inbox')) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await readNotice()
      const decide = page
        .locator('.chip--danger:has-text("Urgent"), .chip--warn:has-text("Decide")').first()
      if (!(await decide.count())) break
      await tap(decide)
      await page.waitForTimeout(200)
      const option = page.locator('.col > .btn--block:not([disabled])').first()
      if (!(await option.count())) break
      await tap(option)
      await page.waitForTimeout(200)
    }
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance-bar .advance')
    await tap('.advance-bar .advance')
    await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 60000 })
    await page.waitForTimeout(150)
    await readNotice()
    await clearMatchReports()
  }
}

// ── set up a career ───────────────────────────────────────────────────────────
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.waitForSelector('.title__name')
await tap('text=Start a new career')
await page.waitForSelector('text=New career')
await page.fill('#dof-name', 'Richie Dunk')
await tap('text=Data Analyst')
await tap('.segmented__item:has-text("Compact")')
await tap('text=Create world')
await page.waitForSelector('text=Jobs board', { timeout: 120000 })
await takeAJob()
// The loading floor is a second a week, and this run takes fifty of them.
page.on('framenavigated', () => {
  page.evaluate(() => { window.__dofNoLoadingFloor = true }).catch(() => {})
})

const start = await date()
if (!start) throw new Error('no game on screen after taking a job')
console.log(`in post: ${start.season} W${start.week}`)

// ── play a season ─────────────────────────────────────────────────────────────
const began = Date.now()
let reached = start
for (let i = 0; i < 120; i++) {
  const now = await date()
  if (now) {
    reached = now
    if (now.season > start.season && now.week >= 2) break
    await advanceOneWeek()
  } else {
    // Out of work. The board's patience is part of the game, not a harness
    // failure — find another post and carry on. Waiting a month here is also
    // four weeks of clock for one click.
    console.log('  out of work — back to the board')
    await page.goto('http://127.0.0.1:4173/#/looking')
    await page.waitForSelector('.search-head__name', { timeout: 30000 })
    if (await page.locator('.list__row:not(.search-post--barred)').count()) {
      await takeAJob()
    } else {
      await tap('.search-foot .advance')
      await page.waitForTimeout(600)
    }
  }
  if (i % 10 === 9) console.log(`  ${reached.season} W${reached.week} after ${i + 1} advances`)
}
console.log(`reached ${reached.season} W${reached.week}`
  + ` in ${Math.round((Date.now() - began) / 1000)}s`)
if (reached.season === start.season) throw new Error('never crossed a season roll')

// ── the card ──────────────────────────────────────────────────────────────────
await page.goto('http://127.0.0.1:4173/#/squad')
await page.waitForSelector('text=Sort by', { timeout: 30000 })

// Which player is asked for matters: a youth-team debutant has no season
// behind him and correctly shows no card. Walk the list until one does.
const rows = await page.locator('.list__row:has(.pos)').count()
let found = null
for (let i = 0; i < Math.min(rows, 12); i++) {
  await page.goto('http://127.0.0.1:4173/#/squad')
  await page.waitForSelector('text=Sort by', { timeout: 30000 })
  await tap(page.locator('.list__row:has(.pos)').nth(i))
  await page.waitForSelector('text=Actions', { timeout: 30000 })
  // The read is a disk round-trip, so the card arrives after the rest.
  await page.waitForTimeout(700)
  const card = page.locator('.card:has(.card__title:text-is("Career"))')
  if (!(await card.count())) continue
  const seasons = await card.locator('tbody tr').count()
  if (seasons === 0) continue
  found = {
    name: (await page.textContent('h1, .profile__name, .card__title'))?.trim(),
    summary: (await card.locator('.card__head .small').textContent())?.trim(),
    seasons,
    firstRow: (await card.locator('tbody tr').first().allInnerTexts()).join(' | '),
  }
  // Two ways this table can fail on a 390px phone, and the card looks fine in
  // a screenshot for one of them: the whole thing can overflow its scroller
  // (the right-hand column is not there until you think to swipe), or a single
  // cell can clip its own text (a long club name cut mid-word). Measure both —
  // the first version only measured the scroller, which is `width: 100%` and
  // therefore never overflows, and reported "fits" on a table whose last
  // column was hanging off the edge.
  const fit = await card.evaluate((el) => {
    const scroll = el.querySelector('.table__scroll')
    const clipped = [...el.querySelectorAll('th, td')]
      .filter((c) => c.scrollWidth > c.clientWidth + 1)
      .map((c) => c.textContent.trim())
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, clipped }
  })
  found = { ...found, ...fit }
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${SHOT}/career-card.png`, fullPage: true })
  break
}

if (!found) throw new Error('no squad player showed a populated Career card')
console.log(`career card: ${found.seasons} season(s) — ${found.summary}`)
console.log(`first row: ${found.firstRow.replace(/\s*\n\s*/g, ' ')}`)
console.log(`table fit: ${found.scrollWidth}px of content in ${found.clientWidth}px`
  + `${found.scrollWidth > found.clientWidth + 1 ? ' — OVERFLOWS' : ' — fits'}`
  + `, ${found.clipped.length} clipped cell(s)`
  + `${found.clipped.length ? `: ${found.clipped.join(', ')}` : ''}`)
console.log(`shot: ${SHOT}/career-card.png`)
console.log(`console errors: ${errors.length}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`)

await browser.close()
if (errors.length) process.exit(1)
