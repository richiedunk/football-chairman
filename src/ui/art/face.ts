import { clubPair, shade } from './palette'
import { hashString, stream, weighted } from './seed'

/**
 * Generated portraits.
 *
 * A name and a row of numbers is a spreadsheet entry; a face is a person you
 * signed. These are simple — a head, hair, brows, a beard or not, the club's
 * shirt at the collar — and deterministic from the person's id, so the same
 * player has the same face on every screen and in every save.
 *
 * Age is the one thing the picture reads from the data: hair greys and
 * recedes, and lines appear, as a player gets older. Nothing else about a
 * person's background is inferred from their name or nationality; skin tone
 * and hair are drawn from the id alone.
 */

export interface FaceInput {
  id: string
  age: number
  /** Players wear the club's shirt; staff wear a jacket and the club's tie. */
  kind: 'player' | 'staff'
  primary?: string
  secondary?: string
}

const SKIN = ['#f3d6c1', '#e8bf9e', '#d9a57f', '#c38863', '#a86f4c', '#8a5638', '#6b4029', '#4f2f1f'] as const
const HAIR = {
  black: '#1b1714',
  darkBrown: '#3b2a1f',
  brown: '#5e4130',
  lightBrown: '#8a6446',
  blond: '#c9a468',
  ginger: '#a8552c',
  grey: '#9a9a9a',
  white: '#dedede',
} as const

type HairStyle = 'bald' | 'buzz' | 'short' | 'sidePart' | 'quiff' | 'curly' | 'afro' | 'long' | 'receding'
type Beard = 'none' | 'stubble' | 'full' | 'moustache' | 'goatee'

export interface FaceDesign {
  skin: string
  hair: string
  style: HairStyle
  beard: Beard
  /** Head width, as a radius. */
  width: number
  brows: number
}

export function faceDesign(id: string, age: number): FaceDesign {
  const rand = stream(hashString(`face:${id}`))
  const skin = SKIN[Math.floor(rand() * SKIN.length)]

  // Colour first, then age takes it. Gently: a squad is sixteen to
  // thirty-six, and the first pass greyed and balded players from 34, which
  // made a dressing room look like a bowls club. Grey is for the coaching
  // staff, mostly, and white for the ones past sixty.
  let hair: string = weighted(rand, [
    [HAIR.black, 5],
    [HAIR.darkBrown, 5],
    [HAIR.brown, 4],
    [HAIR.lightBrown, 2],
    [HAIR.blond, 2],
    [HAIR.ginger, 1],
  ] as const)
  const greying = age >= 60 ? 0.75 : age >= 52 ? 0.45 : age >= 44 ? 0.2 : age >= 38 ? 0.05 : 0
  const greyRoll = rand()
  if (greyRoll < greying) hair = age >= 64 && greyRoll < greying * 0.4 ? HAIR.white : HAIR.grey

  let style = weighted<HairStyle>(rand, [
    ['buzz', 4],
    ['short', 6],
    ['sidePart', 3],
    ['quiff', 3],
    ['curly', 2],
    ['afro', 1],
    ['long', 1],
    ['bald', 1],
  ])
  const recedes = rand() < (age >= 58 ? 0.4 : age >= 48 ? 0.22 : age >= 38 ? 0.06 : 0)
  if (recedes && style !== 'bald' && style !== 'afro') style = 'receding'

  const beard = weighted<Beard>(rand, [
    ['none', age < 21 ? 12 : 6],
    ['stubble', 4],
    ['full', age < 21 ? 0 : 2],
    ['moustache', age >= 45 ? 1 : 0.1],
    ['goatee', 1],
  ])

  return { skin, hair, style, beard, width: 17 + rand() * 3, brows: rand() }
}

/**
 * The head is an ellipse whose crown sits at about y = 17. A cubic from ear
 * to ear peaks at a quarter of the ends plus three quarters of the controls,
 * so the outer controls are pulled up to 5-7: anything lower and the crown
 * shows above the hair, which reads as a bald head in a headband.
 */
