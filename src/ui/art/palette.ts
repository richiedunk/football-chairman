import { contrast, hslToRgb, parseHex, rgbToHsl, toHex } from '../colour'

/**
 * Colour decisions shared by the crest and kit generators.
 *
 * A club's two colours come from the data pack and are not always usable as a
 * pair: plenty of clubs are listed as red-and-red, white-and-white, or two
 * blues a shade apart. A crest painted in two colours nobody can tell apart is
 * a blob, so the generators ask here for a pair that actually separates.
 */

const WHITE = { r: 255, g: 255, b: 255 }
const INK = { r: 14, g: 17, b: 22 }

export const INK_HEX = '#0e1116'
export const WHITE_HEX = '#ffffff'

function safe(hex: string, fallback: string): string {
  return parseHex(hex) ? hex : fallback
}

/** White or near-black, whichever reads better on this colour. */
export function inkOn(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return WHITE_HEX
  return contrast(rgb, WHITE) >= contrast(rgb, INK) ? WHITE_HEX : INK_HEX
}

/** True when two colours are close enough to merge at a glance. */
export function tooClose(a: string, b: string): boolean {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return true
  return contrast(ra, rb) < 1.6
}

/** A darker shade of a colour, for outlines and shadows. */
export function shade(hex: string, amount = 0.35): string {
  const rgb = parseHex(hex)
  if (!rgb) return INK_HEX
  const hsl = rgbToHsl(rgb)
  return toHex(hslToRgb({ ...hsl, l: Math.max(0, hsl.l * (1 - amount)) }))
}

export interface Pair {
  /** The body colour. */
  base: string
  /** The second colour, guaranteed to separate from the base. */
  trim: string
  /** Text and emblem colour on the base. */
  ink: string
}

/**
 * The club's colours as a usable pair. The primary is kept as the base; when
 * the secondary will not separate from it, white or ink stands in — which is
 * what the club's own shirt usually does anyway.
 */
export function clubPair(primary: string, secondary: string): Pair {
  const base = safe(primary, '#3a3f48')
  let trim = safe(secondary, WHITE_HEX)
  if (tooClose(base, trim)) trim = inkOn(base) === WHITE_HEX ? WHITE_HEX : INK_HEX
  return { base, trim, ink: inkOn(base) }
}
