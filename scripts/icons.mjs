/**
 * Every icon, lockup and splash, cut from `design/badge.svg`.
 *
 * Nothing here is drawn by hand, so nothing here drifts from the badge. Run
 * after changing the badge or the wordmark:
 *
 *     npm run icons
 *
 * This used to write only `public/`, which was fine while the game was a web
 * target and `public/` was the whole product. Shipping an APK exposed the
 * gap: the Android and iOS icon sets were still the Capacitor template's blue
 * logo, because nothing had ever replaced what `cap add` scaffolded. Both
 * native platforms are generated here now, for the same reason `public/` is —
 * an icon nobody regenerates is an icon that silently stays wrong.
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

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  fs.existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
)

async function shot(html, width, height, out, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } })
  // Android's adaptive icon paints its own background layer under the
  // foreground, so the foreground has to be cut out rather than plated —
  // otherwise the plate covers the background and the parallax has nothing
  // to move against.
  await page.setContent(`<body style="margin:0;background:${transparent ? 'transparent' : BG}">${html}</body>`)
  await page.waitForTimeout(120)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await page.screenshot({ path: out, omitBackground: transparent })
  await page.close()
  console.log(`   ${path.relative(ROOT, out)}  ${width}x${height}`)
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

const lockup = (bg, invert) => {
  const flip = invert ? ';filter:invert(1) hue-rotate(180deg)' : ''
  return `<div style="width:1100px;padding:${PAD_TOP}px 0 ${PAD_BOTTOM}px;background:${bg};display:flex;flex-direction:column;align-items:center;gap:${GAP}px">
    <div style="width:${Math.round(BADGE_H * 640 / 576)}px;height:${BADGE_H}px${flip}">${badge}</div>
    <img src="data:image/png;base64,${wordmark}" style="width:${WORD_W}px;height:${WORD_H}px${flip}">
  </div>`
}
await shot(lockup(BG, false), 1100, LOCKUP_H, path.join(PUBLIC, 'logo.png'))
await shot(lockup('#F7F7F5', true), 1100, LOCKUP_H, path.join(PUBLIC, 'logo-light.png'))

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

const ANDROID_RES = path.join(ROOT, 'android/app/src/main/res')
const IOS_ASSETS = path.join(ROOT, 'ios/App/App/Assets.xcassets')

// Android ships one set per screen density. The multipliers are fixed by the
// platform, so the sizes follow from a base measured in dp rather than from a
// list of pixel numbers that has to be kept in step with itself.
const DENSITIES = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]
const px = (dp, mult) => Math.round(dp * mult)

// An adaptive icon is a 108dp canvas of which only the centre 72dp is ever
// visible — the outer ring is bleed the launcher parallaxes into. Masks are
// applied inside that 72dp, and the harshest is a circle.
//
// 0.50 was chosen by rendering the candidates under a real circular mask and
// looking: at 0.56 the shield's shoulders are already clipped, at 0.62 badly
// so, and 0.44 fits but leaves the icon small and timid in the tray. At 0.50
// the whole shield survives the circle with a little air around it.
const FG_FILL = 0.50
// The same proportion re-expressed for a plate that is itself the circle
// rather than a 72dp window onto a 108dp canvas: 0.50 x (108 / 72).
const ROUND_FILL = FG_FILL * 108 / 72

/** The badge on a circular plate, for the pre-adaptive round icon. */
function rounded(size, fill) {
  const h = Math.round(size * fill)
  const w = Math.round(h * 640 / 576)
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${BG};display:flex;align-items:center;justify-content:center">
    <div style="width:${w}px;height:${h}px">${badge}</div>
  </div>`
}

/** The badge centred on a splash, sized against the shorter edge. */
function splash(width, height, fill) {
  const h = Math.round(Math.min(width, height) * fill)
  const w = Math.round(h * 640 / 576)
  return `<div style="width:${width}px;height:${height}px;background:${BG};display:flex;align-items:center;justify-content:center">
    <div style="width:${w}px;height:${h}px">${badge}</div>
  </div>`
}

console.log('android launcher')
for (const [density, mult] of DENSITIES) {
  const dir = path.join(ANDROID_RES, `mipmap-${density}`)
  const legacy = px(48, mult)
  // API 24 and 25 predate adaptive icons and show these unmasked, so they are
  // plated squares at the same proportion as the web icon.
  await shot(squared(legacy, 0.86), legacy, legacy, path.join(dir, 'ic_launcher.png'))
  await shot(rounded(legacy, ROUND_FILL), legacy, legacy, path.join(dir, 'ic_launcher_round.png'))
  // Transparent: the background layer is the colour below, not this.
  const fg = px(108, mult)
  await shot(squared(fg, FG_FILL), fg, fg, path.join(dir, 'ic_launcher_foreground.png'), {
    transparent: true,
  })
}

// Written here rather than left as the template's white, so the layer under
// the shield is the app's own background and the icon reads as one piece.
fs.writeFileSync(path.join(ANDROID_RES, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by \`npm run icons\`. Do not edit. -->
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`)
console.log('   android/app/src/main/res/values/ic_launcher_background.xml')

console.log('android splash')
// The theme sets these as `android:background`, which stretches the bitmap to
// fill the window — so the source aspect ratio decides how much the badge is
// distorted on a given phone. These are the template's own dimensions rather
// than anything derived: they are not a clean progression (hdpi is 3:5,
// xhdpi 9:16) because they were picked to sit near real screens, and
// regenerating them from a tidier formula would have made every one of them
// a worse match. Only the artwork changes here.
const SPLASH_PORT = {
  mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280],
  xxhdpi: [960, 1600], xxxhdpi: [1280, 1920],
}
for (const [density, [w, h]] of Object.entries(SPLASH_PORT)) {
  await shot(splash(w, h, 0.26), w, h, path.join(ANDROID_RES, `drawable-port-${density}/splash.png`))
  await shot(splash(h, w, 0.26), h, w, path.join(ANDROID_RES, `drawable-land-${density}/splash.png`))
}
// The undensitied fallback, which is what a device with no better match gets.
await shot(splash(480, 320, 0.26), 480, 320, path.join(ANDROID_RES, 'drawable/splash.png'))

console.log('ios')
// One universal 1024 is all a modern asset catalogue wants. Opaque and inset,
// because Apple rounds the corners itself and rejects an icon with alpha.
await shot(squared(1024, 0.84), 1024, 1024,
  path.join(IOS_ASSETS, 'AppIcon.appiconset/AppIcon-512@2x.png'))
// Three identical square splashes: Capacitor points light, dark and universal
// at their own files, and the game has one appearance.
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await shot(splash(2732, 2732, 0.22), 2732, 2732, path.join(IOS_ASSETS, `Splash.imageset/${name}`))
}

await browser.close()
console.log('done')
