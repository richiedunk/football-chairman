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
 * advertises a different game. Club colour in the band and nowhere else, and
 * through `headerBand` so that Norwich yellow and Real Madrid white are still
 * legible. Numbers in the mono face, prose in Inter. One accent.
 */

/** Nominal card size. Everything below is expressed against this width. */
export const CARD_W = 1080
export const CARD_H = 1350

const INK = '#dde1e6'
const DIM = '#98a0ac'
const FAINT = '#6b7280'
const GROUND = '#08090b'
const ACCENT = '#c8ff4d'
const HAIRLINE = '#22262e'

const SANS = 'Inter, "Inter Variable", system-ui, -apple-system, sans-serif'
const MONO = '"JetBrains Mono", "JetBrains Mono Variable", ui-monospace, monospace'

export interface RenderOptions {
  /** Pixel width to draw at. Height follows the 4:5 frame. */
  width?: number
  /** A QR-style block of the challenge code, when one should be on the card. */
  codeLabel?: string
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

  ground(ctx)
  header(ctx, card, band)
  headline(ctx, card)
  // The line follows the rows rather than sitting at a fixed height: a card
  // with five rows and one with six would otherwise be laid out to different
  // standards, and the shorter one opened a hole in the middle of itself.
  const rowsEnd = rows(ctx, card)
  voice(ctx, card, rowsEnd)
  footer(ctx, card, options.codeLabel)
}

function ground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = GROUND
  ctx.fillRect(0, 0, CARD_W, CARD_H)
}

/**
 * The band, and the 3px strip of untouched club colour beneath it.
 *
 * Lifted straight from the app's header rather than reinvented, because a
 * card is the app's header seen by somebody who has never opened the app.
 */
function header(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  band: ReturnType<typeof headerBand>,
): void {
  const H = 260
  ctx.fillStyle = band.band
  ctx.fillRect(0, 0, CARD_W, H)
  ctx.fillStyle = band.strip
  ctx.fillRect(0, H, CARD_W, 10)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${fit(ctx, card.title, 62, CARD_W - 120, '700 %SIZEpx ' + SANS)}px ${SANS}`
  ctx.letterSpacing = '-0.02em'
  ctx.fillText(truncate(ctx, card.title, CARD_W - 120), 60, 140)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `500 30px ${SANS}`
  ctx.fillText(truncate(ctx, card.subtitle, CARD_W - 120), 60, 196)
}

/** The one thing read at arm's length. */
function headline(ctx: CanvasRenderingContext2D, card: ShareCard): void {
  ctx.fillStyle = INK
  ctx.font = `700 190px ${MONO}`
  ctx.letterSpacing = '-0.04em'
  ctx.fillText(card.headline.value, 60, 470)
  const width = ctx.measureText(card.headline.value).width
  ctx.letterSpacing = '0px'

  ctx.fillStyle = ACCENT
  ctx.font = `600 26px ${MONO}`
  ctx.letterSpacing = '0.14em'
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
  let y = 570
  const step = 78
  const shown = card.rows.slice(0, 6)

  for (const row of shown) {
    ctx.fillStyle = HAIRLINE
    ctx.fillRect(60, y - 44, CARD_W - 120, 1)

    ctx.fillStyle = DIM
    ctx.font = `500 30px ${SANS}`
    ctx.textAlign = 'left'
    ctx.fillText(row.label, 60, y)

    ctx.fillStyle = row.undisclosed ? ACCENT : INK
    ctx.font = `${row.undisclosed ? 600 : 500} 32px ${MONO}`
    ctx.textAlign = 'right'
    ctx.fillText(truncate(ctx, row.value, CARD_W - 480), CARD_W - 60, y)
    ctx.textAlign = 'left'

    y += step
  }
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
  ctx.font = `600 24px ${MONO}`
  ctx.letterSpacing = '0.16em'
  ctx.fillText(card.footer, 60, CARD_H - 62)

  if (codeLabel) {
    ctx.textAlign = 'right'
    ctx.fillStyle = ACCENT
    ctx.fillText(codeLabel, CARD_W - 60, CARD_H - 62)
    ctx.textAlign = 'left'
  }
  ctx.letterSpacing = '0px'
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
