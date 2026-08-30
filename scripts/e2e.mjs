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
  await page.waitForSelector('text=Director of Football')
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
  await page.waitForSelector('text=Next fixture')
  await page.screenshot({ path: `${SHOT}/07-home.png` })
})

const clubName = await page.textContent('.topbar__club')
console.log(`   club: ${clubName}`)

// Advancing can be refused when an urgent decision is outstanding — the app
// redirects to the inbox and the button disappears. That is the intended
// behaviour, so the test answers the decision and carries on, which also
// exercises the decision resolver.
let decisionsAnswered = 0
async function advanceOneWeek() {
  if (!page.url().includes('#/home')) {
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.btn--primary:has-text("Advance week")')
  }
  await page.click('.btn--primary:has-text("Advance week")')
  await page.waitForFunction(() => !document.querySelector('.overlay'), null, { timeout: 30000 })
  await page.waitForTimeout(150)

  if (page.url().includes('#/inbox')) {
    const decide = page.locator('.chip--danger:has-text("Urgent"), .chip--warn:has-text("Decide")').first()
    if (await decide.count()) {
      await decide.click()
      await page.waitForTimeout(200)
      const option = page.locator('.card__body .btn--ghost, .card__body .btn--primary').first()
      if (await option.count()) {
        await option.click()
        decisionsAnswered++
        await page.waitForTimeout(200)
      }
    }
    await page.goto('http://127.0.0.1:4173/#/home')
    await page.waitForSelector('.btn--primary:has-text("Advance week")')
  }
}

await step('advance 10 weeks', async () => {
  for (let i = 0; i < 10; i++) await advanceOneWeek()
  await page.screenshot({ path: `${SHOT}/07-home-after.png` })
  console.log(`   decisions answered: ${decisionsAnswered}`)
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

  // The card must appear without navigating away: a screen that only updates
  // on remount is the signature of a broken reactivity chain.
  await page.waitForSelector('text=Work in progress', { timeout: 10000 })
  await page.screenshot({ path: `${SHOT}/26-works.png`, fullPage: true })
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
  // Outside a deadline week the screen must say so plainly rather than show an
  // empty list that looks broken.
  await page.goto('http://127.0.0.1:4173/#/deadline')
  await page.waitForSelector('text=The window is not closing today')

  // Then drive the clock to the winter deadline and check the real thing. The
  // headline screen of a headline feature is worth the extra ticks.
  const weekOf = async () => {
    const label = await page.textContent('.topbar__meta')
    return Number(/Week (\d+)/.exec(label ?? '')?.[1] ?? 0)
  }
  // Not every tick advances a week — an urgent decision can block one — so the
  // loop counts weeks gained rather than attempts made, and gives up only if
  // the clock genuinely stops.
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
  await page.goto('http://127.0.0.1:4173/#/transfers')
  await page.waitForSelector('.card:has-text("Deadline day")')
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
