import { clamp, Rng } from '../rng'
import type {
  Club, ClubStrategy, GameState, MediaStance, PhilosophyId, Player,
} from '../types'

/**
 * What kind of club this is in the market.
 *
 * The brief was to consolidate the dials `ClubStrategy` already carried rather
 * than add a thirteenth slider beside twelve others. Reading the code first
 * changed the job: of the seven, `wageAggression`, `domesticBias`,
 * `targetSquadSize` and `mediaStance` were generated for every club in the
 * world and read by **nothing**. `systemFit` was read in exactly one place,
 * and that place is team selection, which is the head coach's job. Only
 * `youthEmphasis` and `sellingClubStance` did any market work at all.
 *
 * So this is not a presentation layer over working dials. It is the thing that
 * makes four dead numbers do something, and states them as one position the
 * club is known for instead of seven sliders nobody can hold in their head.
 *
 * Three properties matter, and each is a real mechanism rather than a label:
 *
 *  - **Everyone else can read it.** A player weighing a move, an agent pitching
 *    a client, a selling club setting a price and the board judging you all
 *    know what kind of club this is and price accordingly.
 *  - **Changing it costs.** Turning a youth project into a win-now push is a
 *    visible break with what the board signed off, not a slider drag.
 *  - **It constrains the AI too**, so a division contains clubs that recruit
 *    differently and predictably, which is what makes a market feel real.
 *
 * The line it must not cross: this is *market* policy. The moment it starts
 * saying how the team plays, we are doing the head coach's job.
 */

export type { PhilosophyId }

export interface Philosophy {
  id: PhilosophyId
  name: string
  /** One line, in the club's own terms, for the board and the press. */
  summary: string
  /** What it costs you — every philosophy gives something up. */
  tradeOff: string
  /** The dial positions this stance means. Absent keys are left alone. */
  dials: Partial<Pick<ClubStrategy,
    'youthEmphasis' | 'sellingClubStance' | 'wageAggression' | 'domesticBias' | 'targetSquadSize'
  >>
  mediaStance: MediaStance
}

export const PHILOSOPHIES: Philosophy[] = [
  {
    id: 'developAndSell',
    name: 'Develop and sell',
    summary: 'Sign them young, play them, and take the offer when it comes.',
    tradeOff: 'You will lose your best player roughly as often as you find one.',
    dials: {
      youthEmphasis: 82, sellingClubStance: 78, wageAggression: 28,
      domesticBias: 45, targetSquadSize: 24,
    },
    mediaStance: 'open',
  },
  {
    id: 'winNow',
    name: 'Win now',
    summary: 'Proven players, paid properly, and nobody good leaves.',
    tradeOff: 'An ageing squad and a wage bill that does not come down.',
    dials: {
      youthEmphasis: 18, sellingClubStance: 15, wageAggression: 74,
      domesticBias: 40, targetSquadSize: 26,
    },
    mediaStance: 'guarded',
  },
  {
    id: 'valueHunting',
    name: 'Value hunting',
    summary: 'Look where nobody else is looking, and never pay the asking price.',
    tradeOff: 'You will be outbid for anyone obvious, and some of them were right.',
    dials: {
      youthEmphasis: 58, sellingClubStance: 66, wageAggression: 22,
      domesticBias: 12, targetSquadSize: 23,
    },
    mediaStance: 'guarded',
  },
  {
    id: 'homegrown',
    name: 'Homegrown',
    summary: 'From this country and, where we can, from this academy.',
    tradeOff: 'A shallower pool than everyone else is fishing in.',
    dials: {
      youthEmphasis: 72, sellingClubStance: 45, wageAggression: 35,
      domesticBias: 88, targetSquadSize: 24,
    },
    mediaStance: 'open',
  },
  {
    id: 'starNames',
    name: 'Star names',
    summary: 'Sign the player everybody has heard of, and pay what it takes.',
    tradeOff: 'Wages that outgrow the club, and a squad of nine and two.',
    dials: {
      youthEmphasis: 10, sellingClubStance: 20, wageAggression: 92,
      domesticBias: 20, targetSquadSize: 25,
    },
    mediaStance: 'combative',
  },
  {
    id: 'unstated',
    name: 'No stated policy',
    summary: 'Take each window as it comes.',
    tradeOff: 'Nobody outside knows what you are building, and neither does the squad.',
    dials: {},
    mediaStance: 'balanced',
  },
]

export function philosophyById(id: PhilosophyId | undefined): Philosophy {
  return PHILOSOPHIES.find((p) => p.id === id) ?? PHILOSOPHIES[PHILOSOPHIES.length - 1]
}

export function philosophyOf(club: Club): Philosophy {
  return philosophyById(club.strategy.philosophy)
}

/**
 * Weeks a stated policy has to run before it can be changed again.
 *
 * A season and a bit. Long enough that a philosophy is a cycle rather than a
 * setting, short enough that a director who has genuinely got it wrong is not
 * serving a sentence.
 */
export const PHILOSOPHY_LOCK_WEEKS = 60

/** What abandoning a stated policy costs in board confidence. */
export const PHILOSOPHY_CHANGE_COST = 9

export interface PhilosophyChange {
  ok: boolean
  reason: string
  confidenceCost: number
}

