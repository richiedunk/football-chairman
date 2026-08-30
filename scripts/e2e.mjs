import fs from 'node:fs'
import os from 'node:os'
import { chromium } from 'playwright'

// Screenshots go somewhere outside the repo unless told otherwise. Reading an
// unset variable straight into a path wrote every shot into a directory
// literally called "undefined" in the project root.
const SHOT = process.env.SHOT ?? `${os.tmpdir()}/dof-e2e-shots`
fs.mkdirSync(SHOT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },   // iPhone 14 portrait
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

const step = async (name, fn) => {
  process.stdout.write(`→ ${name} … `)
  try { await fn(); console.log('ok') }
  catch (e) { console.log(`FAILED: ${e.message}`); throw e }
}

await step('load title', async () => {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  // The wordmark is set on two lines, so it is matched by its element rather
  // than as one text node.
  await page.waitForSelector('.title__name')
  const mark = (await page.textContent('.title__name'))?.replace(/\s+/g, ' ').trim()
  if (mark !== 'Directorof Football' && mark !== 'Director of Football') {
    throw new Error(`unexpected wordmark: ${mark}`)
  }
  await page.screenshot({ path: `${SHOT}/01-title.png` })
})

await step('open new career', async () => {
  await page.click('text=Start a new career')
  await page.waitForSelector('text=New career')
  await page.fill('#dof-name', 'Richie Dunk')
  await page.click('text=Data Analyst')
  await page.click('.segmented__item:has-text("Compact")')
  await page.screenshot({ path: `${SHOT}/02-newgame.png` })
})

await step('generate world', async () => {
  await page.click('text=Create world')
  await page.waitForSelector('text=Jobs board', { timeout: 60000 })
  await page.screenshot({ path: `${SHOT}/03-jobs.png`, fullPage: false })
})

await step('locked jobs are shown as targets', async () => {
  const locked = await page.locator('.list__row:has-text("XP away")').count()
  if (locked === 0) throw new Error('no locked jobs shown on the board')
  console.log(`   ${locked} jobs locked behind career level`)
})

