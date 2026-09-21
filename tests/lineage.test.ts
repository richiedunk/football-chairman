import { beforeEach, describe, expect, it } from 'vitest'
import {
  absorb, compareClocks, compareLineage, deviceId, deviceLabel, setDeviceLabel,
  stamp, totalWrites, type SaveLineage,
} from '../src/storage/lineage'
import {
  acceptRemote, decideHandoff, keepLocal, writtenHere,
} from '../src/storage/handoff'
import type { GameState } from '../src/engine/types'

/**
 * Deciding which copy of a career is the newer one.
 *
 * This is the part of cross-device play that can lose somebody a season, so
 * the assertions are mostly about what it refuses to do: never order two
 * copies it cannot order, never call a divergence a descent, and never let a
 * decision somebody has already made come back.
 *
 * Worth stating what is deliberately absent: there is no network here and no
 * server. The decision is the hard part and the transport is not, and a
 * decision that can only be exercised through a server is one nobody tests.
 */

/** A bare state, which is all any of this reads. */
function save(lineage?: SaveLineage): GameState {
  return { lineage } as unknown as GameState
}

function lineage(careerId: string, clock: Record<string, number>, device = 'a'): SaveLineage {
  return { careerId, clock, device, deviceLabel: device === 'a' ? 'Phone' : 'Desktop' }
}

describe('this device', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* not every runtime has one */ }
  })

  it('keeps the same id across calls', () => {
    expect(deviceId()).toBe(deviceId())
  })

  it('is opaque, and carries nothing about the machine', () => {
    const id = deviceId()
    expect(id.length).toBeGreaterThan(8)
    // Nothing derived from the host: no fingerprint, no username, no platform.
    expect(id).not.toMatch(/linux|win|mac|node|user/i)
  })

  it('can be given a name a person would recognise', () => {
    expect(deviceLabel('This device')).toBe('This device')
    setDeviceLabel('The train phone')
    expect(deviceLabel()).toBe('The train phone')
  })

  it('answers to its name even where nothing can be written down', () => {
    // These tests run with no localStorage at all, which is the same position
    // as a private window or a browser with site data blocked. The id already
    // fell back to memory there and the label did not, so a device could be
    // named and forget within one sitting.
    setDeviceLabel('Kitchen laptop')
    expect(deviceLabel()).toBe('Kitchen laptop')
    expect(deviceLabel('ignored fallback')).toBe('Kitchen laptop')
  })
})

describe('comparing clocks', () => {
  it('calls identical copies the same', () => {
    expect(compareClocks({ a: 3, b: 2 }, { a: 3, b: 2 })).toBe('same')
    expect(compareClocks({}, {})).toBe('same')
  })

  it('reads a missing device as zero rather than as a difference', () => {
    expect(compareClocks({ a: 1 }, { a: 1, b: 0 })).toBe('same')
  })

  it('orders a descendant ahead of its ancestor', () => {
    expect(compareClocks({ a: 4 }, { a: 3 })).toBe('ahead')
    expect(compareClocks({ a: 3 }, { a: 4 })).toBe('behind')
  })

  it('orders across devices when only one has moved', () => {
    expect(compareClocks({ a: 3, b: 5 }, { a: 3, b: 2 })).toBe('ahead')
    expect(compareClocks({ a: 3 }, { a: 3, b: 1 })).toBe('behind')
  })

  it('calls it diverged when each holds something the other does not', () => {
    // The case a timestamp cannot see, and the only one that can cost a season.
    expect(compareClocks({ a: 4, b: 2 }, { a: 3, b: 5 })).toBe('diverged')
    expect(compareClocks({ a: 1 }, { b: 1 })).toBe('diverged')
  })

  it('handles three devices, which a single synced-version number cannot', () => {
    expect(compareClocks({ a: 2, b: 1, c: 1 }, { a: 1, b: 1 })).toBe('ahead')
    expect(compareClocks({ a: 2, c: 1 }, { a: 1, b: 3 })).toBe('diverged')
  })
})

describe('comparing careers', () => {
  it('refuses to order two different careers', () => {
    expect(compareLineage(lineage('one', { a: 9 }), lineage('two', { a: 1 })))
      .toBe('unrelated')
  })

  it('refuses to order a copy that predates all of this', () => {
    // A save with no lineage cannot be placed, and guessing it is older is the
    // one mistake that silently overwrites a career.
    expect(compareLineage(undefined, lineage('one', { a: 1 }))).toBe('unrelated')
    expect(compareLineage(lineage('one', { a: 1 }), undefined)).toBe('unrelated')
  })
})

describe('stamping a save', () => {
  it('counts the first write', () => {
    const state = save()
    const marked = stamp(state, 'phone', 'Phone')
    expect(marked.clock).toEqual({ phone: 1 })
    expect(marked.device).toBe('phone')
    expect(state.lineage).toBe(marked)
  })

  it('keeps the career id across writes', () => {
    const state = save()
    const first = stamp(state, 'phone', 'Phone')
    const second = stamp(state, 'phone', 'Phone')
    expect(second.careerId).toBe(first.careerId)
    expect(second.clock).toEqual({ phone: 2 })
  })

  it('gives two careers different ids', () => {
    expect(stamp(save(), 'phone').careerId).not.toBe(stamp(save(), 'phone').careerId)
  })

  it('counts each device separately', () => {
    const state = save()
    stamp(state, 'phone', 'Phone')
    stamp(state, 'desk', 'Desktop')
    stamp(state, 'phone', 'Phone')
    expect(state.lineage!.clock).toEqual({ phone: 2, desk: 1 })
    expect(totalWrites(state.lineage)).toBe(3)
  })

  it('makes a copy that has been played strictly ahead of the one it came from', () => {
    const phone = save()
    stamp(phone, 'phone', 'Phone')
    const carried: GameState = JSON.parse(JSON.stringify(phone))
    stamp(carried, 'desk', 'Desktop')
    expect(compareLineage(carried.lineage, phone.lineage)).toBe('ahead')
  })
})

