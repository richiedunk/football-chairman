/**
 * Prove the live deadline clock in a browser.
 *
 * The cards are drawn on a canvas, and a canvas is the one thing in this
 * codebase that no unit test can look at: `shareCard.test.ts` asserts what
 * goes *on* a card and cannot tell you that the headline overlaps the caption,
 * that a long club name has run off the edge, or that the whole thing rendered
 * in a fallback face because the fonts had not loaded. Only a browser can, so
 * this opens one.
 *
 * It also needs a career with a season behind it — there is no season card and
 * no challenge before the first roll — which is a minute of wall clock and the
 * reason this is a script rather than a test.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/cardshot.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import { chromium } from 'playwright'

const SHOT = process.env.SHOT ?? `${os.tmpdir()}/dof-clock-shots`
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

/**
 * Where the game is, read off the phone's home screen.
 *
 * The version this script was copied from read the week from the status strip
 * and the season from the top bar. Both moved when the tab bar became a
 * phone: the season regex matched nothing, every reading came back as year
 * zero, and "have we crossed a roll?" was therefore true on the first tick —
 * so the run stopped before reaching the thing it exists to photograph.
 *
 * The phone plate prints both, in one element, on the screen a career lands
 * on. One element also cannot disagree with itself.
 *
 * Returns null while the director is out of work, since there is no date on
 * screen then, and the caller goes job-hunting rather than waiting for a
 * selector that is never coming.
 */
async function date() {
  if (!page.url().includes('#/phone')) {
    await page.goto('http://127.0.0.1:4173/#/phone')
    await page.waitForTimeout(200)
  }
  if (!(await page.locator('.phone__when').count())) return null
  const text = (await page.textContent('.phone__when')) ?? ''
  const season = Number(/(\d{4})\//.exec(text)?.[1] ?? 0)
  const week = Number(/WEEK\s+(\d+)/.exec(text)?.[1] ?? 0)
  if (!season || !week) return null
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
      // The tab bar is gone — a career lands on the phone home screen now.
      await page.waitForSelector('.phone__plate', { timeout: 60000 })
      await page.evaluate(() => { window.__dofNoLoadingFloor = true })
      return
    }
    console.log(`  post ${i} did not open (at ${page.url().split('#')[1]}) — trying the next`)
    await page.goto(board)
    await page.waitForSelector('.list__row', { timeout: 30000 })
  }
  throw new Error('every post on the board refused')
}

/*
 * The week, lifted from `e2e.mjs` rather than reimplemented.
 *
 * Advancing is not one click: a week can be refused by an outstanding
 * decision, can end on a match report that has to be dismissed, and can raise
 * a notice over the whole app. `careershot.mjs`, which this script started
 * life as a copy of, carries an older version of this that predates the inbox
 * becoming conversations — it taps chips that no longer exist, so every
 * blocked week costs a tap and moves no clock, and the run sits on the same
 * week until it gives up. Keeping one copy honest is hard enough.
 */
const clickAdvance = () => tap('.advance-bar .advance')

// Counted only so the lifted code can stay a straight copy of the version in
// `e2e.mjs`. Printed at the end, because a run that answered nothing and a run
// that answered forty decisions reached the same season by different routes.
let decisionsAnswered = 0
let multiQuestionThreads = 0

// A week that contains a match now ends on the report screen rather than on a
// toast, and a week can contain two — a cup replay and a league game. The
// button is the same button in the same place, so clearing them is a matter of
// pressing it until the report is gone.
let reportsSeen = 0
async function clearMatchReports() {
  for (let i = 0; i < 4 && page.url().includes('#/match/'); i++) {
    await readNotice()
    if (!(await page.locator('.report-score__goals').count())) {
      throw new Error('match report rendered without a scoreline')
    }
    reportsSeen++
    await clickAdvance()
    await page.waitForTimeout(300)
  }
  if (page.url().includes('#/match/')) throw new Error('could not get off the match report')
}