await step('take a job', async () => {
  // Open jobs carry a wage-budget line; locked ones carry an XP requirement.
  await page.click('.list__row:has-text("/wk wages") >> nth=0')
  await page.waitForSelector('.btn:has-text("Open contract talks")')
  await page.screenshot({ path: `${SHOT}/04-club-detail.png` })
  await page.click('.btn:has-text("Open contract talks")')
  await page.waitForSelector('text=Performance bonuses')
  await page.screenshot({ path: `${SHOT}/05-contract.png`, fullPage: true })

  // Push every dial to its maximum and expect to be knocked back — the club
  // has one overall limit, not six independent ones — then accept the counter.
  const sliders = page.locator('.sheet input[type="range"]')
  const sliderCount = await sliders.count()
  for (let i = 0; i < sliderCount; i++) {
    const max = await sliders.nth(i).getAttribute('max')
    if (max) await sliders.nth(i).fill(max)
  }
  await page.click('.btn--primary:has-text("Put it to them")')
  await page.waitForTimeout(500)

  const refusal = await page.locator('.sheet').count()
  if (refusal === 0) throw new Error('maxed-out demands were accepted without argument')
  const message = await page.textContent('.sheet div[style*="--warn"]')
  console.log(`   pushed too far: ${message?.trim()}`)

  // The counter is now pre-filled, so submitting again should land.
  await page.click('.btn--primary:has-text("Try again")')

  // Taking a job lands on the handover screen, not straight on the home
  // screen: what you have taken on, what they expect, and what state they
  // left the place in.
  await page.waitForSelector('text=Welcome to', { timeout: 30000 })
  await page.waitForSelector('text=What the board expect')
  // The contract sheet fades out over this; without the wait the screenshot
  // catches the transition rather than the screen.
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOT}/06-welcome.png`, fullPage: true })

  await page.click('.btn--primary:has-text("Get to work")')
  await page.waitForSelector('.tabbar', { timeout: 30000 })
  await page.waitForSelector('.dash-standing')
  await page.screenshot({ path: `${SHOT}/07-home.png` })
})

await step('the header carries the club colour, readably', async () => {
  // The band is computed from the club's real primary at runtime, so this is
  // the only place the rule gets exercised against whatever club the run
  // happened to land at. A washed-out or unset band is a real bug.
  const { band, ratio } = await page.evaluate(() => {
    const el = document.querySelector('.topbar')
    const bg = getComputedStyle(el).backgroundColor
    const [r, g, b] = bg.match(/\d+/g).map(Number)
    const chan = (n) => {
      const c = n / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    const lum = 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
    return { band: bg, ratio: 1.05 / (lum + 0.05) }
  })
  if (ratio < 4.5) throw new Error(`header band ${band} only reaches ${ratio.toFixed(2)}:1`)
  console.log(`   band ${band} at ${ratio.toFixed(1)}:1 against white`)
  if (!(await page.locator('.topbar__strip').count())) throw new Error('no colour strip')
})

const clubName = await page.textContent('.topbar__club')
console.log(`   club: ${clubName}`)

// Advancing can be refused when an urgent decision is outstanding — the app
// redirects to the inbox and the button disappears. That is the intended
// behaviour, so the test answers the decision and carries on, which also
// exercises the decision resolver.
let decisionsAnswered = 0
// A week that contains a match now ends on the report screen rather than on a
// toast, and a week can contain two — a cup replay and a league game. The
// button is the same button in the same place, so clearing them is a matter of
// pressing it until the report is gone.
let reportsSeen = 0
async function clearMatchReports() {
  for (let i = 0; i < 4 && page.url().includes('#/match/'); i++) {
    if (!(await page.locator('.report-score__goals').count())) {
      throw new Error('match report rendered without a scoreline')
    }
    reportsSeen++
    await page.click('.advance')
    await page.waitForTimeout(250)
  }
  if (page.url().includes('#/match/')) throw new Error('could not get off the match report')
}

async function advanceOneWeek() {
  if (!page.url().includes('#/home')) {
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance')
  }
  await page.click('.advance')
  await page.waitForFunction(() => !document.querySelector('.overlay'), null, { timeout: 30000 })
  await page.waitForTimeout(150)
  await clearMatchReports()

  if (page.url().includes('#/inbox')) {
    // Clear every outstanding decision, not just the first. A busy window
    // stacks several — incoming offers, deadline bids, a regulation notice —
    // and answering one still leaves the week blocked. The game is right to
    // refuse; the helper was the thing being too timid, and it left the run
    // stuck at week 28 with the clock apparently stopped.
    for (let attempt = 0; attempt < 12; attempt++) {
      const decide = page.locator('.chip--danger:has-text("Urgent"), .chip--warn:has-text("Decide")').first()
      if (!(await decide.count())) break
      await decide.click()
      await page.waitForTimeout(200)
      // The decision options are the block buttons under the prompt.
      const option = page.locator('.col > .btn--block:not([disabled])').first()
      if (!(await option.count())) break
      await option.click()
      decisionsAnswered++
      await page.waitForTimeout(200)
    }
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.advance')
    // The blocked button opens the blocker rather than advancing, so a tick
    // that hit one has not moved the clock yet. Take the week now that the
    // way is clear, or the caller's count of weeks is a count of taps.
    await page.click('.advance')
    await page.waitForFunction(() => !document.querySelector('.overlay'), null, { timeout: 30000 })
    await page.waitForTimeout(150)
    await clearMatchReports()
  }
}

await step('advance 10 weeks', async () => {
  for (let i = 0; i < 10; i++) await advanceOneWeek()
  console.log(`   match reports shown: ${reportsSeen}`)
  if (reportsSeen === 0) throw new Error('ten weeks passed without a single match report')
  // A tick can end on the inbox when it hit a blocker, so the dashboard shot
  // is taken from the dashboard rather than from wherever the last tap left us.
  await page.goto('http://127.0.0.1:4173/#/home')
  await page.waitForSelector('.dash-standing')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOT}/07-home-after.png` })
  console.log(`   decisions answered: ${decisionsAnswered}`)
})

