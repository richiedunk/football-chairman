/**
 * Rasterise the app icon from the one SVG that defines it.
 *
 * Installable web apps want PNGs — a manifest icon for Android and the
 * install prompt, and an apple-touch-icon because iOS will not take an SVG.
 * Keeping hand-made PNGs beside the SVG means three files that drift; this
 * regenerates them from `public/favicon.svg`, which stays the only place the
 * mark is drawn.
 *
 * Chromium does the rendering because it is already here for the end-to-end
 * suite, and because the icon then looks exactly as a browser will draw it.
 *
 * Run: `node scripts/icons.mjs`
 */
import fs from 'node:fs'
import { chromium } from 'playwright'

const SIZES = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // iOS draws its own rounded corners and does not honour transparency, so
  // this one is the full square and relies on the SVG's own background.
  { file: 'apple-touch-icon.png', size: 180 },
]

const svg = fs.readFileSync('public/favicon.svg', 'utf8')
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
)

for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:#0b1220}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  await page.screenshot({ path: `public/${file}`, omitBackground: false })
  await page.close()
  console.log(`  public/${file}  ${size}x${size}`)
}

await browser.close()
