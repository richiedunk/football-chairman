import { describe, expect, it } from 'vitest'
import {
  article, boardTone, chairmanRegister, coachRegister, contact, phrase, pickBy, withArticle,
} from '../src/engine/systems/voice'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'

/**
 * Picking how somebody phrases something.
 *
 * The whole world is rebuilt from a seed, so a message that reads one way on
 * one run and another way on the next would break the one guarantee this
 * project actually makes. Variation that is not deterministic is worse than no
 * variation at all.
 */
const POOL = ['first', 'second', 'third'] as const

describe('choosing a phrasing', () => {
  it('gives the same key the same line, every time', () => {
    const once = phrase('plr_7:week_12', POOL)
    for (let i = 0; i < 50; i++) expect(phrase('plr_7:week_12', POOL)).toBe(once)
  })

  it('actually varies across keys', () => {
    // A picker that always returns the first line is a picker doing nothing,
    // and would pass the determinism test above perfectly.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(phrase(`plr_${i}:week_3`, POOL))
    expect(seen.size).toBe(POOL.length)
  })

  it('spreads reasonably evenly rather than favouring one line', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 900; i++) {
      const line = phrase(`plr_${i}:week_${i % 40}`, POOL)
      counts.set(line, (counts.get(line) ?? 0) + 1)
    }
    // 300 each if perfect. A picker that is merely deterministic could still
    // put 890 of them on one line.
    for (const [line, n] of counts) {
      expect(n, `"${line}" came up ${n} times in 900`).toBeGreaterThan(180)
    }
  })

  it('always returns a line from the pool it was given', () => {
    for (let i = 0; i < 100; i++) {
      expect(POOL).toContain(phrase(`whatever:${i}`, POOL))
    }
  })

  it('copes with a pool of one, and with none', () => {
    expect(phrase('k', ['only'])).toBe('only')
    expect(phrase('k', [])).toBe('')
  })
})

describe('putting an article in front of a generated word', () => {
  it('uses an before a vowel and a before a consonant', () => {
    // "It's a ankle sprain for Marcus Drinkwell" reached a screenshot.
    expect(withArticle('ankle sprain')).toBe('an ankle sprain')
    expect(withArticle('hamstring strain')).toBe('a hamstring strain')
    expect(withArticle('dead leg')).toBe('a dead leg')
    expect(withArticle('injury')).toBe('an injury')
  })

  it('is not fooled by leading space or capitals', () => {
    expect(article('  Ankle sprain')).toBe('an')
    expect(article('Groin strain')).toBe('a')
  })

  it('never returns nothing, whatever it is handed', () => {
    for (const odd of ['', ' ', '7-week layoff', "'keeper"]) {
      expect(['a', 'an']).toContain(article(odd))
    }
  })
})

describe('how a contact is saved', () => {
  it('puts the role in brackets after a name', () => {
    expect(contact('Jude Holloway', 'Scout')).toBe('Jude Holloway (Scout)')
  })

  it('falls back to the role alone when nobody is named', () => {
    // A phone that does not know who the competition secretary is saves them
    // as "Competition Secretary", and that is a perfectly good contact.
    expect(contact(null, 'Competition Secretary')).toBe('Competition Secretary')
    expect(contact(undefined, 'Head Coach')).toBe('Head Coach')
    expect(contact('   ', 'Physio')).toBe('Physio')
  })
})

describe('how the board is disposed towards you', () => {
  it('reads warnings as worse than a middling number', () => {
    // Two formal warnings is one from the sack whatever the confidence says.
    expect(boardTone(80, 2)).toBe('hostile')
    expect(boardTone(80, 0)).toBe('backing')
  })

  it('moves through every tone as confidence falls', () => {
    const seen = [boardTone(90), boardTone(55), boardTone(35), boardTone(10)]
    expect(new Set(seen).size, `only saw ${seen.join(', ')}`).toBe(4)
  })

  it('has a tone for every confidence in range', () => {
    for (let c = 0; c <= 100; c += 1) expect(boardTone(c)).toBeTruthy()
  })
})

describe('how a chairman talks', () => {
  it('gives each kind of owner its own register', () => {
    const kinds = ['legacyFamily', 'localBusiness', 'foreignFund', 'celebrity', 'consortium', 'fanOwned']
    const registers = kinds.map(chairmanRegister)
    // Six owners, six voices: a fund that bought the club in March should not
    // write like a family that has held it for eighty years.
    expect(new Set(registers).size).toBe(6)
  })

  it('falls back rather than failing on an owner it does not know', () => {
    expect(chairmanRegister('somethingNew')).toBeTruthy()
  })
})

describe('how a head coach talks to you', () => {
  it('turns pointed when he does not rate you, however much he talks', () => {
    expect(coachRegister(90, 10)).toBe('pointed')
    expect(coachRegister(10, 10)).toBe('pointed')
  })

  it('separates a talker from a man of few words', () => {
    // `mediaHandling` is how much a coach courts the press. A talker talks.
    expect(coachRegister(90, 80)).not.toBe(coachRegister(10, 80))
  })

  it('has something for every combination', () => {
    for (let m = 0; m <= 100; m += 10) {
      for (let r = 0; r <= 100; r += 10) {
        expect(coachRegister(m, r), `nothing at media ${m}, relationship ${r}`).toBeTruthy()
      }
    }
  })
})

describe('picking a line for a register', () => {
  it('takes it from that register and no other', () => {
    const pools = { a: ['from a'], b: ['from b'] } as const
    expect(pickBy('k', 'a', pools)).toBe('from a')
    expect(pickBy('k', 'b', pools)).toBe('from b')
  })

  it('returns nothing rather than throwing on a register with no lines', () => {
    expect(pickBy('k', 'missing' as 'a', { a: ['x'] } as Record<'a', readonly string[]>)).toBe('')
  })
})

/**
 * The mechanism above is only worth anything if the messages actually use it.
 * A call site that passes a constant register would pass every test in this
 * file and put the same words in every chairman's mouth.
 */
describe('a chairman writes like the man he is', () => {
  function welcomeAt(kind: string): string {
    const setup = prepareNewGame({
      seed: 'VOICE', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const clubId = startingClubCandidates(setup.state)[0].id
    setup.state.clubs[clubId].board.owner.kind = kind as never
    const state = startCareerAt(setup, clubId)
    const welcome = state.inbox.find((item) => item.subject.startsWith('Welcome to'))
    expect(welcome, `no welcome message for a ${kind} owner`).toBeTruthy()
    return welcome!.body
  }

  it('greets you differently depending on who owns the club', () => {
    // Same club, same seed, same facts underneath — six owners, six voices.
    const kinds = ['legacyFamily', 'localBusiness', 'foreignFund', 'celebrity', 'consortium', 'fanOwned']
    const openings = kinds.map((kind) => welcomeAt(kind).split('\n')[0])
    expect(new Set(openings).size, `only ${new Set(openings).size} distinct greetings`).toBe(6)
  })

  it('still tells you the same facts whoever is saying them', () => {
    // The voice changes; the job does not. A chairman who forgets to mention
    // the budget is a nicer read and a worse briefing.
    for (const kind of ['legacyFamily', 'foreignFund', 'fanOwned']) {
      const body = welcomeAt(kind)
      expect(body, `${kind} owner never mentions the squad`).toMatch(/senior players/)
      expect(body, `${kind} owner never mentions wages`).toMatch(/wage budget/)
    }
  })
})
