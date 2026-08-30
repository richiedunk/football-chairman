/**
 * How a player's name is written, and where.
 *
 * Three different things get called "the name" and they are not the same:
 *
 *  - His **full name**, which is what a squad list is: a register of who is
 *    contracted to the club.
 *  - What he is **known as** — Rodri, Enzo, a diminutive. Real, and how the
 *    press and everyone else refers to him.
 *  - An **initial and a surname**, which is not a name at all. It is what a
 *    newspaper does when the column is too narrow, and it belongs here, in the
 *    display layer, rather than being baked into a player at birth.
 *
 * So: lists show the full name and fall back to the abbreviation only when it
 * genuinely will not fit; the profile always shows the full name and the
 * nickname beside it.
 */

import type { Player } from '../engine/types'

/**
 * Characters that fit on one line of a squad row at the sizes this app uses,
 * before the badges and figures beside it start being pushed off. Deliberately
 * a character budget rather than a measurement: it is stable, it is testable,
 * and being one character out costs nothing.
 */
export const LIST_NAME_BUDGET = 22

export function fullName(player: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${player.firstName} ${player.lastName}`.trim()
}

/** "Bruno Fernandes", or "B. Fernandes" when the full name will not fit. */
export function listName(
  player: Pick<Player, 'firstName' | 'lastName'>,
  budget = LIST_NAME_BUDGET,
): string {
  const full = fullName(player)
  if (full.length <= budget) return full

  const initial = player.firstName.trim().charAt(0)
  if (!initial) return player.lastName
  const abbreviated = `${initial}. ${player.lastName}`
  // A surname alone can still be too long — some are — and there is nothing
  // further to cut, so let the row's own ellipsis handle it.
  return abbreviated
}

/**
 * The nickname, when it is worth showing: only where it differs from both the
 * full name and the surname, so a profile does not solemnly report that Bruno
 * Fernandes is known as "Bruno Fernandes".
 */
export function nickname(
  player: Pick<Player, 'firstName' | 'lastName' | 'knownAs'>,
): string | null {
  const known = player.knownAs.trim()
  if (!known) return null
  if (known === fullName(player)) return null
  if (known === player.lastName.trim()) return null
  return known
}