await step('a match report can be reopened and reads in full', async () => {
  // Everything on this screen was already being simulated and discarded, so
  // the check is that each part of it actually arrives: the scoreline, the
  // three match figures, the coach's read, and per-player ratings.
  await page.goto('http://127.0.0.1:4173/#/home')
  await page.waitForSelector('.dash-standing')
  const recent = page.locator('.list__row:has-text("W")').first()
  await page.locator('text=Recent').waitFor({ timeout: 15000 })
  await recent.click()
  await page.waitForSelector('.report-score__goals', { timeout: 15000 })

  const score = (await page.textContent('.report-score__goals'))?.replace(/\s+/g, '')
  if (!/^\d+.\d+$/.test(score ?? '')) throw new Error(`unreadable scoreline: ${score}`)
  const stats = await page.locator('.report-stats__cell').count()
  if (stats !== 3) throw new Error(`expected three match figures, got ${stats}`)
  const ratings = await page.locator('.report-rating').count()
  if (ratings < 11) throw new Error(`expected a rated eleven, got ${ratings}`)
  const verdict = (await page.textContent('.report-score__verdict'))?.trim()
  if (!verdict) throw new Error('no verdict on the result')
  console.log(`   ${score} · ${ratings} rated · "${verdict}"`)
  await page.screenshot({ path: `${SHOT}/07-match.png`, fullPage: true })

  // A reopened report is a detail screen, not a moment: it must NOT carry the
  // advance button, or a stray tap under an old result costs a week.
  if (await page.locator('.advance').count()) {
    throw new Error('a reopened report is offering to advance the week')
  }
  await page.click('.topbar__back')
  await page.waitForTimeout(300)
  if (page.url().includes('#/match/')) throw new Error('stuck on a reopened report')
})

await step('squad screen', async () => {
  await page.click('.tabbar__item:has-text("Squad")')
  await page.waitForSelector('text=Sort by')
  await page.screenshot({ path: `${SHOT}/08-squad.png` })
})

await step('player profile', async () => {
  await page.click('.list__row >> nth=0')
  await page.waitForSelector('text=Attributes', { timeout: 10000 })
  await page.screenshot({ path: `${SHOT}/09-player.png`, fullPage: true })
})

await step('league table', async () => {
  await page.goto('http://127.0.0.1:4173/#/league')
  await page.waitForSelector('.table')
  await page.screenshot({ path: `${SHOT}/10-league.png` })
})

