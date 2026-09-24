import { headerBand } from '../colour'
import type { ShareCard } from '../../engine/systems/shareCard'

/**
 * Drawing a card.
 *
 * The output is a PNG, and it has to be a PNG rather than a nicely styled
 * `<div>`, because the destination is a message, a timeline or a group chat
 * and none of those take HTML. A screenshot of the game would be the obvious
 * alternative and it is the thing this exists to replace: a screenshot is
 * 390 pixels of dense list at whatever brightness the phone was on.
 *
 * ## Why 1080 × 1350
 *
 * The 4:5 portrait frame is the largest that no major timeline crops, and it
 * is tall enough for six rows without the type going small. A square would
 * cost two rows; 9:16 is a story format that gets letterboxed everywhere
 * else.
 *
 * Everything is drawn at a scale factor off a nominal 1080-wide canvas, so
 * the same code renders the preview at phone size and the shared file at full
 * size without a second set of numbers to keep in step.
 *
 * ## The rules it follows
 *
 * The design system's rules, because a card that does not look like the game
 * advertises a different game: the floodlit pitch as the ground, the club's
 * band across the top through `headerBand` (so Norwich yellow and Real Madrid
 * white are still legible) with the generated crest on it, the rows on a
 * smoked panel, Montserrat for figures and headings, Inter for the voice.
 * One accent.
 */

/**
 * Nominal card size. Everything below is expressed against this width.
 *
 * Not exported: the outside world asks for a width and gets the 4:5 frame,
 * which is the contract. Publishing the numbers would invite a caller to lay
 * something out against them and then disagree with the renderer.
 */
const CARD_W = 1080
const CARD_H = 1350

const INK = '#f0f3f6'
const DIM = '#b2bac5'
const FAINT = '#858e9a'
const GROUND = '#06080a'
const ACCENT = '#c8ff4d'
const HAIRLINE = 'rgba(255,255,255,0.08)'
const PANEL = 'rgba(9,12,16,0.82)'

const SANS = 'Inter, "Inter Variable", system-ui, -apple-system, sans-serif'
const DISPLAY = '"Montserrat Variable", Montserrat, Inter, system-ui, sans-serif'

export interface RenderOptions {
  /** Pixel width to draw at. Height follows the 4:5 frame. */
  width?: number
  /** A QR-style block of the challenge code, when one should be on the card. */
  codeLabel?: string
  /**
   * The club's crest, already decoded. Optional because an image loads
   * asynchronously and drawing is not: the caller paints once without it and
   * again when it arrives, the same way it waits for the fonts.
   */
  crest?: CanvasImageSource | null
}

/**
 * Draw a card onto a canvas.
 *
 * Takes the canvas rather than creating one so the preview can render into an
 * element already on the page and the share path can render into an offscreen
 * one at full size, with no duplicated drawing code between them.
 */
export function drawCard(
  canvas: HTMLCanvasElement,
  card: ShareCard,
  options: RenderOptions = {},
): void {
  const width = options.width ?? CARD_W
  const scale = width / CARD_W
  const height = Math.round(CARD_H * scale)

  // Draw at device resolution so the type is not soft on a retina screen,
  // then let CSS size it back down.
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
  ctx.textBaseline = 'alphabetic'

  const band = headerBand(card.colors.primary, card.colors.secondary)

  ground(ctx, band.strip)
  header(ctx, card, band, options.crest ?? null)
  headline(ctx, card)
  // The line follows the rows rather than sitting at a fixed height: a card
  // with five rows and one with six would otherwise be laid out to different
  // standards, and the shorter one opened a hole in the middle of itself.
  const rowsEnd = rows(ctx, card)
  voice(ctx, card, rowsEnd)
  footer(ctx, card, options.codeLabel)
}

