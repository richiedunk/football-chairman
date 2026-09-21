import { formatMoney } from './valuation'
import { yourSignings } from './coachView'
import { levelFor } from './career'
import { challengeFrom, describeTarget, placing, type Challenge } from './challenge'
import type { Club, GameState, ID } from '../types'

/**
 * The card you send somebody.
 *
 * A management career is a story that its player cannot show anyone. The table
 * is a screenshot of a table, the squad list is a screenshot of a spreadsheet,
 * and neither carries the one thing that happened. This builds the picture
 * instead: what you took on, what you did with it, and the detail that makes
 * it *this* game rather than any other.
 *
 * ## The rule this file follows
 *
 * **A card says what the game is about, or it does not go on the card.**
 *
 * `docs/identity.md` settles what that is: you buy players you cannot fully
 * see, for a coach you do not control. So a card carries the coach's verdict
 * on your signings, and it carries fees as the word the game is named after.
 * Points and goal difference are on it because they are the score, but they
 * are never the headline — a card whose biggest number is "58 points" is a
 * card for a different game, and nobody who sees it learns anything about
 * this one.
 *
 * Content only. Nothing here draws, measures or encodes an image: the engine
 * has no DOM by rule, and a card that is a data structure can be tested,
 * rendered at any size, and read out by a screen reader. `src/ui/share/`
 * turns one into a picture.
 */

export type ShareCardKind = 'career' | 'season' | 'challenge'

export interface CardRow {
  label: string
  value: string
  /** Set when the value is the game's central word rather than a figure. */
  undisclosed?: boolean
}

export interface ShareCard {
  kind: ShareCardKind
  /** Who or what the card is about. */
  title: string
  subtitle: string
  /** The one thing the card is for, read at arm's length. */
  headline: { value: string; caption: string }
  rows: CardRow[]
  /**
   * A line in somebody's voice, usually the coach's.
   *
   * The part that makes a card worth posting. A table of six numbers is a
   * result; a table of six numbers with the head coach explaining why he left
   * your record signing out is a story, and the story is what travels.
   */
  line: string
  /**
   * Whether the line is something somebody said.
   *
   * The renderer puts speech in quotation marks, and a challenge's benchmark
   * is not speech — it is an instruction. Quoting it made the card read as
   * though a person had said "Better than 22nd within one season" out loud.
   */
  lineIsSpeech: boolean
  footer: string
  /** The club's colours, so a card looks like the club it is about. */
  colors: { primary: string; secondary: string }
  /** Set on a challenge card: the position being handed over. */
  challenge?: Challenge
}

// ---------------------------------------------------------------------------
// The season just gone
// ---------------------------------------------------------------------------

/**
 * One season at one club.
 *
 * Built for the moment the season rolls, which is the moment a player has
 * something to say and no way to say it.
 */
export function seasonCard(state: GameState, clubId: ID, season: number): ShareCard | null {
  const club = state.clubs[clubId]
  if (!club) return null
  const record = club.history.find((h) => h.season === season)
  if (!record) return null

  const currency = state.settings.currency
  const signings = yourSignings(state, club)
  const benched = signings.filter((p) => (p.snubbedRun ?? 0) > 0)

  // No "Finished" row: the headline is already the position and the division,
  // and a card that says the same thing twice has wasted the one row that
  // could have said something else.
  const rows: CardRow[] = [
    { label: 'Points', value: `${record.points} from ${record.played}` },
    {
      label: 'Goals',
      value: `${record.goalsFor} for, ${record.goalsAgainst} against`,
    },
  ]
  if (record.cupResult) rows.push({ label: 'Cup', value: record.cupResult })
  rows.push({
    label: 'Net spend',
    value: formatMoney(record.netSpend, currency),
  })
  rows.push({
    label: 'Signings',
    value: signings.length
      ? `${signings.length}, ${benched.length} he would not pick`
      : 'None',
  })

  return {
    kind: 'season',
    title: club.name,
    subtitle: `${season}/${String((season + 1) % 100).padStart(2, '0')} · ${state.director.name}`,
    headline: {
      value: placing(record.position),
      caption: record.leagueName.toUpperCase(),
    },
    rows,
    line: seasonLine(record.position, signings.length, benched.length),
    lineIsSpeech: true,
    footer: 'UNDISCLOSED FOOTBALL',
    colors: club.colors,
  }
}

/**
 * The sentence under the numbers.
 *
 * Written from the two facts that are this game's and nobody else's: where
 * they finished, and how much of the squad the coach refused to use. A good
 * finish with three of your signings frozen out is a different season to a
 * good finish without, and only one of them is worth posting.
 */
function seasonLine(position: number, signings: number, benched: number): string {
  if (benched >= 2) {
    return `${benched} of the ${signings} I signed could not get in the side.`
  }
  if (benched === 1) return 'One of mine never convinced him.'
  if (position === 1) return 'Nobody asked what it cost.'
  if (signings === 0) return 'Not one signing all year.'
  return 'He picked them. That is as much as I can ask.'
}

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

/**
 * A career, on one card.
 *
 * The end-of-career object, and the one most likely to be posted, so it leads
 * with the length of the career rather than a trophy count — most careers do
 * not have a trophy count, and a card that is blank for most players is a card
 * most players never send.
 */
