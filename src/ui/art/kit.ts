import { clubPair, inkOn, shade } from './palette'
import { hashString, stream, weighted } from './seed'

/**
 * Generated kits.
 *
 * A shirt is the cheapest way to put a club on a person. The squad list, the
 * player profile and the match card all show somebody wearing the colours,
 * and like the crest it is a pure function of the club's id: one outline, a
 * pattern picked by hash, the club's two colours, and a light across the
 * folds so it reads as cloth rather than a flag.
 */

export type KitPattern =
  | 'plain'
  | 'sleeves'
  | 'stripes'
  | 'pinstripes'
  | 'hoops'
  | 'halves'
  | 'sash'
  | 'band'
  | 'chevron'

export interface KitInput {
  id: string
  primary: string
  secondary: string
  /** Printed on the chest. Omit for a plain shirt. */
  number?: number | string
  /** The away kit swaps the colours. */
  away?: boolean
}

const SHIRT =
  'M34 8L42 5Q50 11 58 5L66 8L90 20Q93 22 92 25L84 42Q83 44 80 43L72 39V92Q72 95 69 95H31Q28 95 28 92V39L20 43Q17 44 16 42L8 25Q7 22 10 20Z'
const SLEEVE_L = 'M36 8L10 20Q7 22 8 25L16 42Q17 44 20 43L29 38.5Z'
const SLEEVE_R = 'M64 8L90 20Q93 22 92 25L84 42Q83 44 80 43L71 38.5Z'

export function kitPattern(id: string): KitPattern {
  const rand = stream(hashString(`kit:${id}`))
  return weighted<KitPattern>(rand, [
    ['plain', 7],
    ['sleeves', 3],
    ['stripes', 3],
    ['pinstripes', 1],
    ['hoops', 2],
    ['halves', 1],
    ['sash', 1],
    ['band', 1],
    ['chevron', 1],
  ])
}

function patternSvg(pattern: KitPattern, trim: string): string {
  switch (pattern) {
    case 'plain':
      return ''
    case 'sleeves':
      return `<path d="${SLEEVE_L}" fill="${trim}"/><path d="${SLEEVE_R}" fill="${trim}"/>`
    case 'stripes':
      return [30, 46, 62].map((x) => `<rect x="${x}" y="0" width="8" height="100" fill="${trim}"/>`).join('')
    case 'pinstripes':
      return [32, 38, 44, 50, 56, 62, 68].map((x) => `<rect x="${x - 0.8}" y="0" width="1.6" height="100" fill="${trim}"/>`).join('')
    case 'hoops':
      return [22, 42, 62, 82].map((y) => `<rect x="0" y="${y}" width="100" height="10" fill="${trim}"/>`).join('')
    case 'halves':
      return `<rect x="50" y="0" width="50" height="100" fill="${trim}"/>`
    case 'sash':
      return `<path d="M28 30L40 22L74 88L62 96Z" fill="${trim}"/>`
    case 'band':
      return `<rect x="0" y="36" width="100" height="14" fill="${trim}"/>`
    case 'chevron':
      return `<path d="M28 26L50 44L72 26V38L50 56L28 38Z" fill="${trim}"/>`
  }
}

export function kitSvg(input: KitInput): string {
  const pair = clubPair(input.primary, input.secondary)
  const base = input.away ? pair.trim : pair.base
  const trim = input.away ? pair.base : pair.trim
  const pattern = kitPattern(input.id)
  const key = `${hashString(input.id).toString(36)}${input.away ? 'a' : 'h'}`
  const clip = `kit-${key}`
  const fold = `kitf-${key}`

  // The number sits on whichever colour is under the chest. On stripes and
  // hoops that is both, so it is printed with a heavy keyline in the other
  // ink, the way a real shirt number is edged — legible on either stripe.
  const ink = inkOn(pattern === 'band' ? trim : base)
  const edge = ink === '#ffffff' ? '#0e1116' : '#ffffff'
  const number =
    input.number !== undefined && input.number !== ''
      ? `<text x="50" y="73" text-anchor="middle" font-family="Montserrat Variable, Montserrat, Arial, sans-serif" font-weight="800" font-size="25" fill="${ink}" stroke="${edge}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke">${String(input.number).replace(/[^0-9A-Za-z]/g, '').slice(0, 3)}</text>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-hidden="true">` +
    `<defs>` +
    `<clipPath id="${clip}"><path d="${SHIRT}"/></clipPath>` +
    `<linearGradient id="${fold}" x1="0" x2="1" y1="0" y2="0.3">` +
    `<stop offset="0" stop-color="#000" stop-opacity="0.28"/>` +
    `<stop offset="0.3" stop-color="#fff" stop-opacity="0.12"/>` +
    `<stop offset="0.55" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#000" stop-opacity="0.32"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<g clip-path="url(#${clip})">` +
    `<rect x="0" y="0" width="100" height="100" fill="${base}"/>` +
    patternSvg(pattern, trim) +
    number +
    `<rect x="0" y="0" width="100" height="100" fill="url(#${fold})"/>` +
    `</g>` +
    // Collar and cuffs in the trim, then an outline that holds the shape on
    // any background.
    `<path d="M42 5Q50 14 58 5" fill="none" stroke="${trim}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M16.5 42L8.6 25.6M83.5 42L91.4 25.6" stroke="${trim}" stroke-width="2.4"/>` +
    `<path d="${SHIRT}" fill="none" stroke="${shade(base, 0.6)}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `</svg>`
  )
}
