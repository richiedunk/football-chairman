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
 * Characters that fit on one line of a name row at the sizes this app uses.
 *
 * Still a character budget rather than a live measurement — that is stable and
 * testable, and a character either way costs nothing — but the number is now
 * measured rather than guessed. `scripts/namefit` walked every list in the
 * built app at 390x844 and measured the real box against the real font:
 *
 *   squad 288px · agents 291px · scouting 291px · academy 280px
 *   registration 228px · staff 194px
 *
 * The narrowest row anywhere is the staff list at 194px, which holds 26
 * characters of a realistic name. (Realistic matters: 26 capital Ms need
 * 341px, but no one is called that.) So 26 is the budget that never clips on
 * any screen.
 *
 * It was 22, set by eye, and it was abbreviating names with a hundred pixels
 * of room left — "Gonzalo Montero Robledo" is 23 characters and 178px wide in
 * a 288px box, and it was being shown as "G. Montero Robledo".
 */
export const LIST_NAME_BUDGET = 26

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