/** The floodlit pitch the whole game stands on, at card size. */
function ground(ctx: CanvasRenderingContext2D, glow: string): void {
  ctx.fillStyle = GROUND
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Mown stripes.
  for (let x = 0, i = 0; x < CARD_W; x += 120, i++) {
    ctx.fillStyle = i % 2 ? '#0e2a17' : '#12331c'
    ctx.fillRect(x, 0, 120, CARD_H)
  }
  // Centre circle and halfway line, faint.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(CARD_W / 2, CARD_H * 0.55, 230, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(CARD_W / 2 - 2, 0, 4, CARD_H)

  // The smoke over it, heavier towards the foot so the rows stay legible.
  const smoke = ctx.createLinearGradient(0, 0, 0, CARD_H)
  smoke.addColorStop(0, 'rgba(4,6,8,0.35)')
  smoke.addColorStop(0.45, 'rgba(4,6,8,0.72)')
  smoke.addColorStop(1, 'rgba(4,6,8,0.94)')
  ctx.fillStyle = smoke
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Two floodlight pools, and a wash of the club's colour between them.
  for (const x of [120, CARD_W - 120]) {
    const light = ctx.createRadialGradient(x, 0, 0, x, 0, 620)
    light.addColorStop(0, 'rgba(220,235,255,0.22)')
    light.addColorStop(1, 'rgba(220,235,255,0)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, CARD_W, CARD_H)
  }
  const wash = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, 900)
  wash.addColorStop(0, withAlpha(glow, 0.22))
  wash.addColorStop(1, withAlpha(glow, 0))
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, CARD_W, CARD_H)
}

/** A hex colour at an opacity, for canvas gradients. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(255,255,255,${alpha * 0.25})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * The band, fading into the floodlights, the club's colours as a trim
 * beneath it, and the crest standing on the right.
 *
 * Lifted straight from the app's header rather than reinvented, because a
 * card is the app's header seen by somebody who has never opened the app.
 */