describe('settling a divergence', () => {
  it('leaves the winner ahead of the copy it beat', () => {
    const mine = lineage('one', { a: 4, b: 2 })
    const theirs = lineage('one', { a: 3, b: 5 })
    expect(compareLineage(mine, theirs)).toBe('diverged')

    const settled = absorb(mine, theirs)
    expect(compareLineage(settled, theirs)).toBe('ahead')
  })

  it('does not ask again once it has been answered', () => {
    // The failure this prevents: two copies stay mutually ahead for ever and
    // a player who already chose is asked on every single launch.
    const mine = lineage('one', { a: 4, b: 2 })
    const theirs = lineage('one', { a: 3, b: 5 })
    const settled = absorb(mine, theirs)
    expect(decideHandoff(settled, theirs).action).not.toBe('choose')
  })

  it('keeps the career id', () => {
    const mine = lineage('one', { a: 1 })
    expect(absorb(mine, lineage('one', { b: 1 })).careerId).toBe('one')
  })
})

describe('what to do about a remote copy', () => {
  it('offers to send when nothing is out there', () => {
    const decision = decideHandoff(lineage('one', { a: 2 }), undefined)
    expect(decision.action).toBe('push')
  })

  it('has nothing to say when there is nothing at either end', () => {
    expect(decideHandoff(undefined, undefined).action).toBe('none')
  })

  it('offers to take a career on a device that has none', () => {
    const decision = decideHandoff(undefined, lineage('one', { a: 2 }, 'b'))
    expect(decision.action).toBe('pull')
    expect(decision.otherDevice).toBe('Desktop')
  })

  it('says nothing when the two agree', () => {
    const same = lineage('one', { a: 2 })
    expect(decideHandoff(same, { ...same }).action).toBe('none')
  })

  it('offers to send when this device is the newer one', () => {
    expect(decideHandoff(lineage('one', { a: 3 }), lineage('one', { a: 2 })).action)
      .toBe('push')
  })

  it('offers to take, never takes', () => {
    // Even the plainly safe case is a question. The cost of asking is a tap;
    // the cost of being wrong is a season.
    const decision = decideHandoff(lineage('one', { a: 2 }), lineage('one', { a: 4 }))
    expect(decision.action).toBe('pull')
  })

  it('puts a real divergence to the player, and says what it is', () => {
    const decision = decideHandoff(
      lineage('one', { a: 4, b: 2 }),
      { ...lineage('one', { a: 3, b: 5 }), deviceLabel: 'Desktop' },
    )
    expect(decision.action).toBe('choose')
    expect(decision.message).toContain('Desktop')
    // Not jargon: a player has to know what they are deciding.
    expect(decision.message).not.toMatch(/conflict|clock|vector|merge/i)
  })

  it('refuses to mix two different careers', () => {
    expect(decideHandoff(lineage('one', { a: 1 }), lineage('two', { a: 9 })).action)
      .toBe('incompatible')
  })

  it('never silently replaces anything', () => {
    // The property that matters most, asserted over every shape of input:
    // nothing here ever returns an action that applies a change by itself.
    const shapes: (SaveLineage | undefined)[] = [
      undefined,
      lineage('one', { a: 1 }),
      lineage('one', { a: 5, b: 5 }),
      lineage('two', { c: 2 }),
    ]
    for (const local of shapes) {
      for (const remote of shapes) {
        const { action } = decideHandoff(local, remote)
        expect(['none', 'push', 'pull', 'choose', 'incompatible']).toContain(action)
      }
    }
  })
})

describe('applying a choice', () => {
  it('taking the remote keeps a record of what was here', () => {
    const local = lineage('one', { a: 4, b: 2 })
    const remote = save(lineage('one', { a: 3, b: 5 }))
    const taken = acceptRemote(remote, local)
    expect(taken.lineage!.clock).toEqual({ a: 4, b: 5 })
  })

  it('keeping the local records that the other was seen', () => {
    const local = save(lineage('one', { a: 4, b: 2 }))
    const kept = keepLocal(local, lineage('one', { a: 3, b: 5 }))
    expect(kept.lineage!.clock).toEqual({ a: 4, b: 5 })
  })

  it('leaves a copy with no lineage alone rather than inventing one', () => {
    const remote = save()
    expect(acceptRemote(remote, lineage('one', { a: 1 })).lineage).toBeUndefined()
  })
})

describe('who wrote this copy', () => {
  it('recognises this device', () => {
    const state = save()
    stamp(state)
    expect(writtenHere(state.lineage)).toBe(true)
  })

  it('does not claim one written elsewhere', () => {
    expect(writtenHere(lineage('one', { other: 1 }, 'other'))).toBe(false)
  })
})
