import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import {
  CHALLENGE_VERSION, base64UrlDecode, base64UrlEncode, challengeFrom, challengeFromUrl,
  challengeLink, challengeStatus, decodeChallenge, encodeChallenge, isSameEngine, placing,
  startingSeasonOf, worldSizeOf, type Challenge,
} from '../src/engine/systems/challenge'
import { SAVE_VERSION, type GameState } from '../src/engine/types'

/**
 * A challenge is a promise that two people get the same football club.
 *
 * Everything below is in service of that: the values that regenerate a world
 * must survive a round trip through a string a stranger pasted, the world must
 * be describable from the save without storing anything new, and a benchmark
 * must be judged on the receiver's own world rather than on the sender's word.
 */

let base: GameState

beforeAll(() => {
  const setup = prepareNewGame({
    seed: 'CHALLENGE', directorName: 'A. Director', background: 'scout',
    worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
  })
  base = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
}, 180_000)

function world(): GameState {
  return JSON.parse(JSON.stringify(base)) as GameState
}

/** Give the club a completed season, which is what a challenge is cut from. */
function withSeason(state: GameState, position: number, season = 2025) {
  const club = state.clubs[state.playerClubId!]
  club.history.push({
    season,
    leagueId: club.leagueId,
    leagueName: state.leagues[club.leagueId]?.name ?? 'League',
    position,
    played: 38,
    points: 60,
    goalsFor: 50,
    goalsAgainst: 40,
    cupResult: '',
    netSpend: 1_000_000,
  })
  return club
}

describe('base64url', () => {
  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    expect([...base64UrlDecode(base64UrlEncode(bytes))]).toEqual([...bytes])
  })

  it('round-trips every length, so no padding case is missed', () => {
    // The encoder breaks out of its loop on a short final group. Three
    // lengths mod 3 means three exit paths, and a bug in one of them shows up
    // only at that length.
    for (let n = 0; n <= 32; n++) {
      const bytes = new Uint8Array(n)
      for (let i = 0; i < n; i++) bytes[i] = (i * 37 + 11) & 0xff
      expect([...base64UrlDecode(base64UrlEncode(bytes))], `length ${n}`).toEqual([...bytes])
    }
  })

  it('emits nothing that needs escaping in a URL', () => {
    const bytes = new Uint8Array(180)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff
    expect(base64UrlEncode(bytes)).toMatch(/^[A-Za-z0-9_-]*$/)
  })
})

describe('describing the world a save came from', () => {
  it('recovers the size it was generated at', () => {
    expect(worldSizeOf(base)).toBe('compact')
  })

  it('recovers the starting season from the director age', () => {
    expect(startingSeasonOf(base)).toBe(2025)
    const older = world()
    older.director.age += 4
    older.date.season += 4
    expect(startingSeasonOf(older)).toBe(2025)
  })
})

describe('cutting a challenge from a career', () => {
  it('refuses before a season has been completed', () => {
    const state = world()
    expect(challengeFrom(state, state.playerClubId!)).toBeNull()
  })

  it('takes the best finish as the thing to beat', () => {
    const state = world()
    withSeason(state, 7, 2025)
    withSeason(state, 4, 2026)
    withSeason(state, 9, 2027)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(challenge.target.goal).toBe('finish')
    expect(challenge.target.value).toBe(4)
    expect(challenge.target.seasons).toBe(3)
  })

  it('carries the values that regenerate the world', () => {
    const state = world()
    withSeason(state, 5)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(challenge.seed).toBe('CHALLENGE')
    expect(challenge.size).toBe('compact')
    expect(challenge.season).toBe(2025)
    expect(challenge.nationId).toBe('eng')
    expect(challenge.by).toBe('A. Director')
    expect(challenge.engine).toBe(SAVE_VERSION)
    expect(challenge.v).toBe(CHALLENGE_VERSION)
  })
})

describe('the wire format', () => {
  it('survives a round trip intact', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge)
  })

  it('survives a name with characters outside ASCII', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    challenge.by = 'Ødegård Ünal 中文 😀'
    challenge.clubName = 'Preußen Münster'
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge)
  })

  it('is pulled back out of a full link', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    const link = challengeLink(challenge, 'https://undisclosedfootball.com/')
    // Inside the hash as a query, not as the hash itself: the app routes on
    // the hash, so a bare `#challenge=…` would resolve to the not-found
    // screen and the link would look broken to everyone who opened it.
    expect(link).toContain('#/?challenge=')
    expect(challengeFromUrl(link)).toEqual(challenge)
  })

  it('accepts a bare code, because that is what gets pasted', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(challengeFromUrl(encodeChallenge(challenge))).toEqual(challenge)
  })

  it('returns null for rubbish rather than throwing', () => {
    // This parses a string a stranger sent, so every one of these is an
    // expected input and none of them may reach the caller as an exception.
    for (const bad of ['', '   ', 'hello', '!!!!', 'eyJhIjox', 'A', '#challenge=']) {
      expect(() => decodeChallenge(bad)).not.toThrow()
      expect(decodeChallenge(bad)).toBeNull()
    }
  })

  it('refuses a version from the future', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    // Relative to the current version rather than a literal, so that bumping
    // the format does not quietly leave this asserting nothing.
    const ahead = encodeChallenge({ ...challenge, v: CHALLENGE_VERSION + 1 })
    expect(decodeChallenge(ahead)).toBeNull()
  })

  it('flags a challenge set on another build instead of trusting it', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(isSameEngine(challenge)).toBe(true)
    expect(isSameEngine({ ...challenge, engine: SAVE_VERSION - 1 })).toBe(false)
  })
})

