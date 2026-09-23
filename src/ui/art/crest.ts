import { clubPair, inkOn, shade, WHITE_HEX, INK_HEX } from './palette'
import { hashString, stream, weighted } from './seed'

/**
 * Generated club crests.
 *
 * Every club in the game has a real name and real colours and nothing else,
 * and a list of five hundred names is a spreadsheet. A crest per club turns
 * the league table, the fixture list and the jobs board into a world of
 * places. Nobody has to draw five hundred of them: a crest is an outline, a
 * field pattern and an emblem, each picked from a short list by a hash of the
 * club's id, painted in the club's colours.
 *
 * These are deliberately generic heraldry — shields, hoops, stars, towers —
 * and never an attempt at a real club's badge. The disclaimer in
 * `AboutView.vue` says club names are used to identify clubs and nothing
 * more, and a crest that imitated the real one would break that.
 *
 * Output is an SVG string, so the same function feeds the Vue component, the
 * share-card renderer and the tests without a DOM.
 */

export type CrestShape = 'heater' | 'hex' | 'round' | 'spade' | 'french' | 'badge'
export type CrestField =
  | 'plain'
  | 'stripes'
  | 'hoops'
  | 'halves'
  | 'quarters'
  | 'sash'
  | 'chevron'
  | 'cross'
  | 'chief'
  | 'border'
export type CrestEmblem = 'ball' | 'star' | 'tower' | 'crown' | 'tree' | 'bird' | 'initials'

export interface CrestDesign {
  shape: CrestShape
  field: CrestField
  emblem: CrestEmblem
  /** Stars over the crest — decoration, not honours. */
  stars: number
}

export interface CrestInput {
  id: string
  name: string
  primary: string
  secondary: string
  /** 'full' carries the ribbon with the club's name; 'mark' is for 16-32px. */
  detail?: 'full' | 'mark'
}

/** Width 100, height 116, centred on (50, 58). */
const SHAPES: Record<CrestShape, string> = {
  heater: 'M8 6H92V50C92 82 72 100 50 110C28 100 8 82 8 50Z',
  hex: 'M50 3L93 25V87L50 112L7 87V25Z',
  round: 'M2 58A48 48 0 1 0 98 58A48 48 0 1 0 2 58Z',
  spade: 'M50 4C62 11 78 13 93 13V52C93 84 72 101 50 111C28 101 7 84 7 52V13C22 13 38 11 50 4Z',
  french: 'M7 6H93V70C93 88 70 98 50 111C30 98 7 88 7 70Z',
  badge: 'M15 5H85Q94 5 94 14V74L50 111L6 74V14Q6 5 15 5Z',
}

const EMBLEMS: Record<Exclude<CrestEmblem, 'initials' | 'ball'>, string> = {
  star: 'M50 34L55.9 46.1L69 48L59.5 57.3L61.8 70.5L50 64.2L38.2 70.5L40.5 57.3L31 48L44.1 46.1Z',
  tower:
    'M36 72V47H39V40H44V45H48V40H52V45H56V40H61V47H64V72H55V63A5 5 0 0 0 45 63V72Z',
  crown: 'M32 66L34 43L42 53L50 38L58 53L66 43L68 66Z M32 69H68V73H32Z',
  tree: 'M50 34C60 34 67 41 67 49C67 57 60 62 53 62V72H47V62C40 62 33 57 33 49C33 41 40 34 50 34Z',
  bird: 'M28 54C36 44 44 43 50 52C56 43 64 44 72 54C63 50 56 52 50 62C44 52 37 50 28 54Z',
}