function hairSvg(style: HairStyle, hair: string, w: number): string {
  const l = 50 - w
  const r = 50 + w
  switch (style) {
    case 'bald':
      return ''
    case 'buzz':
      // A close crop: the whole top of the head, thin, down to a natural
      // hairline — the first pass drew a crescent that read as a headband.
      return `<path d="M${l} 44C${l - 1} 7 ${r + 1} 7 ${r} 44C${r - 1} 35 ${r - 3} 29 50 28C${l + 3} 29 ${l + 1} 35 ${l} 44Z" fill="${hair}" opacity="0.62"/>`
    case 'short':
      return `<path d="M${l - 1} 42C${l - 3} 6 ${r + 3} 6 ${r + 1} 42C${r - 2} 31 ${l + 12} 28 ${l - 1} 42Z" fill="${hair}"/>`
    case 'sidePart':
      return `<path d="M${l - 1} 43C${l - 4} 5 ${r + 4} 5 ${r + 1} 43C${r} 32 ${r - 8} 27 ${46} 27C${l + 8} 29 ${l + 1} 33 ${l - 1} 43Z" fill="${hair}"/><path d="M46 21V27" stroke="${shade(hair, 0.4)}" stroke-width="0.8"/>`
    case 'quiff':
      return `<path d="M${l - 1} 42C${l - 4} 20 ${l + 6} 12 52 13C${r + 2} 13 ${r + 4} 24 ${r + 1} 42C${r - 2} 32 ${l + 10} 28 ${l - 1} 42Z" fill="${hair}"/>`
    case 'curly': {
      const blobs: string[] = []
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI
        blobs.push(`<circle cx="${(50 + Math.cos(a) * (w + 1)).toFixed(1)}" cy="${(38 + Math.sin(a) * 19).toFixed(1)}" r="5.5" fill="${hair}"/>`)
      }
      return blobs.join('') + `<ellipse cx="50" cy="26" rx="${w - 2}" ry="8" fill="${hair}"/>`
    }
    case 'afro':
      return `<ellipse cx="50" cy="33" rx="${w + 8}" ry="21" fill="${hair}"/>`
    case 'long':
      return `<path d="M${l - 2} 58C${l - 6} 30 ${l} 16 50 16C${r} 16 ${r + 6} 30 ${r + 2} 58L${r - 2} 58C${r} 40 ${r - 4} 30 50 29C${l + 4} 30 ${l} 40 ${l + 2} 58Z" fill="${hair}"/>`
    case 'receding':
      // Short on top with the temples gone back: a high M-shaped hairline,
      // not the two side tufts of the first pass, which read as eighty.
      return `<path d="M${l - 1} 42C${l - 3} 6 ${r + 3} 6 ${r + 1} 42C${r} 34 ${r - 2} 28 ${r - 6} 26C${56} 25 53 28 50 27C47 28 44 25 ${l + 6} 26C${l + 2} 28 ${l} 34 ${l - 1} 42Z" fill="${hair}"/>`
  }
}

/** Hair drawn behind the head, so the face sits in front of it. */
function behind(style: HairStyle): boolean {
  return style === 'afro' || style === 'long'
}

function beardSvg(beard: Beard, hair: string, skin: string, w: number): string {
  const l = 50 - w
  const r = 50 + w
  switch (beard) {
    case 'none':
      return ''
    case 'stubble':
      return `<path d="M${l + 1} 46C${l + 2} 62 ${r - 2} 62 ${r - 1} 46C${r - 3} 58 ${l + 3} 58 ${l + 1} 46Z" fill="${shade(skin, 0.45)}" opacity="0.35"/><path d="M${l + 3} 50C${l + 6} 66 ${r - 6} 66 ${r - 3} 50C${r - 6} 60 ${l + 6} 60 ${l + 3} 50Z" fill="${shade(skin, 0.5)}" opacity="0.3"/>`
    case 'full':
      return `<path d="M${l} 42C${l} 64 ${r} 64 ${r} 42C${r - 2} 52 ${r - 6} 55 50 55C${l + 6} 55 ${l + 2} 52 ${l} 42Z" fill="${hair}"/><path d="M${l + 3} 44C${l + 3} 68 ${r - 3} 68 ${r - 3} 44C${r - 5} 58 ${l + 5} 58 ${l + 3} 44Z" fill="${hair}"/>`
    case 'moustache':
      return `<path d="M43 51C46 49 49 49.5 50 50.5C51 49.5 54 49 57 51C54 52.5 46 52.5 43 51Z" fill="${hair}"/>`
    case 'goatee':
      return `<path d="M44 51C47 49.5 53 49.5 56 51C55 52 45 52 44 51Z" fill="${hair}"/><path d="M46 56C46 62 54 62 54 56C52 58 48 58 46 56Z" fill="${hair}"/>`
  }
}

