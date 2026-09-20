import type { CompletedTransfer, GameState, ID, MediaOutlet } from '../types'
import { phrase, unit } from './voice'

/**
 * For an undisclosed fee.
 *
 * The game is named after the phrase every transfer announcement ends on, and
 * until now the phrase never appeared in it: the "around the world" list
 * printed every other club's fee to the pound, as if the director of football
 * at a rival had rung to tell you. He had not. What you know about a deal you
 * were not in is what the papers say, and the papers are guessing.
 *
 * The engine keeps the real figure — `CompletedTransfer.fee` is what moved
 * between two sets of accounts, and the finance system needs it. What changes
 * is what the *reader* is shown, and by whom. A deal your club was party to
 * shows the number, because you signed it. Anyone else's shows the word, and
 * beneath it one outlet's estimate, which is wrong by an amount that depends
 * on the outlet: a tabloid inflates and a paper of record rounds. Two papers
 * report the same deal at two prices. That is the media system's design —
 * credibility and sensationalism as something the reader can feel — reaching
 * one more screen.
 *
 * Nothing is stored. The outlet and its figure derive from the transfer's id,
 * so reopening the screen never changes what was printed, and a save carries
 * no new field.
 */

export interface FeeDisclosure {
  /** True when the reader is entitled to the real figure. */
  disclosed: boolean
  /** The real fee, only when disclosed. */
  fee: number | null
  /** What a paper is saying, only when it is not disclosed and money moved. */
  reported: { figure: number; outletId: ID; outletName: string; verb: string } | null
  /** The headline word for the trail column: "Undisclosed", "Free", "Loan". */
  label: 'Disclosed' | 'Undisclosed' | 'Free' | 'Loan'
}

/**
 * How far off a paper's figure can be, as a fraction of the true fee.
 *
 * A sensational outlet swings wider and swings upward — a bigger number is a
 * better story. A credible one narrows the band, because somebody there rang
 * somebody. The floor is never zero: nobody outside the two clubs knows the
 * add-ons.
 */
export function reportingError(outlet: Pick<MediaOutlet, 'credibility' | 'sensationalism'>, u: number): number {
  const s = outlet.sensationalism / 100
  const c = outlet.credibility / 100
  const spread = (0.06 + s * 0.44) * (1 - c * 0.55)
  const bias = s * 0.12
  // `u` is in [0, 1); centre it, so a sober paper is as likely under as over.
  return bias + (u * 2 - 1) * spread
}

/**
 * A figure the way a newspaper prints it: two significant figures, so a real
 * £4,183,000 comes out as "£4.2m" and never as a number that looks like it was
 * read off an invoice. A precise wrong number is the one thing worse than a
 * vague one.
 */
export function newspaperRound(amount: number): number {
  if (amount <= 0) return 0
  const magnitude = Math.pow(10, Math.floor(Math.log10(amount)) - 1)
  return Math.round(amount / magnitude) * magnitude
}

const VERBS_BY_SENSATIONALISM: readonly [number, readonly string[]][] = [
  [62, ['reckons', 'has it at', 'is screaming', 'says']],
  [34, ['reports', 'has it at', 'is reporting', 'puts it at']],
  [0, ['understands', 'puts it at', 'has it at']],
]

function verbFor(outlet: MediaOutlet, key: string): string {
  for (const [floor, pool] of VERBS_BY_SENSATIONALISM) {
    if (outlet.sensationalism >= floor) return phrase(key, pool)
  }
  return 'reports'
}

/**
 * Which paper got the story: one from the buying club's country, chosen by
 * the transfer's id so the same deal is always the same paper's. A world with
 * no outlets for that nation falls back to any outlet at all, and a world
 * with none prints the word and no figure, which is still correct.
 */
function reportingOutlet(state: GameState, record: CompletedTransfer): MediaOutlet | null {
  const nationId = state.clubs[record.toClubId]?.nationId
  const all = Object.values(state.outlets)
  const local = nationId ? all.filter((o) => o.nationId === nationId) : []
  const pool = local.length ? local : all
  if (!pool.length) return null
  const pick = Math.floor(unit(`outlet:${record.id}`) * pool.length)
  return pool[Math.min(pick, pool.length - 1)]
}

export function discloseFee(
  state: GameState,
  record: CompletedTransfer,
  viewerClubId: ID | null,
): FeeDisclosure {
  const isLoan = record.kind === 'loan' || record.kind === 'loanWithOption'
  if (isLoan) return { disclosed: true, fee: 0, reported: null, label: 'Loan' }

  // A free transfer is public: there was nothing to disclose.
  if (record.fee <= 0) return { disclosed: true, fee: 0, reported: null, label: 'Free' }

  const party = viewerClubId !== null
    && (record.toClubId === viewerClubId || record.fromClubId === viewerClubId)
  if (party) return { disclosed: true, fee: record.fee, reported: null, label: 'Disclosed' }

  const outlet = reportingOutlet(state, record)
  if (!outlet) return { disclosed: false, fee: null, reported: null, label: 'Undisclosed' }

  const error = reportingError(outlet, unit(`fee:${record.id}:${outlet.id}`))
  const figure = newspaperRound(record.fee * (1 + error))
  return {
    disclosed: false,
    fee: null,
    reported: {
      figure,
      outletId: outlet.id,
      outletName: outlet.name,
      verb: verbFor(outlet, `verb:${record.id}`),
    },
    label: 'Undisclosed',
  }
}
