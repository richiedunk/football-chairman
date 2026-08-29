import { chromium } from 'playwright'

const SHOT = process.env.SHOT
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
  await page.waitForSelector('.tabbar', { timeout: 30000 })
  await page.waitForSelector('text=Next fixture')
  await page.screenshot({ path: `${SHOT}/06-home.png` })
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
