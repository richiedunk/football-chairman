/**
 * Club colour, made safe to put text on.
 *
 * Every club in the pack carries a real primary and secondary. Painting a
 * header with the raw primary breaks on the third club you try: Norwich yellow
 * and Real Madrid white take no white text, and Newcastle black disappears
 * into the ground the app is already painted with.
 *
 * So the header band is the club's colour pushed into a narrow band of dark
 * lightness, and an untouched strip of the real colour sits beneath it. The
 * identity is still on screen; the text is still legible. Nothing else in the
 * app is club-coloured, so no club can break the palette.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

/** Lightness window the band is squeezed into. Below this white text starts */
/** to glare; above it, contrast drops under 4.5:1 for the lighter hues. */
const BAND_MIN_L = 0.1
const BAND_MAX_L = 0.17

/** Saturation ceiling. A fully saturated dark vibrates against white text. */
const BAND_MAX_S = 0.8

/** Above this the colour cannot be darkened without losing its identity */
/** entirely — white and near-white read as grey once clamped, so the club's */
/** secondary is used for the band instead. */
const TOO_LIGHT = 0.85

/** A primary this dark is already the ground colour. Lift rather than clamp. */
const TOO_DARK = 0.09

export function parseHex(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return '#' + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return { r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255 }
}

/** Relative luminance, WCAG 2.1. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (n: number) => {
    const c = n / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export interface ClubBand {
  /** The header background. Always dark enough for white text. */
  band: string
  /** The untouched club colour, shown as a strip under the band. */
  strip: string
  /** Present when the strip should be split — a two-colour club, or one */
  /** whose primary was too light to use for the band. */
  stripAlt?: string
}

/**
 * The one function. Takes a club's real colours, returns what to paint.
 *
 * The band never carries the raw colour, and the strip is never adjusted:
 * between them the header is both readable and recognisably the club's.
 */
export function headerBand(primary: string, secondary?: string): ClubBand {
  const fallback: ClubBand = { band: '#1a1d23', strip: '#3a3d45' }

  const rgb = parseHex(primary)
  if (!rgb) return fallback

  const hsl = rgbToHsl(rgb)
  const secRgb = secondary ? parseHex(secondary) : null
  const secHsl = secRgb ? rgbToHsl(secRgb) : null

  // A white or near-white primary cannot be darkened and stay itself: clamped,
  // it is indistinguishable from grey. Clubs that play in white have a real
  // second colour, and that is what people picture the club in anyway.
  const source = hsl.l > TOO_LIGHT && secHsl && secHsl.l <= TOO_LIGHT ? secHsl : hsl

  const band: Hsl = {
    h: source.h,
    s: Math.min(source.s, BAND_MAX_S),
    l:
      source.l < TOO_DARK
        ? // Clamping a near-black downwards would put the header on top of the
          // app's own ground. Lift it instead, so the band still reads as a
          // surface rather than a hole.
          BAND_MIN_L + 0.04
        : Math.max(BAND_MIN_L, Math.min(BAND_MAX_L, source.l)),
  }

  // A very dark primary that is also unsaturated (black kits) comes back as a
  // flat grey. Give it the faintest cast so it is a colour, not a smudge.
  if (source.l < TOO_DARK && band.s < 0.06) band.s = 0.06

  const out: ClubBand = {
    band: toHex(hslToRgb(band)),
    strip: primary,
  }

  // Two-colour clubs, and any club whose primary was too light to use, get a
  // split strip so the pairing that actually identifies them is visible.
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) {
    const bothStrong = secHsl && (hsl.l > TOO_LIGHT || Math.abs(hsl.l - secHsl.l) > 0.3)
    if (bothStrong) out.stripAlt = secondary
  }

  return out
}

/** True when white text on this band clears WCAG AA for body text. */
export function bandIsReadable(band: string): boolean {
  const rgb = parseHex(band)
  if (!rgb) return false
  return contrast(rgb, { r: 255, g: 255, b: 255 }) >= 4.5
}