/** The design for a club: a pure function of its id. */
export function crestDesign(id: string): CrestDesign {
  const rand = stream(hashString(`crest:${id}`))
  const shape = weighted<CrestShape>(rand, [
    ['heater', 5],
    ['hex', 3],
    ['round', 2],
    ['spade', 3],
    ['french', 3],
    ['badge', 3],
  ])
  const field = weighted<CrestField>(rand, [
    ['plain', 4],
    ['stripes', 3],
    ['hoops', 2],
    ['halves', 2],
    ['quarters', 1],
    ['sash', 2],
    ['chevron', 2],
    ['cross', 1],
    ['chief', 3],
    ['border', 3],
  ])
  const emblem = weighted<CrestEmblem>(rand, [
    ['ball', 5],
    ['star', 2],
    ['tower', 2],
    ['crown', 1],
    ['tree', 1],
    ['bird', 2],
    ['initials', 3],
  ])
  const stars = weighted(rand, [
    [0, 7],
    [1, 2],
    [3, 1],
  ] as const)
  return { shape, field, emblem, stars }
}

/** Two or three capitals that stand for the club. */
export function initials(name: string): string {
  const skip = new Set(['FC', 'AFC', 'CF', 'SC', 'AC', 'THE', 'OF', 'DE', 'CD', 'CLUB', '&'])
  const words = name
    .toUpperCase()
    .split(/[\s-]+/)
    .filter((w) => w && !skip.has(w.replace(/\./g, '')))
  const letters = (words.length ? words : name.toUpperCase().split(/\s+/))
    .slice(0, 3)
    .map((w) => w.replace(/[^A-Z0-9]/g, '').charAt(0))
    .join('')
  return letters || '?'
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function fieldSvg(field: CrestField, shapePath: string, base: string, trim: string): string {
  switch (field) {
    case 'plain':
      return ''
    case 'stripes':
      return [5, 25, 45, 65, 85].map((x) => `<rect x="${x}" y="0" width="10" height="116" fill="${trim}"/>`).join('')
    case 'hoops':
      return [18, 42, 66, 90].map((y) => `<rect x="0" y="${y}" width="100" height="12" fill="${trim}"/>`).join('')
    case 'halves':
      return `<rect x="50" y="0" width="50" height="116" fill="${trim}"/>`
    case 'quarters':
      return `<rect x="50" y="0" width="50" height="58" fill="${trim}"/><rect x="0" y="58" width="50" height="58" fill="${trim}"/>`
    case 'sash':
      return `<path d="M-10 18L18 -10L112 84L84 112Z" fill="${trim}"/>`
    case 'chevron':
      return `<path d="M0 44L50 74L100 44V64L50 94L0 64Z" fill="${trim}"/>`
    case 'cross':
      return `<rect x="42" y="0" width="16" height="116" fill="${trim}"/><rect x="0" y="48" width="100" height="16" fill="${trim}"/>`
    case 'chief':
      return `<rect x="0" y="0" width="100" height="32" fill="${trim}"/>`
    case 'border':
      // The field in the trim colour, then the shape again, smaller, in the
      // base: an inset border that follows any outline without a second path.
      return `<rect x="0" y="0" width="100" height="116" fill="${trim}"/><path d="${shapePath}" fill="${base}" transform="translate(50 58) scale(0.82) translate(-50 -58)"/>`
  }
}

/** Whether the emblem needs a plate behind it to stay legible. */
function busy(field: CrestField): boolean {
  return field === 'stripes' || field === 'hoops' || field === 'halves' || field === 'quarters' || field === 'sash' || field === 'cross'
}

function ballSvg(ink: string, face: string): string {
  // A plain modern ball: white disc, a centre pentagon and five spokes to the
  // panels around it. Reads as a football at 16px and holds up at 200.
  const cx = 50
  const cy = 54
  const r = 16
  const pent: string[] = []
  const spokes: string[] = []
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    pent.push(`${(cx + Math.cos(a) * 6.2).toFixed(2)} ${(cy + Math.sin(a) * 6.2).toFixed(2)}`)
    const x1 = cx + Math.cos(a) * 6.2
    const y1 = cy + Math.sin(a) * 6.2
    const x2 = cx + Math.cos(a) * r
    const y2 = cy + Math.sin(a) * r
    spokes.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`)
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${face}" stroke="${ink}" stroke-width="2.4"/>` +
    `<path d="M${pent.join('L')}Z" fill="${ink}"/>` +
    `<path d="${spokes.join('')}" stroke="${ink}" stroke-width="2"/>`
  )
}

