/**
 * Every icon and lockup, cut from `design/badge.svg`.
 *
 * Nothing in `public/` is drawn by hand, so nothing in `public/` drifts from
 * the badge. Run after changing the badge or the wordmark:
 *
 *     npm run icons
 *
 * Renders through the same Chromium the end-to-end test uses, because it is
 * the only renderer here that understands an SVG with an embedded raster in
 * it — and the figure inside the badge is exactly that.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const BG = '#08090B'

// The badge carries explicit width and height so it can be opened on its own
// and look like something. Those attributes win over the box it is placed in,
// so an SVG dropped into a 430px div renders at its full 576 and spills over
// whatever is beneath it — which is how the first lockup came out with the
// wordmark sitting on top of the shield. Stripped here; the viewBox is what
// should be doing the scaling.
const badge = fs.readFileSync(path.join(ROOT, 'design/badge.svg'), 'utf8')
  .replace(/<svg([^>]*?)\swidth="\d+"\s+height="\d+"/, '<svg$1 width="100%" height="100%"')
const wordmark = fs.readFileSync(path.join(ROOT, 'design/wordmark.png')).toString('base64')
// A hand-mapped light wordmark rather than a CSS inversion. Inverting turns
// the lime into magenta, which is the one colour in the identity that must not
// move; these two files differ only in the neutrals.
const wordmarkLight = fs.readFileSync(path.join(ROOT, 'design/wordmark-light.png')).toString('base64')

/**
 * The badge with its neutrals swapped and the lime left exactly alone.
 *
 * The drawn parts are a string substitution. The figure is not: it is a raster
 * embedded in the SVG, so no amount of editing the markup touches it, and the
 * first light lockup came out with a white figure on white paper. It gets
 * `brightness(0)`, which is targeted at that one element rather than thrown
 * over the whole mark — a blunt inversion is what turns the lime magenta.
 */
const badgeLight = badge
  .replace(/#FFFFFF/g, '__FIG__')
  .replace(/#08090B/g, '#F7F7F5')
  .replace(/__FIG__/g, '#08090B')
  .replace('<image ', '<image style="filter:brightness(0)" ')

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
)

async function shot(html, width, height, out, scale = 1) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(`<body style="margin:0;background:${BG}">${html}</body>`)
  await page.waitForTimeout(120)
  await page.screenshot({ path: out })
  await page.close()
  console.log(`   ${path.relative(ROOT, out)}  ${width * scale}x${height * scale}`)
}

/** The badge alone, centred on a square with `fill` of it covered. */
function squared(size, fill) {
  const h = Math.round(size * fill)
  const w = Math.round(h * 640 / 576)
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${w}px;height:${h}px">${badge}</div>
  </div>`
}

console.log('icons')
// The manifest's two, plus a maskable one held inside the centre 80% because
// Android crops it to a circle or a squircle and would shave the shield's
// points off otherwise.
await shot(squared(192, 0.86), 192, 192, path.join(PUBLIC, 'icon-192.png'))
await shot(squared(512, 0.86), 512, 512, path.join(PUBLIC, 'icon-512.png'))
await shot(squared(512, 0.62), 512, 512, path.join(PUBLIC, 'icon-512-maskable.png'))
// Apple rounds the corners itself and does not handle transparency.
await shot(squared(180, 0.84), 180, 180, path.join(PUBLIC, 'apple-touch-icon.png'))

console.log('lockups')
// Badge over wordmark, with the wordmark the wider of the two so the badge
// does not swamp it. The wordmark is 1092x222, so its height follows its
// width; the viewport is sized to the sum rather than guessed, because a
// viewport shorter than the content silently crops the bottom off.
const BADGE_H = 430
const WORD_W = 820
const WORD_H = Math.round(WORD_W * 222 / 1092)
const PAD_TOP = 64, PAD_BOTTOM = 56, GAP = 36
const LOCKUP_H = PAD_TOP + BADGE_H + GAP + WORD_H + PAD_BOTTOM

const lockup = (bg, light) => `
  <div style="width:1100px;padding:${PAD_TOP}px 0 ${PAD_BOTTOM}px;background:${bg};display:flex;flex-direction:column;align-items:center;gap:${GAP}px">
    <div style="width:${Math.round(BADGE_H * 640 / 576)}px;height:${BADGE_H}px">${light ? badgeLight : badge}</div>
    <img src="data:image/png;base64,${light ? wordmarkLight : wordmark}" style="width:${WORD_W}px;height:${WORD_H}px">
  </div>`
await shot(lockup(BG, false), 1100, LOCKUP_H, path.join(PUBLIC, 'logo.png'))
await shot(lockup('#F7F7F5', true), 1100, LOCKUP_H, path.join(PUBLIC, 'logo-light.png'))

// The bare badge, served so the title screen can show the mark itself rather
// than only the wordmark.
fs.writeFileSync(path.join(PUBLIC, 'badge.svg'), badge.replace('width="100%" height="100%"', ''))
console.log('   public/badge.svg')

console.log('favicon')
// Nested inside a dark plate, because the figure is white and would vanish
// into a light browser tab. Scaled so the 640x576 badge sits centred in 64.
const inner = fs.readFileSync(path.join(ROOT, 'design/badge.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Undisclosed Football">
  <!-- Generated by \`npm run icons\` from design/badge.svg. Do not edit.
       The real mark rather than a simplified redraw: at 32px a drawn stand-in
       came out as the generic account glyph, and this does not. -->
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  <g transform="translate(32 33) scale(0.0813) translate(-320 -288)">
${inner}
  </g>
</svg>
`)
console.log('   public/favicon.svg')

await browser.close()
console.log('done')
