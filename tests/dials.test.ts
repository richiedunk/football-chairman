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
 */

/**
 * Known unread fields, with what each one actually is.
 *
 * Two kinds, and they want opposite fixes. A **silent feature** is code that
 * was written to do something and does not; the fix is to consult it. **Dead
 * weight** is a value carried in every save for no reader; the fix is to
 * delete it. Neither is done here — both change the game, and that is a
 * decision with an owner.
 */
const KNOWN_UNREAD: Record<string, string> = {
  // Silent features: written deliberately, consulted by nothing.
  'Owner.faithInDirector':
    'A new owner arrives with a considered view of you — takeovers.ts computes '
    + 'it from fit, clamped 5-95 — and nothing ever asks. Being inherited by an '
    + 'owner who does not rate you should be one of the worst things that can '
    + 'happen in this job, and at the moment it is nothing at all.',
  'TransferNegotiation.playerInitiated':
    'Records whether the human opened the negotiation. Nothing behaves '
    + 'differently either way — an AI club treats an approach from the player '
    + 'exactly as it treats one of its own.',
  'TransferNegotiation.deadlineWeek':
    'Every negotiation is given a deadline at the window close. Nothing expires '
    + 'one, so a negotiation opened in July is still open in May.',
  'TransferTerms.optionFee':
    'Not written anywhere either. An option-to-buy on a loan that no code path '
    + 'can create or exercise.',
  'GameSettings.fastAdvance':
    'A setting, defaulted to false, that no screen offers and no code obeys.',

  // Dead weight: carried in the save, read by nobody.
  'Club.isPlayerClub':
    'Maintained in four places across season roll, world gen and dismissal. '
    + '`state.playerClubId` is the actual source of truth and every reader uses '
    + 'it, so this is a second copy that can only ever disagree.',
  'Player.birthWeek':
    'Rolled for every player in the world. Ages come from the season, so this '
    + 'is 9,700 numbers nothing consults.',
  'Player.secondNationalityId':
    'Rolled for every player. Dual nationality would be worth having — it is '
    + 'how registration and international eligibility get interesting — but '
    + 'neither system asks.',
  'FacilityProject.totalCost': 'Set when a project starts; progress reads the weekly figure.',
  'Takeover.collapseReason': 'Initialised to null and never written again, let alone read.',
  'SeasonHistory.continentalResult': 'Recorded every season for a history screen that does not show it.',
  'SeasonHistory.finalBalance': 'As above.',
  'SeasonHistory.headCoachName': 'As above.',
  'MediaStory.subjectStaffIds': 'Populated by the briefing system; no story renderer reads it.',
  'MediaEffect.metric': 'Named on every effect. The effect is applied by target and delta.',
  'GameState.rngCounters': 'Initialised empty at world generation and never touched again.',
  'DirectorContract.signedSeason': 'Stamped on signing; length and expiry are read from elsewhere.',
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