function header(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  band: ReturnType<typeof headerBand>,
  crest: CanvasImageSource | null,
): void {
  const H = 260
  const fade = ctx.createLinearGradient(0, 0, CARD_W, 0)
  fade.addColorStop(0, band.band)
  fade.addColorStop(0.5, band.band)
  fade.addColorStop(1, withAlpha(band.band, 0.55))
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, CARD_W, H)
  ctx.fillStyle = band.strip
  ctx.fillRect(0, H, CARD_W, 8)
  ctx.fillStyle = band.stripAlt ?? band.strip
  ctx.fillRect(0, H + 8, CARD_W, 5)

  const textRight = crest ? CARD_W - 280 : CARD_W - 60
  if (crest) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    ctx.drawImage(crest, CARD_W - 250, 28, 190, 217)
    ctx.restore()
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${fit(ctx, card.title, 64, textRight - 60, '800 %SIZEpx ' + DISPLAY)}px ${DISPLAY}`
  ctx.letterSpacing = '-0.01em'
  ctx.fillText(truncate(ctx, card.title, textRight - 60), 60, 140)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `700 26px ${DISPLAY}`
  ctx.letterSpacing = '0.08em'
  ctx.fillText(truncate(ctx, card.subtitle.toUpperCase(), textRight - 60), 60, 196)
  ctx.letterSpacing = '0px'
}

/** The one thing read at arm's length. */
function headline(ctx: CanvasRenderingContext2D, card: ShareCard): void {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 30
  ctx.fillStyle = INK
  ctx.font = `800 190px ${DISPLAY}`
  ctx.letterSpacing = '-0.04em'
  ctx.fillText(card.headline.value, 60, 470)
  ctx.restore()
  ctx.font = `800 190px ${DISPLAY}`
  ctx.letterSpacing = '-0.04em'
  const width = ctx.measureText(card.headline.value).width
  ctx.letterSpacing = '0px'

  ctx.fillStyle = ACCENT
  ctx.font = `800 28px ${DISPLAY}`
  ctx.letterSpacing = '0.12em'
  ctx.fillText(card.headline.caption, 60 + width + 28, 470)
  ctx.letterSpacing = '0px'
}

/**
 * The rows.
 *
 * Label left in Inter, value right in the mono face and right-aligned, which
 * is the squad list's own arrangement — a column of figures you can scan
 * beats a column you have to read.
 */
function rows(ctx: CanvasRenderingContext2D, card: ShareCard): number {
  let y = 580
  const step = 76
  const shown = card.rows.slice(0, 6)

  // The rows sit on a panel, as every list in the game does.
  if (shown.length) {
    ctx.fillStyle = PANEL
    roundRect(ctx, 40, y - 64, CARD_W - 80, shown.length * step + 30, 22)
    ctx.fill()
    ctx.strokeStyle = HAIRLINE
    ctx.lineWidth = 2
    ctx.stroke()
  }

  shown.forEach((row, i) => {
    if (i > 0) {
      ctx.fillStyle = HAIRLINE
      ctx.fillRect(72, y - 46, CARD_W - 144, 2)
    }

    ctx.fillStyle = DIM
    ctx.font = `500 30px ${SANS}`
    ctx.textAlign = 'left'
    ctx.fillText(row.label, 76, y)

    ctx.fillStyle = row.undisclosed ? ACCENT : INK
    ctx.font = `800 32px ${DISPLAY}`
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, row.value, CARD_W - 500), CARD_W - 76, y)
    ctx.textAlign = 'left'

    y += step
  })
  return y
}

/**
 * The line in somebody's voice.
 *
 * Set in the accent wash with a rule above it, larger than the rows, because
 * it is the part that makes the card worth posting and it must not read as a
 * seventh row.
 */
function voice(ctx: CanvasRenderingContext2D, card: ShareCard, after: number): void {
  if (!card.line) return
  // Pinned to a floor as well as to the rows, so a card with three rows does
  // not print its best line halfway up the page.
  const top = Math.max(after + 36, CARD_H - 330)
  ctx.fillStyle = ACCENT
  ctx.fillRect(60, top, 72, 4)

  ctx.fillStyle = INK
  // Quotation marks only where somebody actually said it. A benchmark in
  // quotes reads as though a person had recited it.
  ctx.font = card.lineIsSpeech ? `500 italic 38px ${SANS}` : `600 38px ${SANS}`
  const text = card.lineIsSpeech ? `\u201C${card.line}\u201D` : card.line
  wrap(ctx, text, 60, top + 64, CARD_W - 120, 50, 3)
}

function footer(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  codeLabel?: string,
): void {
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(60, CARD_H - 120, CARD_W - 120, 1)

  ctx.fillStyle = FAINT
  ctx.font = `700 24px ${DISPLAY}`
  ctx.letterSpacing = '0.14em'
  ctx.fillText(card.footer, 60, CARD_H - 62)

  if (codeLabel) {
    ctx.textAlign = 'right'
    ctx.fillStyle = ACCENT
    ctx.fillText(codeLabel, CARD_W - 60, CARD_H - 62)
    ctx.textAlign = 'left'
  }
  ctx.letterSpacing = '0px'
}

/** A rounded rectangle path; `ctx.roundRect` is too new to rely on. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------------------------------------------------------------------------
// Text fitting
// ---------------------------------------------------------------------------

/**
 * The largest size at which a string fits, down to a floor.
 *
 * Club names run from "Bury" to "Borussia Mönchengladbach" and a card that
 * was laid out against the short one clips the long one. Shrinking to fit is
 * the only approach that never loses a character.
 */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  start: number,
  maxWidth: number,
  fontTemplate: string,
): number {
  let size = start
  while (size > 30) {
    ctx.font = fontTemplate.replace('%SIZE', String(size))
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  }
  return size
}

/** Cut with an ellipsis when even the floor size will not do. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}

/** Word-wrap, capped at a number of lines so nothing runs off the card. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(' ')
  let line = ''
  let drawn = 0

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      if (drawn === maxLines - 1) {
        ctx.fillText(truncate(ctx, `${line}…`, maxWidth), x, y + drawn * lineHeight)
        return
      }
      ctx.fillText(line, x, y + drawn * lineHeight)
      drawn++
      line = word
    } else {
      line = candidate
    }
  }
  if (line) ctx.fillText(truncate(ctx, line, maxWidth), x, y + drawn * lineHeight)
}

/**
 * The card as a PNG.
 *
 * Rendered offscreen at full size regardless of what the preview is showing,
 * so the file somebody receives is not whatever fitted on the sender's phone.
 */
export async function cardToBlob(
  card: ShareCard,
  options: RenderOptions = {},
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  drawCard(canvas, card, { ...options, width: CARD_W })
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
