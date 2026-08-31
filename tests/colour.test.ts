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

  it('round-trips a colour lighter than mid-grey', () => {
    // The six above are all at or below l=0.5, which leaves the other half of
    // the saturation formula in rgbToHsl — and the other half of the q in
    // hslToRgb — never checked against a known answer.
    for (const hex of ['#FEBE10', '#9FD5F0', '#F5A3C7', '#B497D6']) {
      expect(rgbToHsl(parseHex(hex)!).l).toBeGreaterThan(0.5)
      expect(toHex(hslToRgb(rgbToHsl(parseHex(hex)!))).toLowerCase()).toBe(hex.toLowerCase())
    }
  })

  it('reports a hue on the wheel, not one wrapped off the end of it', () => {
    // A colour whose red channel leads and whose blue beats its green sits in
    // the last sixth of the wheel, which is the one place the hue arithmetic
    // has to wrap. The round-trip cannot see a mistake here — hslToRgb
    // normalises a negative hue back on the way out — so it is asserted.
    for (const [hex, h] of [['#C2185B', 0.934], ['#E91E63', 0.943], ['#241F20', 0.967]] as const) {
      expect(rgbToHsl(parseHex(hex)!).h).toBeCloseTo(h, 2)
    }
    // And the same red-led sixth on the other side of the wrap, which must not
    // be wrapped: an orange sits just after zero, not just before one.
    expect(rgbToHsl(parseHex('#FF6600')!).h).toBeCloseTo(0.067, 2)
  })

  it('accepts shorthand and rejects nonsense', () => {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseHex('nope')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('rejects a hex with anything either side of the six digits', () => {
    // Without both anchors an eight-digit value with an alpha pair reads as a
    // valid colour and is silently truncated, and a colour with junk in front
    // of it parses from the middle.
    expect(parseHex('#DA291CFF')).toBeNull()
    expect(parseHex('zz123456')).toBeNull()
    expect(parseHex('12#3456')).toBeNull()
    expect(parseHex('#12345678')).toBeNull()
  })

  it('takes a hex with whitespace around it', () => {
    expect(parseHex('  #DA291C  ')).toEqual(parseHex('#DA291C'))
  })

  it('computes contrast the way WCAG does', () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, WHITE)).toBeCloseTo(21, 1)
    expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it('gives the same ratio whichever way round the pair is given', () => {
    // Every call in the app happens to pass the darker colour first, so the
    // ordering of the pair inside contrast() is otherwise never exercised —
    // and getting it wrong returns the reciprocal, which is silently plausible.
    expect(contrast(WHITE, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 1)
    expect(contrast(WHITE, { r: 118, g: 118, b: 118 })).toBeCloseTo(
      contrast({ r: 118, g: 118, b: 118 }, WHITE),
      10,
    )
  })
})

