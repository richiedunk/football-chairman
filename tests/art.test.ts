import { describe, expect, it } from 'vitest'
import { crestDesign, crestSvg, initials } from '../src/ui/art/crest'
import { kitPattern, kitSvg } from '../src/ui/art/kit'
import { clubPair, inkOn, tooClose } from '../src/ui/art/palette'
import { hashString, stream } from '../src/ui/art/seed'
import { REAL_CLUBS } from '../src/engine/world/realClubs'

const clubs = Object.values(REAL_CLUBS).flat(2)

describe('seed', () => {
  it('hashes the same string to the same number', () => {
    expect(hashString('c12')).toBe(hashString('c12'))
    expect(hashString('c12')).not.toBe(hashString('c13'))
  })

  it('streams deterministically in [0, 1)', () => {
    const a = stream(42)
    const b = stream(42)
    for (let i = 0; i < 50; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('palette', () => {
  it('picks white ink on dark colours and dark ink on light ones', () => {
    expect(inkOn('#0a1f5c')).toBe('#ffffff')
    expect(inkOn('#ffe600')).toBe('#0e1116')
  })

  it('never returns a pair that merges', () => {
    for (const c of clubs) {
      const pair = clubPair(c.primary, c.secondary)
      expect(tooClose(pair.base, pair.trim), `${c.name} ${c.primary}/${c.secondary}`).toBe(false)
    }
  })

  it('survives colours that are not colours', () => {
    const pair = clubPair('not a colour', '')
    expect(pair.base).toMatch(/^#[0-9a-f]{6}$/i)
    expect(tooClose(pair.base, pair.trim)).toBe(false)
  })
})

describe('crests', () => {
  it('are a pure function of the club id', () => {
    const input = { id: 'c7', name: 'Crewe', primary: '#d71920', secondary: '#ffffff' }
    expect(crestSvg(input)).toBe(crestSvg(input))
    expect(crestDesign('c7')).toEqual(crestDesign('c7'))
  })

  it('vary across a league', () => {
    const designs = new Set(clubs.slice(0, 60).map((_, i) => JSON.stringify(crestDesign(`c${i}`))))
    expect(designs.size).toBeGreaterThan(40)
  })

  it('escape the club name', () => {
    const svg = crestSvg({ id: 'x', name: 'Brighton & <Hove>', primary: '#0057b8', secondary: '#ffffff' })
    expect(svg).not.toContain('<Hove>')
    expect(svg).not.toMatch(/& /)
  })

  it('drop the ribbon at small sizes', () => {
    const input = { id: 'c1', name: 'Arsenal', primary: '#ef0107', secondary: '#ffffff' }
    expect(crestSvg({ ...input, detail: 'full' })).toContain('ARSENAL')
    expect(crestSvg({ ...input, detail: 'mark' })).not.toContain('ARSENAL')
  })

  it('draw every club in the pack', () => {
    clubs.forEach((c, i) => {
      const svg = crestSvg({ id: `c${i}`, name: c.shortName, primary: c.primary, secondary: c.secondary })
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).not.toContain('undefined')
      expect(svg).not.toContain('NaN')
    })
  })
})

describe('initials', () => {
  it('skip the filler words', () => {
    expect(initials('AFC Wimbledon')).toBe('W')
    expect(initials('Manchester United')).toBe('MU')
    expect(initials('Brighton & Hove Albion')).toBe('BHA')
    expect(initials('FC')).toBe('F')
  })
})

describe('kits', () => {
  it('are a pure function of the club id', () => {
    expect(kitPattern('c3')).toBe(kitPattern('c3'))
    const input = { id: 'c3', primary: '#6c1d45', secondary: '#99d6ea', number: 9 }
    expect(kitSvg(input)).toBe(kitSvg(input))
  })

  it('print only a sanitised number', () => {
    const svg = kitSvg({ id: 'c3', primary: '#000000', secondary: '#ffffff', number: '<b>10' })
    expect(svg).not.toContain('<b>')
    expect(svg).toContain('>b10<')
  })

  it('swap colours for the away kit', () => {
    const home = kitSvg({ id: 'c3', primary: '#d71920', secondary: '#ffffff' })
    const away = kitSvg({ id: 'c3', primary: '#d71920', secondary: '#ffffff', away: true })
    expect(home).not.toBe(away)
  })
})

describe('faces', () => {
  it('are a pure function of the person', async () => {
    const { faceSvg, faceDesign } = await import('../src/ui/art/face')
    const input = { id: 'p42', age: 27, kind: 'player' as const, primary: '#d71920', secondary: '#ffffff' }
    expect(faceSvg(input)).toBe(faceSvg(input))
    expect(faceDesign('p42', 27)).toEqual(faceDesign('p42', 27))
  })

  it('grey with age more often than not', async () => {
    const { faceDesign } = await import('../src/ui/art/face')
    const grey = (age: number) =>
      Array.from({ length: 200 }, (_, i) => faceDesign(`s${i}`, age)).filter((d) => ['#9a9a9a', '#dedede'].includes(d.hair)).length
    expect(grey(22)).toBe(0)
    expect(grey(60)).toBeGreaterThan(120)
  })

  it('never draws a broken path', async () => {
    const { faceSvg } = await import('../src/ui/art/face')
    for (let i = 0; i < 300; i++) {
      const svg = faceSvg({ id: `x${i}`, age: 16 + (i % 50), kind: i % 3 ? 'player' : 'staff' })
      expect(svg).not.toContain('NaN')
      expect(svg).not.toContain('undefined')
    }
  })
})
