/**
 * How long can a name be before a list clips it?
 *
 * `LIST_NAME_BUDGET` decides when a player is written "Bruno Fernandes" and
 * when he drops to "B. Fernandes". It was 22, set by eye, and it was
 * abbreviating "Gonzalo Montero Robledo" — 23 characters, 178px, in a 288px
 * box. This is the measurement that replaced the guess: it drives the built
 * app at 390x844, walks every screen that lists names, and reports the real
 * width of the narrowest name box and how many characters of a realistic name
 * fit in it at the row's real font.
 *
 * Needs `npm run build && npx vite preview` first.
 * Run: `node scripts/namefit.mjs`
 */
import { chromium } from 'playwright'

const SAMPLE = 'Cristian Fernandez Rodriguez Alvarez Mendoza'
const SCREENS = ['squad', 'registration', 'transfers', 'scouting', 'staff', 'agents', 'academy']

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const tap = async (sel) => { await page.click(sel); await page.waitForTimeout(300) }

await page.goto('http://127.0.0.1:4173/')
await tap('text=Start a new career')
await page.waitForSelector('text=New career')
await page.fill('#dof-name', 'Richie Dunk')
await tap('.segmented__item:has-text("Compact")')
await tap('text=Create world')
await page.waitForSelector('text=Jobs board', { timeout: 90000 })
await tap('.list__row:has-text("/wk wages") >> nth=0')
await page.waitForSelector('.btn:has-text("Open contract talks")')
await tap('.btn:has-text("Open contract talks")')
await page.waitForSelector('text=Performance bonuses')
await tap('.btn--primary:has-text("Put it to them")')
await page.waitForTimeout(600)
const again = page.locator('.btn--primary:has-text("Try again")')
if (await again.count()) await again.click()
await page.waitForSelector('text=Welcome to', { timeout: 60000 })
await tap('.btn--primary:has-text("Get to work")')
await page.waitForSelector('.tabbar', { timeout: 30000 })

const rows = []
for (const screen of SCREENS) {
  await page.goto(`http://127.0.0.1:4173/#/${screen}`)
  await page.waitForTimeout(700)
  rows.push(await page.evaluate(([screen, sample]) => {
    const els = [...document.querySelectorAll('.list__primary')]
    const widths = els.map((e) => e.clientWidth).filter((w) => w > 0)
    if (!widths.length) return { screen, rows: 0 }
    const width = Math.min(...widths)
    const el = els.find((e) => e.clientWidth === width)
    const style = getComputedStyle(el)
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    let longest = 0
    for (let n = 8; n <= 60; n++) {
      if (ctx.measureText(sample.slice(0, n)).width <= width) longest = n
    }
    // Anything already cut off on screen is a live fault, not a projection.
    const clipped = els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim())
    return { screen, rows: widths.length, minWidth: width, fitsChars: longest, clipped: clipped.length }
  }, [screen, SAMPLE]))
}

console.table(rows)
const usable = rows.filter((r) => r.fitsChars)
console.log(`narrowest name box anywhere: ${Math.min(...usable.map((r) => r.minWidth))}px`)
console.log(`budget that never clips:     ${Math.min(...usable.map((r) => r.fitsChars))} characters`)
const clipped = usable.reduce((a, r) => a + r.clipped, 0)
console.log(`names cut off on screen now: ${clipped}`)
await browser.close()