export function careerCard(state: GameState): ShareCard {
  const director = state.director
  const currency = state.settings.currency
  const spells = director.careerHistory
  const seasons = spells.reduce(
    (total, s) => total + ((s.toSeason ?? state.date.season) - s.fromSeason + 1),
    0,
  )
  const trophies = spells.flatMap((s) => s.trophies)
  const sackings = spells.filter((s) => s.outcome === 'Sacked').length
  const best = spells.reduce<number | null>(
    (b, s) => (s.bestFinish > 0 && (b === null || s.bestFinish < b) ? s.bestFinish : b),
    null,
  )
  const netSpend = spells.reduce((total, s) => total + s.netSpend, 0)
  const last = spells[spells.length - 1]
  const club = last ? state.clubs[last.clubId] : null

  const rows: CardRow[] = [
    { label: 'Clubs', value: String(spells.length) },
    { label: 'Best finish', value: best === null ? '—' : placing(best) },
    { label: 'Trophies', value: trophies.length ? trophies.join(', ') : 'None' },
    { label: 'Sacked', value: sackings === 0 ? 'Never' : `${sackings} times` },
    { label: 'Net spend', value: formatMoney(netSpend, currency) },
    { label: 'Earned', value: formatMoney(director.careerEarnings, currency) },
  ]

  return {
    kind: 'career',
    title: director.name,
    subtitle: `${levelFor(director.xp).title} · ${spells.length === 1 && last
      ? last.clubName
      : `${spells.length} clubs`}`,
    headline: {
      value: String(seasons),
      caption: seasons === 1 ? 'SEASON' : 'SEASONS',
    },
    rows,
    line: careerLine(trophies.length, sackings, seasons),
    lineIsSpeech: true,
    footer: 'UNDISCLOSED FOOTBALL',
    colors: club?.colors ?? { primary: '#C8102E', secondary: '#FFFFFF' },
  }
}

function careerLine(trophies: number, sackings: number, seasons: number): string {
  if (trophies === 0 && sackings === 0) return 'Never won anything. Never got found out either.'
  if (trophies === 0) return `${sackings} boards ran out of patience before I did.`
  if (sackings === 0) return 'Thirty-five years and nobody ever asked me to leave.'
  return `${trophies} won, ${sackings} sackings, ${seasons} seasons. Make of it what you like.`
}

// ---------------------------------------------------------------------------
// A position, handed over
// ---------------------------------------------------------------------------

/**
 * The card that carries a challenge.
 *
 * The others describe something finished. This one is an invitation, so it
 * leads with the club being handed over and the benchmark to beat, and the
 * numbers on it are the ones a director would want before saying yes: what
 * they are inheriting, and what it is going to cost them.
 */
export function challengeCard(state: GameState, clubId: ID): ShareCard | null {
  const challenge = challengeFrom(state, clubId)
  if (!challenge) return null
  const club = state.clubs[clubId]
  if (!club) return null

  const currency = state.settings.currency

  // Deliberately none of the title, the headline or the footer repeated. What
  // is left is what somebody deciding whether to take it on would ask: which
  // division, how big a squad, and how much room there is to change any of it.
  const rows: CardRow[] = [
    { label: 'Division', value: state.leagues[club.leagueId]?.name ?? '—' },
    { label: 'Squad', value: `${club.squad.length} players` },
    { label: 'Wage bill', value: `${formatMoney(club.finances.wageBudget, currency)}/wk` },
    {
      label: 'To spend',
      value: formatMoney(club.finances.transferBudget, currency),
    },
    { label: 'Set by', value: challenge.by },
  ]

  return {
    kind: 'challenge',
    title: club.name.toUpperCase(),
    subtitle: `Seed ${challenge.seed} · ${challenge.season}`,
    headline: {
      value: placing(challenge.target.value),
      caption: 'BEAT THIS',
    },
    rows,
    line: describeTarget(challenge),
    // An instruction, not a remark. See `lineIsSpeech`.
    lineIsSpeech: false,
    footer: 'SAME SEED · SAME SQUAD · SAME COACH',
    colors: club.colors,
    challenge,
  }
}

/**
 * Every card this save can currently produce.
 *
 * The share screen asks rather than deciding for itself, because which cards
 * exist depends on how far a career has got: there is no season card before a
 * season has finished and no challenge worth setting before that either.
 */
export function availableCards(state: GameState): ShareCardKind[] {
  const kinds: ShareCardKind[] = ['career']
  const club = state.playerClubId ? state.clubs[state.playerClubId] : null
  if (club && lastCompletedSeason(state, club) !== null) {
    kinds.unshift('season')
    kinds.push('challenge')
  }
  return kinds
}

/** The most recent season the club actually completed, or null. */
export function lastCompletedSeason(state: GameState, club: Club): number | null {
  const spell = state.director.careerHistory.find((e) => e.clubId === club.id)
  if (!spell) return null
  const seasons = club.history.filter((h) => h.season >= spell.fromSeason)
  return seasons.length ? seasons[seasons.length - 1].season : null
}
