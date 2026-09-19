import { describe, expect, it } from 'vitest'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { startingClubCandidates } from '../src/engine/systems/career'
import { advanceWeek } from '../src/engine/tick'
import { streamJson } from '../src/storage/streamJson'

/**
 * The streaming serialiser has one job: produce exactly what `JSON.stringify`
 * would, without ever building it.
 *
 * "Exactly" is the whole of it. Saves are hashed, migrations run against the
 * stored text, and a divergence that only appears in a particular player's
 * particular field would surface as one person's unloadable career. The awkward
 * cases are all about absence — `undefined` drops a key in an object but
 * becomes `null` in an array — so they are pinned individually as well as
 * against a real world, because a real world might not happen to contain one.
 */
const joined = (value: unknown): string => [...streamJson(value)].join('')

describe('streaming a value', () => {
  it('matches JSON.stringify on the shapes that are easy', () => {
    for (const value of [
      null, true, false, 0, -1, 3.25, '', 'text', 'quotes "and" \\ backslash',
      'newline\nand\ttab', [], {}, [1, 2, 3], { a: 1, b: 'two' },
      { nested: { deep: { deeper: [1, { x: null }] } } },
    ]) {
      expect(joined(value), `differs on ${JSON.stringify(value)}`).toBe(JSON.stringify(value))
    }
  })

  it('drops an undefined value in an object, as stringify does', () => {
    const value = { kept: 1, gone: undefined, also: 2 }
    expect(joined(value)).toBe(JSON.stringify(value))
    expect(joined(value)).toBe('{"kept":1,"also":2}')
  })

  it('writes an undefined array element as null, as stringify does', () => {
    const value = [1, undefined, 3]
    expect(joined(value)).toBe(JSON.stringify(value))
    expect(joined(value)).toBe('[1,null,3]')
  })

  it('keeps key order', () => {
    const value = { z: 1, a: 2, m: 3 }
    expect(joined(value)).toBe(JSON.stringify(value))
  })

  it('handles an object nested deeper than it streams', () => {
    // Below the streaming depth it hands over to JSON.stringify, so the two
    // must agree across that boundary rather than only above it.
    const value = { a: { b: { c: { d: { e: [1, 2, { f: undefined, g: 3 }] } } } } }
    expect(joined(value)).toBe(JSON.stringify(value))
  })

  it('matches on a real world that has been played', () => {
    const setup = prepareNewGame({
      seed: 'STREAM', directorName: 'T', background: 'scout',
      worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
    })
    const state = startCareerAt(setup, startingClubCandidates(setup.state)[0].id)
    for (let w = 0; w < 60; w++) advanceWeek(state, { ids: setup.ids, names: setup.names })

    const streamed = joined(state)
    const stringified = JSON.stringify(state)
    expect(streamed.length, 'lengths differ').toBe(stringified.length)
    expect(streamed).toBe(stringified)
  }, 120_000)
})