async function advanceOneWeek() {
  // Anything still waiting to be read sits over the whole app, so it is cleared
  // before reaching for a button underneath it.
  await readNotice()
  if (!page.url().includes('#/home')) {
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance-bar .advance')
  }
  // Any loading screen still up from the previous iteration has to come down
  // before this one is timed, or the measurement catches the tail of somebody
  // else's screen and reports a floor that never failed.
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 })
  await clickAdvance()
  // Only time a tick that actually ran: a refused advance (a decision
  // outstanding) never raises the loading screen at all, and counting those
  // as a 2ms flash measures nothing.
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 })
  await page.waitForTimeout(300)
  await readNotice()
  await clearMatchReports()

  if (page.url().includes('#/inbox')) {
    // Clear every outstanding decision, not just the first. A busy window
    // stacks several — incoming offers, deadline bids, a regulation notice —
    // and answering one still leaves the week blocked. The game is right to
    // refuse; the helper was the thing being too timid, and it left the run
    // stuck at week 28 with the clock apparently stopped.
    for (let attempt = 0; attempt < 12; attempt++) {
      await readNotice()
      // The mark on the right of a conversation that wants something: "!" for
      // one that blocks the week, "?" for one that merely waits. These
      // replaced the chips the flat inbox used.
      const decide = page.locator('.chat-row__flag--urgent, .chat-row__flag--decide').first()
      if (!(await decide.count())) break
      // The chip is on a thread row, so tapping it opens the conversation and
      // the answer is given there rather than inline.
      await tap(decide)
      await page.waitForTimeout(250)

      // A conversation can be holding more than one open decision. Answer all
      // of them before going back for the next thread, or a busy window costs
      // one round trip per message. The replies are on show, so there is no
      // button to open first.
      for (let open = 0; open < 8; open++) {
        await readNotice()
        const option = page.locator('.reply:not([disabled])').first()
        if (!(await option.count())) break

        // Two offers in one week both come from Recruitment, land in one
        // thread and carry word-for-word identical options. Exactly one
        // question may be live, and the panel has to say which — otherwise the
        // reader is guessing which player they just sold. Checked here rather
        // than in a step of its own, because by the time the run reaches a
        // step of its own there are no decisions left to look at.
        //
        // Waited for rather than read straight off: answering one decision
        // re-renders the thread, and counting in the middle of that catches
        // the panel still naming the offer that has just been dealt with.
        const settled = await page.waitForFunction(() => {
          const asking = document.querySelectorAll('.chat__asking').length
          if (asking === 0) return { asking: 0, live: 0, subject: null }
          const live = document.querySelectorAll('.chat__asking:not(.is-waiting)').length
          if (live !== 1) return false
          const subject = document.querySelector('.replies__subject')?.textContent?.trim() ?? null
          return subject ? { asking, live, subject } : false
        }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null)

        if (!settled) throw new Error('a thread showed no live question beside a named reply panel')
        if (settled.asking > 1) multiQuestionThreads++

        await tap(option)
        decisionsAnswered++
        await page.waitForTimeout(250)
      }

      await page.goto('http://127.0.0.1:4173/#/inbox')
      await page.waitForSelector('.threads, .threads-empty')
    }
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance-bar .advance')
    // The blocked button opens the blocker rather than advancing, so a tick
    // that hit one has not moved the clock yet. Take the week now that the
    // way is clear, or the caller's count of weeks is a count of taps.
    await clickAdvance()
    await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 })
    await page.waitForTimeout(300)
    await readNotice()
    await clearMatchReports()
  }
}

// ── set up a career, and turn the clock on ────────────────────────────────────
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
page.on('framenavigated', () => {
  page.evaluate(() => { window.__dofNoLoadingFloor = true }).catch(() => {})
})

await page.goto('http://127.0.0.1:4173/#/settings')
await page.waitForSelector('text=Deadline day runs to a clock')
const toggle = page.locator('label:has-text("Deadline day runs to a clock") input')
if (await toggle.isChecked()) throw new Error('the clock is on by default; it must be opt-in')
await toggle.check()
console.log('clock switched on')

// ── reach the summer deadline, which is week 5 ────────────────────────────────
for (let i = 0; i < 12; i++) {
  const now = await date()
  if (!now) throw new Error('out of work before the window shut')
  if (now.week >= 5) break
  await advanceOneWeek()
}
const at = await date()
console.log(`at ${at.season} W${at.week}`)
if (at.week !== 5) throw new Error(`expected the deadline at W5, reached W${at.week}`)

// ── watch it run ──────────────────────────────────────────────────────────────
await page.goto('http://127.0.0.1:4173/#/deadline')
await page.waitForSelector('.deadline-clock', { timeout: 20000 })

// The bar is removed once the window shuts, which is the app being right
// rather than the screen being broken, so it is read as optional.
const read = async () => ({
  face: (await page.textContent('.deadline-clock'))?.trim(),
  width: (await page.locator('.deadline-track__fill').count())
    ? await page.locator('.deadline-track__fill').evaluate((el) => el.style.width)
    : null,
  gone: await page.locator('.list__sub:has-text("Gone")').count(),
  offers: await page.locator('.list__row').count(),
})

const first = await read()
console.log(`t=0     ${first.face}  bar ${first.width}  offers ${first.offers}`)
if (first.face === '0:00') throw new Error('the clock started spent')
if (first.gone !== 0) throw new Error('an offer had gone before the clock started')
await page.screenshot({ path: `${SHOT}/deadline-start.png`, fullPage: true })

await page.waitForTimeout(6000)
const later = await read()
console.log(`t=6s    ${later.face}  bar ${later.width}  gone ${later.gone}`)
if (later.face === first.face) throw new Error('the clock did not move')
if (later.width === first.width) throw new Error('the bar did not move')

// A full six-minute window is too long for a check, so the escape hatch is
// also how this run reaches the end state — which is the behaviour that
// matters most anyway: it has to settle at once.
await tap('.btn:has-text("Shut it now")')
await page.waitForTimeout(400)
const shut = await read()
console.log(`shut    ${shut.face}  gone ${shut.gone} of ${shut.offers}`)
if (shut.width !== null) throw new Error('the countdown bar outlived the window')
if (shut.face !== '0:00') throw new Error(`shutting early left the clock at ${shut.face}`)
if (shut.offers > 0 && shut.gone !== shut.offers) {
  throw new Error(`window shut with ${shut.offers - shut.gone} offers still standing`)
}
if (await page.locator('.btn:has-text("Do it")').count()) {
  throw new Error('an offer is still takeable after the window shut')
}
await page.screenshot({ path: `${SHOT}/deadline-shut.png`, fullPage: true })

if (errors.length) {
  console.log('\nconsole errors:')
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`)
}
console.log(`\nshots in ${SHOT}`)
await browser.close()
if (errors.length) process.exit(1)
