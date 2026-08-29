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
  await page.waitForSelector('text=Take a job', { timeout: 60000 })
  await page.screenshot({ path: `${SHOT}/03-clubs.png`, fullPage: false })
})

await step('take a job', async () => {
  await page.click('.btn:has-text("More detail") >> nth=0')
  await page.waitForSelector('.btn:has-text("Take the job at")')
  await page.click('.btn:has-text("Take the job at")')
  await page.waitForSelector('.tabbar', { timeout: 30000 })
  await page.waitForSelector('text=Next fixture')
  await page.screenshot({ path: `${SHOT}/04-home.png` })
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
  await page.screenshot({ path: `${SHOT}/05-home-after.png` })
  console.log(`   decisions answered: ${decisionsAnswered}`)
})

await step('squad screen', async () => {
  await page.click('.tabbar__item:has-text("Squad")')
  await page.waitForSelector('text=Sort by')
  await page.screenshot({ path: `${SHOT}/06-squad.png` })
})

await step('player profile', async () => {
  await page.click('.list__row >> nth=0')
  await page.waitForSelector('text=Attributes', { timeout: 10000 })
  await page.screenshot({ path: `${SHOT}/07-player.png`, fullPage: true })
})

await step('league table', async () => {
  await page.goto('http://127.0.0.1:4173/#/league')
  await page.waitForSelector('.table')
  await page.screenshot({ path: `${SHOT}/08-league.png` })
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
  await page.waitForTimeout(600)
  const after = await page.locator('.list__row:has-text("Scout")').count()
  if (after <= before) throw new Error(`scout count did not rise: ${before} -> ${after}`)
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

await step('career', async () => {
  await page.goto('http://127.0.0.1:4173/#/career')
  await page.waitForSelector('text=The ladder')
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
