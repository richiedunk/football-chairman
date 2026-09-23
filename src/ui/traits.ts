/**
 * What a player's traits are called on screen.
 *
 * The engine names them as identifiers — `injuryProne`, `bigGameplayer` — and
 * the screens printed the identifiers: the profile split the camel case and
 * lower-cased it, which turned `bigGameplayer` into "big gameplayer", and the
 * dressing room upper-cased them raw, which gave "INJURYPRONE, BIGGAMEPLAYER".
 * Both read as a debug dump. A trait is a thing somebody at the club would say
 * about him, so each one gets the words they would use.
 */

import type { PlayerTrait } from '../engine/types'

export const TRAIT_LABELS: Record<PlayerTrait, string> = {
  leader: 'Leader',
  hothead: 'Hothead',
  professional: 'Model professional',
  mercenary: 'Mercenary',
  loyal: 'Loyal',
  injuryProne: 'Injury-prone',
  lateDeveloper: 'Late developer',
  wonderkid: 'Wonderkid',
  mediaDarling: 'Media darling',
  mediaShy: 'Media-shy',
  bigGameplayer: 'Big-game player',
  inconsistent: 'Inconsistent',
  ambitious: 'Ambitious',
  homesick: 'Homesick',
  disruptive: 'Disruptive',
  versatile: 'Versatile',
}

export function traitLabel(trait: PlayerTrait): string {
  // A save can outlive a trait's label. Say something human rather than
  // printing an identifier or nothing.
  return TRAIT_LABELS[trait] ?? String(trait).replace(/([A-Z])/g, ' $1').toLowerCase()
}

/** A player's traits as one line, for a list row that has room for a phrase. */
export function traitLine(traits: readonly PlayerTrait[]): string {
  return traits.map(traitLabel).join(', ')
}