await step('inbox', async () => {
  await page.click('.tabbar__item:has-text("Inbox")')
  await page.waitForTimeout(400)
  const rows = await page.locator('.card .list__row').count()
  if (rows > 0) await page.click('.card .list__row >> nth=0')
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOT}/09-inbox.png` })
})

await step('scouting', async () => {
  await page.goto('http://127.0.0.1:4173/#/scouting')
  await page.waitForSelector('text=Your scouts')
  await page.screenshot({ path: `${SHOT}/10-scouting.png`, fullPage: true })
})

await step('hire a scout', async () => {
  await page.goto('http://127.0.0.1:4173/#/staff')
  await page.waitForSelector('text=Hire')
  const before = await page.locator('.list__row:has-text("Scout")').count()
  await page.click('.list__row:has-text("Scout") >> nth=-1')
  await page.waitForSelector('.sheet')
  await page.screenshot({ path: `${SHOT}/17-hire-list.png` })
  const candidates = await page.locator('.sheet .list__row').count()
  if (candidates === 0) throw new Error('no hireable scouts offered')
  await page.click('.sheet .list__row >> nth=0')
  await page.waitForSelector('.sheet .btn--primary:has-text("Hire")')
  await page.screenshot({ path: `${SHOT}/18-hire-offer.png` })
  await page.click('.sheet .btn--primary:has-text("Hire")')
  await page.waitForTimeout(700)

  // A refusal is a legitimate outcome — a club in financial crisis cannot take
  // on wages — so the test accepts either the hire landing or the game saying
  // clearly why it did not. Silence would be the bug.
  const toastText = (await page.locator('.toast').count())
    ? (await page.textContent('.toast'))?.trim()
    : null
  const after = await page.locator('.list__row:has-text("Scout")').count()
  if (after <= before && !toastText) {
    throw new Error('hire neither succeeded nor reported a reason')
  }
  console.log(`   outcome: ${after > before ? 'hired' : `refused — ${toastText}`}`)
  await page.screenshot({ path: `${SHOT}/19-staff-after.png` })
})

await step('ask the board for something', async () => {
  await page.goto('http://127.0.0.1:4173/#/board')
  await page.waitForSelector('text=Ask the board')
  await page.screenshot({ path: `${SHOT}/20-board.png`, fullPage: true })

  const request = page.locator('.list__row:has-text("Ask for transfer funds")').first()
  await request.click()
  await page.waitForTimeout(400)

  if (await page.locator('.sheet').count()) {
    await page.screenshot({ path: `${SHOT}/21-board-request.png` })
    await page.click('.sheet .btn--primary:has-text("Put it to the board")')
    await page.waitForTimeout(500)
    const outcome = await page.textContent('.toast')
    console.log(`   board said: ${outcome?.trim().slice(0, 90)}`)
  } else {
    // Refused before opening — the option was unavailable, which the screen
    // must have explained.
    const toastText = await page.textContent('.toast')
    if (!toastText) throw new Error('request neither opened nor explained itself')
    console.log(`   unavailable: ${toastText.trim().slice(0, 90)}`)
  }
})

await step('loan a player out', async () => {
  await page.goto('http://127.0.0.1:4173/#/squad')
  // Wait for a marker unique to the squad screen: a hash-route change can
  // otherwise resolve a generic selector against the previous view.
  await page.waitForSelector('text=Sort by', { timeout: 15000 })
  // Player rows carry a position badge; the depth-audit and sort rows do not.
  // The weakest senior player is the one a club would realistically loan.
  const rows = page.locator('.list__row:has(.pos)')
  const count = await rows.count()
  if (count === 0) throw new Error('no player rows on the squad screen')
  await rows.nth(count - 1).click()
  await page.waitForSelector('text=Actions', { timeout: 15000 })

  const loanButton = page.locator('.btn:has-text("Send out on loan")')
  if (await loanButton.count() === 0) {
    console.log('   window closed — loan button correctly hidden')
    return
  }
  await loanButton.click()
  await page.waitForSelector('.sheet')
  await page.screenshot({ path: `${SHOT}/22-loan.png`, fullPage: true })

  const suitors = await page.locator('.sheet .list__row').count()
  if (suitors === 0) {
    console.log('   nobody wanted him, which the sheet said')
    return
  }
  await page.click('.sheet .btn--primary:has-text("Agree the loan")')
  await page.waitForTimeout(600)
  const outcome = await page.textContent('.toast')
  console.log(`   loan: ${outcome?.trim().slice(0, 90)}`)
})

await step('media briefing', async () => {
  await page.goto('http://127.0.0.1:4173/#/media')
  await page.waitForSelector('text=Brief a journalist')
  await page.click('.btn--primary:has-text("Brief a journalist")')
  await page.waitForSelector('.sheet')
  await page.screenshot({ path: `${SHOT}/11-media-brief.png` })
  await page.click('.sheet .btn--primary:has-text("Make the call")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOT}/12-media-after.png` })
})

await step('finance', async () => {
  await page.goto('http://127.0.0.1:4173/#/finance')
  await page.waitForSelector("text=This season's books")
  await page.screenshot({ path: `${SHOT}/13-finance.png`, fullPage: true })
})