describe('bandIsReadable', () => {
  // Every other assertion in this file leans on this function returning the
  // truth. Asserting only that it says yes would leave a version that always
  // says yes indistinguishable from a correct one — and that version passes
  // the whole 540-club sweep below.
  it('says no to a band white text would disappear on', () => {
    expect(bandIsReadable('#FFFFFF')).toBe(false)
    expect(bandIsReadable('#8899AA')).toBe(false)
    expect(bandIsReadable('#A8A196')).toBe(false)
  })

  it('says yes only once the ratio is actually there', () => {
    expect(bandIsReadable('#767676')).toBe(true)
    expect(bandIsReadable('#777777')).toBe(false)
  })

  it('says no to something that is not a colour', () => {
    expect(bandIsReadable('not a colour')).toBe(false)
    expect(bandIsReadable('')).toBe(false)
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

  it('builds the band from the primary while the primary can carry it', () => {
    // Only a primary too light to darken hands the band over to the secondary.
    // Nothing else does, and a version that always preferred the secondary
    // would still produce a readable band for all 540 clubs — so the band's
    // hue is checked against the primary it came from.
    const red = headerBand('#DA291C', '#034694')
    expect(rgbToHsl(parseHex(red.band)!).h).toBeCloseTo(rgbToHsl(parseHex('#DA291C')!).h, 2)
    const blue = headerBand('#034694', '#DA291C')
    expect(rgbToHsl(parseHex(blue.band)!).h).toBeCloseTo(rgbToHsl(parseHex('#034694')!).h, 2)
  })

  it('holds the band under the saturation ceiling without inventing colour', () => {
    // A fully saturated dark vibrates against white text, so it is capped —
    // but the cap is a ceiling, not a target. A muted club stays muted.
    expect(rgbToHsl(parseHex(headerBand('#034694').band)!).s).toBeLessThanOrEqual(0.81)
    expect(rgbToHsl(parseHex(headerBand('#FFF200').band)!).s).toBeLessThanOrEqual(0.81)
    expect(rgbToHsl(parseHex(headerBand('#A8A196').band)!).s).toBeLessThan(0.2)
    expect(rgbToHsl(parseHex(headerBand('#6B705C').band)!).s).toBeLessThan(0.2)
  })

  it('leaves the primary alone when the secondary is no more usable than it', () => {
    // The fall-through exists because a white primary cannot be darkened and
    // stay itself. A near-white secondary cannot either, so there is nothing
    // to fall through to and the clamped primary — a neutral — is what is left.
    expect(headerBand('#FFFFFF', '#FFF0F0').band).toBe(headerBand('#FFFFFF').band)
    expect(rgbToHsl(parseHex(headerBand('#FFFFFF', '#FFF0F0').band)!).s).toBe(0)
  })

  it('lifts a near-black primary instead of clamping it into the ground', () => {
    // #241F20 is l=0.13 — dark, but above TOO_DARK, so it is clamped rather
    // than lifted and says nothing about the lift. #101010 is l=0.06 and is.
    const lifted = rgbToHsl(parseHex(headerBand('#101010').band)!).l
    const clamped = rgbToHsl(parseHex(headerBand('#181818').band)!).l
    expect(lifted).toBeCloseTo(0.14, 2)
    expect(clamped).toBeCloseTo(0.1, 2)
    // The lift is a lift: a near-black must come back lighter than a colour
    // that merely met the floor, or the header sits on the app's own ground.
    expect(lifted).toBeGreaterThan(clamped)
    expect(bandIsReadable(headerBand('#101010').band)).toBe(true)
  })

  it('keeps a colour that is already in the band where it is', () => {
    const l = rgbToHsl(parseHex(headerBand('#123A1E').band)!).l
    expect(l).toBeCloseTo(rgbToHsl(parseHex('#123A1E')!).l, 2)
  })

  it('gives a black kit a cast rather than a flat grey', () => {
    const { band } = headerBand('#000000')
    expect(rgbToHsl(parseHex(band)!).s).toBeGreaterThan(0)
  })

  it('does not flatten a near-black that already has a colour in it', () => {
    // The cast is a floor for black kits, not a level for every dark one. A
    // very dark navy is already a colour and must not be levelled down to it.
    expect(rgbToHsl(parseHex(headerBand('#020304').band)!).s).toBeGreaterThan(0.3)
    expect(rgbToHsl(parseHex(headerBand('#050D18').band)!).s).toBeGreaterThan(0.3)
  })

  it('does not cast a grey that was never near-black', () => {
    // The cast exists for black kits. A mid grey is a colour the club chose,
    // and giving it a hue it does not have is the same fault in the other
    // direction.
    expect(rgbToHsl(parseHex(headerBand('#8A8A8C').band)!).s).toBeLessThan(0.05)
  })

  it('barely moves a colour already in the band', () => {
    const { band } = headerBand('#123A1E')
    expect(bandIsReadable(band)).toBe(true)
  })

  it('splits the strip only for a pair that reads as two colours', () => {
    // The gate is a real difference in lightness, not merely a second hex:
    // two shades of the same red would render as a strip with an invisible
    // seam in it. This is the behaviour as built — note that it means a
    // red-and-blue club, equally dark, does not get a split either.
    expect(headerBand('#DA291C', '#D02015').stripAlt).toBeUndefined()
    expect(headerBand('#DA291C', '#DA291C').stripAlt).toBeUndefined()
    expect(headerBand('#DA291C', '#da291c').stripAlt).toBeUndefined()
    expect(headerBand('#DA291C').stripAlt).toBeUndefined()
    // Same colour twice in different case is one colour, including for a club
    // that would otherwise qualify for the split on lightness alone.
    expect(headerBand('#FFFFFF', '#ffffff').stripAlt).toBeUndefined()
    expect(headerBand('#DA291C', '#FFFFFF').stripAlt).toBe('#FFFFFF')
    // A club that plays in white shows its second colour whatever that colour
    // is, because the white half of the strip is the only thing the band did
    // not get to keep.
    expect(headerBand('#FFFFFF', '#F0F0A0').stripAlt).toBe('#F0F0A0')
    expect(headerBand('#000000', '#FFFFFF').stripAlt).toBe('#FFFFFF')
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