export function crestSvg(input: CrestInput): string {
  const design = crestDesign(input.id)
  const { base, trim } = clubPair(input.primary, input.secondary)
  const full = input.detail !== 'mark'
  const shapePath = SHAPES[design.shape]
  const clip = `crest-${hashString(input.id).toString(36)}-${full ? 'f' : 'm'}`

  // What the emblem is drawn on: the base colour, or a plate of it when the
  // field is too busy for a shape to survive on top.
  const plate = busy(design.field)
  const ink = inkOn(base)
  const face = ink === WHITE_HEX ? WHITE_HEX : '#f4f5f7'
  const ballInk = INK_HEX

  let emblem = ''
  if (plate) {
    emblem += `<circle cx="50" cy="54" r="22" fill="${base}" stroke="${trim}" stroke-width="3"/>`
  }
  if (design.emblem === 'ball') {
    emblem += ballSvg(ballInk, face)
  } else if (design.emblem === 'initials') {
    const letters = escape(initials(input.name))
    const size = letters.length > 2 ? 17 : 22
    emblem += `<text x="50" y="${54 + size * 0.36}" text-anchor="middle" font-family="Montserrat Variable, Montserrat, Arial, sans-serif" font-weight="800" font-size="${size}" fill="${ink}" letter-spacing="-0.5">${letters}</text>`
  } else {
    emblem += `<path d="${EMBLEMS[design.emblem]}" fill="${ink}" fill-rule="evenodd"/>`
  }

  let ribbon = ''
  if (full) {
    // The name across the foot of the crest, the way a real badge carries it.
    // textLength keeps a long name inside the ribbon rather than overflowing.
    const label = escape(input.name.length <= 14 ? input.name.toUpperCase() : initials(input.name))
    const band = inkOn(trim) === WHITE_HEX ? trim : shade(base, 0.45)
    const bandInk = inkOn(band)
    const width = Math.min(64, 8 + label.length * 5.2)
    ribbon =
      `<rect x="${50 - width / 2 - 4}" y="79" width="${width + 8}" height="13" rx="2" fill="${band}" stroke="${bandInk === WHITE_HEX ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}" stroke-width="1"/>` +
      `<text x="50" y="88.6" text-anchor="middle" font-family="Montserrat Variable, Montserrat, Arial, sans-serif" font-weight="800" font-size="7.4" fill="${bandInk}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${label}</text>`
  }

  let stars = ''
  if (design.stars && full) {
    const xs = design.stars === 1 ? [50] : [38, 50, 62]
    const starInk = design.field === 'chief' ? inkOn(trim) : ink
    stars = xs
      .map((x) => `<path d="${EMBLEMS.star}" fill="${starInk}" transform="translate(${x} 18) scale(0.2) translate(-50 -54)"/>`)
      .join('')
  }

  // Outline last: a white rim and a dark keyline inside it, so the crest
  // separates from any background — the club band, the pitch, a white card.
  const rim = shade(base, 0.55)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 110 126" role="img" aria-label="${escape(input.name)} crest">` +
    `<defs><clipPath id="${clip}"><path d="${shapePath}"/></clipPath></defs>` +
    `<path d="${shapePath}" fill="${WHITE_HEX}" stroke="${WHITE_HEX}" stroke-width="${full ? 7 : 9}" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${clip})">` +
    `<rect x="0" y="0" width="100" height="116" fill="${base}"/>` +
    fieldSvg(design.field, shapePath, base, trim) +
    // A soft light from the top, so the crest reads as an object.
    `<path d="M0 0H100V46C70 38 30 38 0 46Z" fill="#ffffff" opacity="0.1"/>` +
    emblem +
    ribbon +
    stars +
    `</g>` +
    `<path d="${shapePath}" fill="none" stroke="${rim}" stroke-width="2" stroke-linejoin="round"/>` +
    `</svg>`
  )
}