export function faceSvg(input: FaceInput): string {
  const d = faceDesign(input.id, input.age)
  const w = d.width
  const ink = '#1a1411'
  const cheek = shade(d.skin, 0.12)
  const { base, trim } = clubPair(input.primary ?? '#3a4450', input.secondary ?? '#ffffff')

  // The body: the club's shirt with a trim collar, or a dark jacket, white
  // shirt and a tie in the club's colour.
  const body =
    input.kind === 'player'
      ? `<path d="M6 100C8 80 26 70 50 70C74 70 92 80 94 100Z" fill="${base}"/>` +
        `<path d="M40 70.5C44 77 56 77 60 70.5" fill="none" stroke="${trim}" stroke-width="3"/>`
      : `<path d="M6 100C8 80 26 70 50 70C74 70 92 80 94 100Z" fill="#1d232c"/>` +
        `<path d="M41 70L50 88L59 70Z" fill="#f2f4f6"/>` +
        `<path d="M48.2 74H51.8L53 88L50 92L47 88Z" fill="${base}"/>` +
        `<path d="M41 70L50 88L44 100H34Z M59 70L50 88L56 100H66Z" fill="#252c36"/>`

  const brows = 37 + d.brows * 2
  // Lines only on the genuinely older: a forehead crease past fifty, the
  // cheek lines past sixty. Nobody on a playing staff gets either.
  const lines =
    input.age >= 50
      ? `<path d="M42 ${brows - 4}H58" stroke="${shade(d.skin, 0.3)}" stroke-width="0.6" opacity="0.45"/>` +
        (input.age >= 60 ? `<path d="M38 50C39 53 40 54 41 55M62 50C61 53 60 54 59 55" stroke="${shade(d.skin, 0.3)}" stroke-width="0.8" fill="none" opacity="0.7"/>` : '')
      : ''

  return (
    // Cropped to head and shoulders: the full 100-unit frame left the face a
    // third of a 40px circle.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="11 12 78 78" aria-hidden="true">` +
    (behind(d.style) ? hairSvg(d.style, d.hair, w) : '') +
    body +
    `<rect x="44" y="56" width="12" height="17" rx="4" fill="${cheek}"/>` +
    `<ellipse cx="${50 - w}" cy="45" rx="3.2" ry="5" fill="${cheek}"/>` +
    `<ellipse cx="${50 + w}" cy="45" rx="3.2" ry="5" fill="${cheek}"/>` +
    `<ellipse cx="50" cy="42" rx="${w}" ry="${w + 5}" fill="${d.skin}"/>` +
    beardSvg(d.beard, d.hair, d.skin, w) +
    (behind(d.style) ? '' : hairSvg(d.style, d.hair, w)) +
    `<path d="M${42 - d.brows} ${brows}L47 ${brows - 0.8}M53 ${brows - 0.8}L${58 + d.brows} ${brows}" stroke="${d.style === 'bald' ? shade(d.skin, 0.55) : shade(d.hair, 0.1)}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<ellipse cx="44.5" cy="${brows + 4}" rx="1.6" ry="1.8" fill="${ink}"/>` +
    `<ellipse cx="55.5" cy="${brows + 4}" rx="1.6" ry="1.8" fill="${ink}"/>` +
    `<path d="M50 ${brows + 5}L48.5 ${brows + 11}H51" fill="none" stroke="${shade(d.skin, 0.35)}" stroke-width="1" stroke-linecap="round"/>` +
    `<path d="M46 ${brows + 16}C48 ${brows + 17.4} 52 ${brows + 17.4} 54 ${brows + 16}" fill="none" stroke="${shade(d.skin, 0.5)}" stroke-width="1.3" stroke-linecap="round"/>` +
    lines +
    `</svg>`
  )
}

