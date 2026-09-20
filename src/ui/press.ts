/**
 * What an outlet is like to read.
 *
 * `MediaOutlet` carries `credibility` and `sensationalism`, the engine uses
 * both — a high-credibility outlet does more damage and is harder to plant in,
 * a sensational one chases gossip and is easy to feed — and the UI printed
 * them as two numbers in a staff-list row and then rendered every story
 * identically. So the reader had the outlet's character available as arithmetic
 * and never as something they could feel.
 *
 * That is the media system's whole design going to waste. A rumour should look
 * like the kind of paper it ran in, because learning to discount one paper and
 * believe another is the skill the system is asking for.
 *
 * Pure, and given the two numbers rather than the outlet, so it can be tested
 * without a world.
 */

export type PressVoice = 'record' | 'daily' | 'tabloid'

export interface OutletCharacter {
  voice: PressVoice
  /** How the masthead reads. Set from the voice, not chosen per outlet. */
  className: string
  /** What the outlet is, in words rather than two numbers out of a hundred. */
  standing: string
}

/**
 * Three voices, from the two numbers.
 *
 * Sensationalism decides the voice, because that is what a reader sees first —
 * whether a paper shouts. Credibility then separates a paper that shouts and is
 * usually right from one that shouts and is not, which is the distinction worth
 * making: a sensational outlet with real credibility is the dangerous one,
 * since it will run anything and people believe it.
 */
export function outletCharacter(credibility: number, sensationalism: number): OutletCharacter {
  const voice: PressVoice = sensationalism >= 62 ? 'tabloid' : sensationalism >= 34 ? 'daily' : 'record'
  return {
    voice,
    className: `cutting--${voice}`,
    standing: standingOf(voice, credibility),
  }
}

function standingOf(voice: PressVoice, credibility: number): string {
  if (voice === 'tabloid') {
    if (credibility >= 62) return 'Loud, and usually right'
    if (credibility >= 38) return 'Loud, and often wrong'
    return 'Prints anything'
  }
  if (voice === 'daily') {
    if (credibility >= 62) return 'Well sourced'
    if (credibility >= 38) return 'Middling'
    return 'Thin on sources'
  }
  if (credibility >= 62) return 'Paper of record'
  if (credibility >= 38) return 'Sober, seldom first'
  return 'Quiet, and not trusted'
}

/**
 * How widely a story ran, in words.
 *
 * `prominence` drives the size of every effect the story has, so it is the
 * number that decides whether a rumour mattered — and it was never shown.
 */
export function reach(prominence: number): string {
  if (prominence >= 75) return 'BACK PAGE'
  if (prominence >= 50) return 'RAN WIDELY'
  if (prominence >= 25) return 'PICKED UP'
  return 'BURIED'
}
