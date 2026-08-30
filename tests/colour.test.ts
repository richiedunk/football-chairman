import { describe, expect, it } from 'vitest'
import {
  bandIsReadable,
  contrast,
  headerBand,
  hslToRgb,
  parseHex,
  rgbToHsl,
  toHex,
} from '../src/ui/colour'
import { REAL_CLUBS } from '../src/engine/world/realClubs'

const WHITE = { r: 255, g: 255, b: 255 }

describe('colour conversion', () => {
  it('round-trips through HSL', () => {
    for (const hex of ['#DA291C', '#034694', '#FFF200', '#241F20', '#FFFFFF', '#7A9E3B']) {
      const rgb = parseHex(hex)!
      expect(toHex(hslToRgb(rgbToHsl(rgb))).toLowerCase()).toBe(hex.toLowerCase())
    }
  })

  it('accepts shorthand and rejects nonsense', () => {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseHex('nope')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('computes contrast the way WCAG does', () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, WHITE)).toBeCloseTo(21, 1)
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5)
  })
})

describe('headerBand', () => {
  it('keeps the true colour as the strip, untouched', () => {
    expect(headerBand('#DA291C', '#FBE122').strip).toBe('#DA291C')
  })

  it('darkens a bright primary enough for white text', () => {
    const { band } = headerBand('#DA291C')
    expect(bandIsReadable(band)).toBe(true)
    expect(rgbToHsl(parseHex(band)!).l).toBeLessThan(0.2)
  })

  it('handles yellow, the case that kills naive tinting', () => {
    const { band } = headerBand('#FFF200')
    expect(bandIsReadable(band)).toBe(true)
    // Still recognisably yellow-hued, not a neutral grey.
    expect(rgbToHsl(parseHex(band)!).s).toBeGreaterThan(0.5)
  })

  it('falls through to the secondary when the primary is white', () => {
    const white = headerBand('#FFFFFF', '#FEBE10')
    const gold = headerBand('#FEBE10')
    expect(white.band).toBe(gold.band)
    // The white is still shown, as half the strip.
    expect(white.strip).toBe('#FFFFFF')
    expect(white.stripAlt).toBe('#FEBE10')
  })

  it('lifts a near-black primary instead of clamping it into the ground', () => {
    const { band } = headerBand('#241F20', '#FFFFFF')
    const l = rgbToHsl(parseHex(band)!).l
    expect(l).toBeGreaterThan(0.1)
    expect(bandIsReadable(band)).toBe(true)
  })

  it('gives a black kit a cast rather than a flat grey', () => {
    const { band } = headerBand('#000000')
    expect(rgbToHsl(parseHex(band)!).s).toBeGreaterThan(0)
  })

  it('barely moves a colour already in the band', () => {
    const { band } = headerBand('#123A1E')
    expect(bandIsReadable(band)).toBe(true)
  })

  it('survives a club with no usable colours at all', () => {
    const { band, strip } = headerBand('not a colour')
    expect(bandIsReadable(band)).toBe(true)
    expect(strip).toBeTruthy()
  })
})

describe('every club in the pack', () => {
  // The rule is only worth having if it holds for all 540, not for the six
  // that were drawn. A single unreadable header is a bug in the function.
  const all = Object.values(REAL_CLUBS)
    .flat(2)
    .filter((c) => c && c.primary)

  it('covers a real pack, not an empty one', () => {
    expect(all.length).toBeGreaterThan(400)
  })

  it('produces a readable band for every one of them', () => {
    const failures = all
      .map((c) => ({ name: c.name, band: headerBand(c.primary, c.secondary).band }))
      .filter((r) => !bandIsReadable(r.band))
    expect(failures).toEqual([])
  })

  it('never returns a band lighter than the text it carries', () => {
    for (const club of all) {
      const { band } = headerBand(club.primary, club.secondary)
      expect(rgbToHsl(parseHex(band)!).l).toBeLessThan(0.25)
    }
  })
})
