import { describe, expect, it } from 'vitest'
import { PUBLIC_ORIGIN, originFrom } from '../src/ui/share/share'
import { challengeLink, challengeFromUrl } from '../src/engine/systems/challenge'
import type { Challenge } from '../src/engine/systems/challenge'

/**
 * Where a challenge link points.
 *
 * Only a page served over http or https can put its own address in somebody
 * else's message. Every other shell the game runs in has an origin that is
 * useless to a recipient, and the desktop one is actively dangerous: a page
 * loaded from disk reports its origin as the *string* "null", which is a
 * perfectly valid string and would have been concatenated into a link reading
 * `null/#/?challenge=…` without anything throwing.
 */
describe('the origin a link is built on', () => {
  it('uses the real address when there is one', () => {
    expect(originFrom({
      protocol: 'https:',
      origin: 'https://undisclosedfootball.com',
      pathname: '/',
    })).toBe('https://undisclosedfootball.com/')
  })

  it('keeps a subpath, for a build served from one', () => {
    expect(originFrom({
      protocol: 'https:',
      origin: 'https://example.com',
      pathname: '/play/',
    })).toBe('https://example.com/play/')
  })

  it('drops index.html, which nobody types', () => {
    expect(originFrom({
      protocol: 'https:',
      origin: 'https://example.com',
      pathname: '/play/index.html',
    })).toBe('https://example.com/play/')
  })

  it('falls back to the public site for a page loaded from disk', () => {
    // The desktop shell. Measured rather than assumed: Electron reports
    // `file://` here, and other engines report the string "null". Both are
    // valid strings that would have been concatenated into a link without
    // anything throwing, which is why this is checked on the protocol.
    for (const origin of ['file://', 'null']) {
      expect(originFrom({
        protocol: 'file:',
        origin,
        pathname: '/opt/Undisclosed Football/dist/index.html',
      })).toBe(PUBLIC_ORIGIN)
    }
  })

  it('falls back for the phone shells too', () => {
    for (const protocol of ['capacitor:', 'ionic:', 'app:']) {
      expect(originFrom({ protocol, origin: 'https://localhost', pathname: '/' }))
        .toBe(PUBLIC_ORIGIN)
    }
  })

  it('refuses a loopback address, which only reaches the sender', () => {
    // The phone builds serve themselves over https://localhost, so this is
    // what makes the platform check unnecessary. It covers a developer's own
    // preview for the same reason: a link to 127.0.0.1 is a link to nobody.
    for (const origin of [
      'https://localhost', 'http://localhost:5173',
      'http://127.0.0.1:4173', 'http://[::1]:8080',
    ]) {
      expect(originFrom({ protocol: origin.split(':')[0] + ':', origin, pathname: '/' }))
        .toBe(PUBLIC_ORIGIN)
    }
  })

  it('still trusts a real host that merely looks local', () => {
    // `localhost.example.com` is somebody's actual domain.
    expect(originFrom({
      protocol: 'https:',
      origin: 'https://localhost.example.com',
      pathname: '/',
    })).toBe('https://localhost.example.com/')
  })
})

describe('a link built on the fallback', () => {
  const challenge: Challenge = {
    v: 1, engine: 1, seed: 'SEED', size: 'compact', nationId: 'eng', season: 2025,
    clubId: 'c1', clubName: 'Somewhere', background: 'scout', by: 'Someone',
    target: { goal: 'finish', value: 4, seasons: 2 },
  }

  it('is still a link somebody can open', () => {
    const link = challengeLink(challenge, originFrom({
      protocol: 'file:', origin: 'file://', pathname: '/app/index.html',
    }))
    expect(link.startsWith('https://')).toBe(true)
    expect(link).not.toContain('file')
    expect(challengeFromUrl(link)).toEqual(challenge)
  })
})