describe('the same seed hands over the same club', () => {
  it('regenerates a world the challenge resolves against', () => {
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!

    // The receiver's build, told nothing but the code.
    const decoded = decodeChallenge(encodeChallenge(challenge))!
    const theirs = prepareNewGame({
      seed: decoded.seed,
      directorName: 'Someone Else',
      background: decoded.background,
      worldSize: decoded.size,
      homeNationId: decoded.nationId,
      startingSeason: decoded.season,
    })

    const club = theirs.state.clubs[decoded.clubId]
    expect(club).toBeDefined()
    expect(club.name).toBe(decoded.clubName)

    // The squad is the point: the same players, in the same order, at the
    // same ability. A challenge that handed over a different eleven would be
    // a different game wearing the same badge.
    const mine = state.clubs[challenge.clubId]
    expect(club.squad).toEqual(mine.squad)
    expect(club.squad.map((id) => theirs.state.players[id].currentAbility))
      .toEqual(mine.squad.map((id) => base.players[id].currentAbility))
    expect(club.reputation).toBe(mine.reputation)

    // The director's name is not allowed to perturb the world. It is the one
    // value in the setup that the receiver supplies themselves, so if it fed
    // any draw, two people opening the same link would get different clubs.
    const sameNameAsSender = prepareNewGame({
      seed: decoded.seed,
      directorName: 'A. Director',
      background: decoded.background,
      worldSize: decoded.size,
      homeNationId: decoded.nationId,
      startingSeason: decoded.season,
    })
    const twin = sameNameAsSender.state.clubs[decoded.clubId]
    expect(twin.squad).toEqual(club.squad)
    expect(twin.finances.wageBudget).toBe(club.finances.wageBudget)
  }, 180_000)

  it('fixes the background, because it moves the money', () => {
    // A financier starts with a bigger transfer budget, so a challenge that
    // let the receiver pick their own background would not be the same
    // problem. The code travels with the sender's, and this is the assertion
    // that says why it has to.
    const state = world()
    withSeason(state, 3)
    const challenge = challengeFrom(state, state.playerClubId!)!
    expect(challenge.background).toBe('scout')
    expect(decodeChallenge(encodeChallenge(challenge))!.background).toBe('scout')
  })
})

describe('judging a challenge', () => {
  function challengeOf(state: GameState, over: Partial<Challenge['target']>): Challenge {
    return {
      v: CHALLENGE_VERSION, engine: SAVE_VERSION, seed: state.seed, size: 'compact', nationId: 'eng',
      season: 2025, clubId: state.playerClubId!, clubName: state.clubs[state.playerClubId!].name,
      background: 'scout', by: 'Them',
      target: { goal: 'finish', value: 5, seasons: 2, ...over },
    }
  }

  it('is pending while seasons remain', () => {
    const state = world()
    withSeason(state, 8, 2025)
    expect(challengeStatus(state, challengeOf(state, {}))).toBe('pending')
  })

  it('is met by beating the mark, not matching it', () => {
    const state = world()
    withSeason(state, 5, 2025)
    expect(challengeStatus(state, challengeOf(state, {}))).toBe('pending')
    withSeason(state, 4, 2026)
    expect(challengeStatus(state, challengeOf(state, {}))).toBe('met')
  })

  it('fails once the seasons are used up', () => {
    const state = world()
    withSeason(state, 8, 2025)
    withSeason(state, 7, 2026)
    expect(challengeStatus(state, challengeOf(state, {}))).toBe('failed')
  })

  it('ignores a finish made after the allowance ran out', () => {
    const state = world()
    withSeason(state, 9, 2025)
    withSeason(state, 9, 2026)
    withSeason(state, 1, 2027)
    expect(challengeStatus(state, challengeOf(state, {}))).toBe('failed')
  })

  it('counts a survival challenge in seasons served', () => {
    const state = world()
    withSeason(state, 12, 2025)
    withSeason(state, 14, 2026)
    expect(challengeStatus(state, challengeOf(state, { goal: 'survive', value: 3 })))
      .toBe('pending')
    withSeason(state, 11, 2027)
    expect(challengeStatus(state, challengeOf(state, { goal: 'survive', value: 3 })))
      .toBe('met')
  })

  it('fails a survival challenge when the spell has ended', () => {
    const state = world()
    withSeason(state, 12, 2025)
    state.director.careerHistory[0].toSeason = 2025
    expect(challengeStatus(state, challengeOf(state, { goal: 'survive', value: 3 })))
      .toBe('failed')
  })
})

describe('placing', () => {
  it('writes the number out with its suffix', () => {
    expect(placing(1)).toBe('1st')
    expect(placing(2)).toBe('2nd')
    expect(placing(3)).toBe('3rd')
    expect(placing(4)).toBe('4th')
    expect(placing(11)).toBe('11th')
    expect(placing(21)).toBe('21st')
  })
})