/**
 * Whether the board will wear a change of direction, and what it costs.
 *
 * Stating a policy for the first time is free — the board has been waiting to
 * be told. Changing one you already stated is the expensive move, and it is
 * dearer the more recently you stated it, because that is precisely the
 * complaint: you have not given the last one time to work.
 */
export function canChangePhilosophy(
  state: GameState,
  club: Club,
  to: PhilosophyId,
): PhilosophyChange {
  const current = club.strategy.philosophy ?? 'unstated'
  if (current === to) {
    return { ok: false, reason: 'That is already the club\'s stated policy.', confidenceCost: 0 }
  }
  if (current === 'unstated') {
    return {
      ok: true,
      reason: 'The board have been waiting to be told what kind of club this is.',
      confidenceCost: 0,
    }
  }

  const statedWeek = club.strategy.philosophySince ?? 0
  const now = state.date.season * 52 + state.date.week
  const held = now - statedWeek
  if (held < PHILOSOPHY_LOCK_WEEKS) {
    const weeks = PHILOSOPHY_LOCK_WEEKS - held
    return {
      ok: false,
      reason: `You stated this policy ${(held / 52).toFixed(1)} seasons ago. `
        + `The board will not tear it up for another ${weeks} weeks.`,
      confidenceCost: 0,
    }
  }
  return {
    ok: true,
    reason: 'The board will hear the case, but it is a break with what they signed off.',
    confidenceCost: PHILOSOPHY_CHANGE_COST,
  }
}

/** Adopt a policy, moving the underlying dials to match it. */
export function setPhilosophy(state: GameState, club: Club, to: PhilosophyId): void {
  const philosophy = philosophyById(to)
  club.strategy.philosophy = to
  club.strategy.philosophySince = state.date.season * 52 + state.date.week
  club.strategy.mediaStance = philosophy.mediaStance
  for (const [dial, value] of Object.entries(philosophy.dials)) {
    ;(club.strategy as unknown as Record<string, number>)[dial] = value as number
  }
}

/**
 * The policy an AI club of this standing would state.
 *
 * Weighted so a division contains clubs that recruit differently and
 * predictably: rich clubs buy, poor clubs sell, and the middle is where the
 * interesting ones are. A world where every club recruits the same way is a
 * world where the market has no shape.
 */
export function philosophyForAi(rng: Rng, club: Club): PhilosophyId {
  const rich = club.reputation
  const items: PhilosophyId[] = [
    'developAndSell', 'winNow', 'valueHunting', 'homegrown', 'starNames', 'unstated',
  ]
  const weights = [
    rich < 55 ? 30 : 10,              // selling is what smaller clubs live on
    rich > 70 ? 26 : 8,
    rich < 65 ? 20 : 10,
    18,
    rich > 82 && club.finances.balance > 0 ? 14 : 1,
    12,
  ]
  return rng.weighted(items, weights)
}

/**
 * Read a policy off the dials a club already carries.
 *
 * For saves made before policies existed. A club generated to sign young and
 * sell on has been a develop-and-sell club all along and should be told so,
 * rather than assigned something at random and having its dials rewritten
 * under a squad the player already knows.
 */
export function inferPhilosophy(club: Club): PhilosophyId {
  const s = club.strategy
  const youth = s.youthEmphasis ?? 50
  const selling = s.sellingClubStance ?? 50
  const wages = s.wageAggression ?? 50
  const domestic = s.domesticBias ?? 50

  if (domestic >= 78 && youth >= 55) return 'homegrown'
  if (wages >= 80 && youth <= 30) return 'starNames'
  if (youth >= 65 && selling >= 60) return 'developAndSell'
  if (wages >= 62 && selling <= 35) return 'winNow'
  if (domestic <= 30 && wages <= 40) return 'valueHunting'
  return 'unstated'
}

/**
 * How a club's stated policy changes what a player thinks of a move there.
 *
 * This is the part that makes a philosophy legible rather than decorative: a
 * twenty-year-old knows a develop-and-sell club will play him, and a
 * twenty-nine-year-old knows it will not sign him at all.
 */
export function philosophyAppeal(buyer: Club, player: Player): number {
  const young = player.age <= 23
  const old = player.age >= 30
  switch (philosophyOf(buyer).id) {
    case 'developAndSell': return young ? 0.14 : old ? -0.18 : 0
    case 'winNow': return old ? 0.1 : young ? -0.12 : 0.04
    case 'valueHunting': return young ? 0.05 : old ? -0.06 : 0
    case 'homegrown':
      return player.nationalityId === buyer.nationId ? 0.12 : -0.14
    case 'starNames':
      // A big name is flattered; a squad player can see what he would be.
      return player.currentAbility >= buyer.reputation * 1.5 ? 0.2 : -0.08
    default: return 0
  }
}

/**
 * The squad size this club is actually working to.
 *
 * `targetSquadSize` was generated for every club in the world and read by
 * nothing; the AI worked to one hardcoded constant instead, so every club in
 * the game wanted exactly the same number of players.
 */
export function targetSquadFor(club: Club, fallback: number): number {
  const target = club.strategy.targetSquadSize
  return typeof target === 'number' && target > 0 ? clamp(target, 18, 32) : fallback
}
