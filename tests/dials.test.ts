import { describe, expect, it } from 'vitest'
import { findUnreadFields } from './support/unreadFields'

/**
 * Every field in the world model has to be read by something.
 *
 * The most expensive class of bug in this project is not a crash or a wrong
 * number. It is a feature that does not exist: a dial added to a type, set
 * carefully at world generation or by a screen, and consulted by nothing. It
 * looks entirely real — it is typed, it is in the save, it shows in the
 * inspector, there is a comment explaining what it is for — and it does
 * nothing whatsoever.
 *
 * Recruitment policy had three at once. A club set to sign only homegrown
 * players signed exactly as many foreigners as anybody else, for months.
 *
 * Nothing catches this on its own. The type checker will not: a
 * written-and-never-read field is perfectly well typed. A test will not: you
 * cannot test behaviour that does not exist, and the test you would write
 * passes trivially against a world that ignores the dial. All three were found
 * by measuring an outcome, noticing the number would not move, and going
 * looking — months apart, each time by accident.
 *
 * So this counts them instead. The check is textual and therefore approximate
 * — a smoke alarm, not a compiler — but the shape of failure it exists for is
 * a field that appears nowhere at all, and that it cannot miss.
 *
 * ## The register below is a debt list, not an exemption list
 *
 * Each entry is a field that is written and read by nothing, today. They are
 * listed so the count can only go down: a new one fails this test, and so does
 * removing a field from the register without wiring it up or deleting it.
 * Nothing here is approved — this is the bill, itemised.
 *
 * It started at seventeen. Fourteen were deleted outright and one more,
 * `MediaBriefing.targetStaffId`, went with them: deleting the field it fed
 * left it feeding nothing.
 *
 * A field the game ignores but a *test* asserts on does not appear here, and
 * that is a real limit rather than an oversight. `Owner.faithInDirector` is
 * the live example: a takeover computes the new owner's opinion of you and two
 * tests check the arithmetic, so something reads it and this check is quiet —
 * while no code in the game has ever asked. That one is in `docs/bugs.md`.
 */

/** Known unread fields, with what each one actually is. */
const KNOWN_UNREAD: Record<string, string> = {
  'TransferNegotiation.deadlineWeek':
    'Every negotiation is given a deadline at the window close. Nothing expires '
    + 'one, so a negotiation opened in July is still open in May.',
  'GameSettings.fastAdvance':
    'A setting, defaulted to false, that no screen offers and no code obeys.',
}

const { declared, unread: unreadFields } = findUnreadFields()
const unread = unreadFields.map((f) => `${f.owner}.${f.name}`)

describe('every dial has a consumer', () => {
  it('reads the world model at all', () => {
    // A guard on the guard. If the parser stops finding fields — types.ts is
    // reformatted, say — everything below passes for the wrong reason.
    expect(declared).toBeGreaterThan(500)
  })

  it('has no unread field that is not already on the register', () => {
    const surprises = unread.filter((f) => !(f in KNOWN_UNREAD))
    expect(surprises, surprises.length === 0 ? '' : [
      '',
      'These fields are written and read by nothing:',
      ...surprises.map((f) => `  ${f}`),
      '',
      'That is a feature that silently does nothing, or weight in every save',
      'for no reader. Wire it up, delete it, or — if it is neither yet — add it',
      'to KNOWN_UNREAD in this file with what it actually is.',
    ].join('\n')).toEqual([])
  })

  it('has no register entry that has since been wired up', () => {
    // The register only earns its keep if it shrinks. A field that is read now
    // should not still be listed as debt.
    const stale = Object.keys(KNOWN_UNREAD).filter((f) => !unread.includes(f))
    expect(stale, stale.length === 0 ? '' : [
      '',
      'These are on the unread register but something reads them now:',
      ...stale.map((f) => `  ${f}`),
      '',
      'Take them off the list.',
    ].join('\n')).toEqual([])
  })
})