await step('stadium and architect tender', async () => {
  await page.goto('http://127.0.0.1:4173/#/stadium')
  await page.waitForSelector('text=The stands', { timeout: 15000 })
  await page.screenshot({ path: `${SHOT}/23-stadium.png`, fullPage: true })

  const repair = page.locator('.btn:has-text("Repairs")').first()
  if (await repair.count() === 0) {
    console.log('   every stand in good order — nothing to repair')
    return
  }
  await repair.click()
  await page.waitForSelector('.btn:has-text("Invite tenders")')
  await page.screenshot({ path: `${SHOT}/24-stadium-brief.png` })
  await page.click('.btn:has-text("Invite tenders")')
  await page.waitForSelector('text=Tenders received')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOT}/25-tenders.png`, fullPage: true })

  const quotes = await page.locator('.sheet .list__row').count()
  if (quotes === 0) throw new Error('no architect tendered for repairs')
  console.log(`   ${quotes} firms tendered`)

  // Borrowing, so the award does not depend on the club's cash position.
  await page.click('.segmented__item:has-text("Borrow")')
  await page.click('.sheet .list__row >> nth=0')
  await page.waitForTimeout(500)
  const outcome = await page.textContent('.toast')
  console.log(`   ${outcome?.trim().slice(0, 90)}`)

  // Whether the award goes through is not this step's to decide: a club in
  // financial crisis has its building work blocked, which is the rule doing
  // its job. So the assertion branches on what actually happened rather than
  // on what the step would have liked to happen.
  const awarded = !/will not sanction|cannot|refus/i.test(outcome ?? '')
  if (awarded) {
    // The card must appear without navigating away: a screen that only updates
    // on remount is the signature of a broken reactivity chain.
    await page.waitForSelector('text=Work in progress', { timeout: 10000 })
    await page.screenshot({ path: `${SHOT}/26-works.png`, fullPage: true })
  } else {
    // A refusal has to say why. A silent no is indistinguishable from a bug.
    if (!outcome || outcome.trim().length < 15) {
      throw new Error(`tender refused without a reason: ${outcome}`)
    }
    console.log('   award refused, and it said why — that is the rule working')
  }
})

await step('squad registration', async () => {
  await page.goto('http://127.0.0.1:4173/#/squad')
  await page.waitForSelector('text=Squad list')
  await page.click('text=Squad list')
  await page.waitForSelector('text=Trained abroad')

  const places = await page.textContent('.stat:has-text("Places") .stat__value')
  const abroad = await page.textContent('.stat:has-text("Trained abroad") .stat__value')
  console.log(`   ${places?.trim()} named, ${abroad?.trim()} trained abroad`)

  // Which half of this runs depends on where in the calendar the run has got
  // to, and that is not fixed: how many weeks the earlier steps manage to
  // advance depends on what the board and the squad throw up. Both states are
  // worth asserting, so branch on the screen's own statement of the rule
  // rather than assuming a window is open. An earlier version of this step
  // assumed one, passed twice by luck, and then failed.
  const windowOpen = await page.locator('text=The window is open').count() > 0
  const before = Number((places ?? '0').trim().split('/')[0])

  if (!windowOpen) {
    const removable = await page.locator('.btn--ghost:has-text("Remove")').count()
    if (removable > 0) throw new Error('the squad list is editable with the window shut')
    console.log('   window shut — list correctly locked')
    await page.screenshot({ path: `${SHOT}/27-registration.png`, fullPage: true })
    return
  }

  // Taking a player off the list must show up immediately in the counters and
  // move him into the "left out" tab — the reactivity chain, again.
  await page.click('.btn--ghost:has-text("Remove") >> nth=0')
  await page.waitForTimeout(400)
  const after = await page.textContent('.stat:has-text("Places") .stat__value')
  const now = Number((after ?? '0').trim().split('/')[0])
  if (now !== before - 1) throw new Error(`removing a player did not update the count: ${before} -> ${now}`)

  await page.click('.segmented__item:has-text("Left out")')
  await page.waitForSelector('.btn:has-text("Register")')
  await page.click('.btn:has-text("Register") >> nth=0')
  await page.waitForTimeout(400)
  const restored = await page.textContent('.stat:has-text("Places") .stat__value')
  if (Number((restored ?? '0').trim().split('/')[0]) !== before) {
    throw new Error(`re-registering did not restore the count: ${restored}`)
  }
  console.log('   window open — add and remove both round-trip')
})

await step('squad-cost ratio', async () => {
  await page.goto('http://127.0.0.1:4173/#/finance')
  await page.waitForSelector('text=Squad-cost ratio')
  const ratio = await page.textContent('text=/^\\d+% \\/ 70%$/')
  console.log(`   ${ratio?.trim() ?? 'not yet computed'}`)
  await page.screenshot({ path: `${SHOT}/29-squadcost.png`, fullPage: true })
})

await step('facilities', async () => {
  await page.goto('http://127.0.0.1:4173/#/facilities')
  await page.waitForSelector('text=Departments')
  await page.screenshot({ path: `${SHOT}/14-facilities.png` })
})

await step('career and earnings', async () => {
  await page.goto('http://127.0.0.1:4173/#/career')
  await page.waitForSelector('text=The ladder')
  await page.waitForSelector('text=Career total')
  const earnings = await page.textContent('.stat:has-text("Career total") .stat__value')
  if (!earnings || earnings.trim() === '£0') {
    throw new Error(`career earnings did not accumulate: ${earnings}`)
  }
  console.log(`   career earnings: ${earnings.trim()}`)
  await page.screenshot({ path: `${SHOT}/15-career.png`, fullPage: true })
})

await step('deadline day', async () => {
  // How far the earlier steps got is not fixed — a blocked tick can cost a
  // week — so the screen is checked against the week the game is actually on
  // rather than against one this step assumed. An earlier version asserted the
  // out-of-window message unconditionally and failed the day a run happened to
  // arrive already inside a deadline week.
  // The week moved out of the header and into the status strip, which is the
  // one piece of chrome present on every screen — so this reads it from there
  // rather than from a header whose subtitle changes with the route.
  const weekOf = async () => {
    const label = await page.textContent('.statusbar')
    return Number(/W(\d+)/.exec(label ?? '')?.[1] ?? 0)
  }

  await page.goto('http://127.0.0.1:4173/#/deadline')
  await page.waitForSelector('.card')
  const deadlineWeeks = [5, 30]
  if (!deadlineWeeks.includes(await weekOf())) {
    // Outside a deadline week the screen must say so plainly rather than show
    // an empty list that looks broken.
    await page.waitForSelector('text=The window is not closing today')
  }
  // Not every tick advances a week — an urgent decision can block one — so the
  // loop counts weeks gained rather than attempts made, and gives up only if
  // the clock genuinely stops.
  // Then drive the clock to the winter deadline and check the real thing. The
  // headline screen of a headline feature is worth the extra ticks.
  let guard = 0
  let stalled = 0
  let last = await weekOf()
  while (last !== 30 && guard < 60 && stalled < 6) {
    await advanceOneWeek()
    const now = await weekOf()
    stalled = now === last ? stalled + 1 : 0
    last = now
    guard += 1
  }
  if (last !== 30) throw new Error(`never reached deadline week (stuck at ${last} after ${guard} ticks)`)

  await page.goto('http://127.0.0.1:4173/#/deadline')
  await page.waitForSelector('text=The window shuts tonight')
  await page.waitForSelector('text=On the desk')
  const offers = await page.locator('.list__trail .btn--primary').count()
  console.log(`   week 30 — ${offers} offers on the desk`)
  await page.screenshot({ path: `${SHOT}/32-deadline.png`, fullPage: true })

  // The transfers page must advertise it, or nobody finds the screen.
  //
  // Wait for something only the transfers page has before asserting. This
  // check used to pass without ever leaving the deadline screen, because that
  // screen's own heading also read "Deadline day" — so it was testing the
  // page it had just come from. It only surfaced when that heading was
  // reworded, which is the whole problem with asserting on a string two
  // screens share.
  await page.goto('http://127.0.0.1:4173/#/transfers')
  await page.waitForSelector('.section-title:has-text("Around the world")', { timeout: 15000 })
  const banner = page.locator('.card:has-text("Deadline day")')
  if (!(await banner.count())) {
    // A failure here used to say only that a selector never appeared, which
    // is the least useful thing it could say. Report the state the page was
    // actually in.
    const week = await weekOf()
    const url = page.url()
    const text = (await page.locator('.content').innerText()).replace(/\s+/g, ' ').slice(0, 400)
    throw new Error(
      `no deadline banner at week ${week}, url ${url}\n  page said: ${text}`,
    )
  }
  await banner.first().waitFor({ state: 'visible' })
})

await step('who owns the club', async () => {
  await page.goto('http://127.0.0.1:4173/#/board')
  await page.waitForSelector('text=Who owns the club')
  await page.waitForSelector('text=What that means for you')
  const kind = await page.textContent('text=Who owns the club >> xpath=following::div[contains(@class,"small muted")][1]')
  const patience = await page.textContent('.row:has-text("Patience with a bad run") .num')
  console.log(`   ${kind?.trim()} · patience ${patience?.trim()}`)
  await page.screenshot({ path: `${SHOT}/31-owner.png`, fullPage: true })
})

await step('agents', async () => {
  await page.goto('http://127.0.0.1:4173/#/agents')
  await page.waitForSelector('text=Agents you deal with')
  // Agent rows are buttons; the introductions above them are static rows, so
  // the tag is what separates the two.
  const rows = await page.locator('button.list__row').count()
  if (rows === 0) throw new Error('no agents listed')

  // Opening one must show the standing, the relationship and what his cut
  // would be — the whole point is that the number is visible.
  await page.click('button.list__row >> nth=0')
  await page.waitForSelector('text=Relationship')
  await page.waitForSelector('text=/wk deal')
  const standing = await page.textContent('.list__primary .chip')
  console.log(`   ${rows} agents, first is ${standing?.trim()}`)
  await page.screenshot({ path: `${SHOT}/30-agents.png`, fullPage: true })
})

await step('inbox links name their destination', async () => {
  await page.goto('http://127.0.0.1:4173/#/inbox')
  await page.waitForSelector('.list__row, .empty')
  const buttons = await page.locator('.btn--block:has-text("Open ")').count()
  const bare = await page.locator('.btn--block').filter({ hasText: /^Open$/ }).count()
  if (bare > 0) throw new Error(`${bare} inbox links still just say "Open"`)
  console.log(`   ${buttons} links, all naming where they go`)
})

await step('milestones', async () => {
  await page.goto('http://127.0.0.1:4173/#/career')
  await page.waitForSelector('text=Milestones')
  await page.click('.btn--ghost:has-text("Milestones")')
  await page.waitForSelector('text=Silverware')
  const earned = await page.textContent('.stat:has-text("Earned") .stat__value')
  console.log(`   ${earned?.trim()} earned`)
  await page.screenshot({ path: `${SHOT}/28-milestones.png`, fullPage: true })
})

await step('save and reload', async () => {
  await page.goto('http://127.0.0.1:4173/#/settings')
  await page.waitForSelector('text=Saves')
  await page.click('.btn--primary:has-text("Save")')
  await page.waitForTimeout(2500)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('text=Continue', { timeout: 15000 })
  await page.click('.list__main >> nth=0')
  await page.waitForSelector('.tabbar', { timeout: 30000 })
  await page.waitForTimeout(500)
  const reloaded = await page.textContent('.topbar__club')
  if (!reloaded?.includes(clubName?.slice(0, 10) ?? '')) {
    throw new Error(`reloaded into wrong club: ${reloaded} vs ${clubName}`)
  }
  await page.screenshot({ path: `${SHOT}/16-reloaded.png` })
})

console.log(`\nconsole errors: ${errors.length}`)
for (const e of errors.slice(0, 20)) console.log('  ' + e)
await browser.close()
process.exit(errors.length ? 1 : 0)
