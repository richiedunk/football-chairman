import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { createOwner, debtTolerance, OWNER_LABELS, ownerName } from './ownership'
import { recalculateBudgets, weeklyRevenue } from './finance'
import { setSeasonExpectation, setSeasonMandates } from './board'
import { addInboxItem, addNews } from './inbox'
import type { Club, GameState, OwnerKind, Takeover } from '../types'

/**
 * Takeovers.
 *
 * The largest thing that can happen to a director of football, and the one he
 * has least say in. Somebody buys the club, and the plan he was hired to
 * deliver stops being the plan. A takeover is allowed to invalidate three
 * years of work — that is the point of it, and a version that could not would
 * not be worth building.
 *
 * It never costs the job outright. A new owner always lets a director see out
 * the season, however little they rate him. What it costs is standing, and how
 * much depends entirely on who has bought the club and whether the director
 * reads them correctly when he gets his one meeting.
 */

/** Weeks a stage runs for before it advances or falls over. */
const STAGE_WEEKS: Record<string, number> = {
  interest: 4,
  dueDiligence: 6,
  agreed: 3,
}

/**
 * Weeks since the world began.
 *
 * Stage timers have to be measured on an absolute clock. Storing the week
 * number alone meant any approach that began after week 40 saw its elapsed
 * time go negative the moment the season rolled over, so it never advanced and
 * never collapsed: fifty-seven takeovers were sitting frozen mid-negotiation
 * by season ten, and the ones the player could see never completed.
 */
function absoluteWeek(state: GameState): number {
  return state.date.season * 52 + state.date.week
}

/** Takeovers do not happen mid-run-in; the accounts are a season's accounts. */
function isTakeoverSeason(week: number): boolean {
  return week <= 8 || week >= 40
}

/**
 * How attractive a club is to buy.
 *
 * Money follows potential rather than success: a big city, a big support and a
 * league position below what either deserves is exactly what an investor is
 * looking for. Distress attracts a different sort of buyer but attracts them
 * just as strongly.
 */
/**
 * Roughly how long the club has been in financial trouble, in seasons.
 *
 * Derived from how far the debt has run past what the owner will tolerate,
 * because the alternative is another field on the club recording something the
 * numbers already say.
 */
function crisisSeasons(state: GameState, club: Club): number {
  if (!club.finances.inCrisis) return 0
  const tolerated = weeklyRevenue(state, club) * debtTolerance(club.board.owner)
  if (tolerated <= 0) return 0
  return clamp((club.finances.debt / tolerated - 1) * 2.5, 0, 6)
}

export function takeoverAppeal(state: GameState, club: Club): number {
  const league = state.leagues[club.leagueId]
  if (!league) return 0

  let appeal = 0
  // Untapped support is the single biggest draw.
  appeal += (club.fanbase / 100) * 0.5
  // A club playing below the level its support implies.
  const potential = club.fanbase - club.reputation
  if (potential > 0) appeal += (potential / 100) * 0.6
  // A rich division is worth buying into.
  appeal += (league.reputation / 100) * 0.35
  // Distress. A club that cannot pay its way is cheap, and somebody notices.
  //
  // The longer it goes on the louder it gets. A club in trouble for one season
  // is a story; one in trouble for five is a club that will be sold, because
  // in the end somebody always buys it. Without the escalation clubs sat in
  // financial crisis for thirteen and fifteen seasons — a dead club occupying
  // a division — which is the one outcome that is neither football nor a game.
  const owner = club.board.owner
  const tenure = state.date.season - owner.sinceSeason
  if (club.finances.inCrisis) {
    appeal += 0.45 + Math.min(1.2, crisisSeasons(state, club) * 0.35)
  } else if (club.finances.debt > weeklyRevenue(state, club) * 25) {
    appeal += 0.2
  }

  // An owner who has had enough is the other half of it: no seller, no deal.
  if (tenure < 3) appeal *= 0.25
  // Patience protects an owner from being bought out, but not indefinitely and
  // not while the club is going under. Nobody sits through five years of it.
  if (owner.patience > 80 && !club.finances.inCrisis) appeal *= 0.6
  if (club.board.confidence < 30) appeal += 0.15

  return clamp(appeal, 0, 2)
}

/** What kind of buyer a club of this standing attracts. */
function buyerKindFor(rng: Rng, state: GameState, club: Club): OwnerKind {
  const league = state.leagues[club.leagueId]
  const wealth = ((league?.reputation ?? 30) / 100 + club.fanbase / 100) / 2
  const kinds: OwnerKind[] = ['foreignFund', 'consortium', 'celebrity', 'localBusiness', 'fanOwned']
  const weights = [
    2 + Math.pow(wealth, 2.2) * 46,
    6 + wealth * 22,
    4 + wealth * 12,
    26 - wealth * 16,
    // A supporters' trust buying the club is usually a rescue.
    club.finances.inCrisis ? 12 : 3,
  ]
  return rng.weighted(kinds, weights.map((w) => Math.max(0.5, w)))
}

/**
 * Weekly pass. Starts new approaches, advances the ones in progress, and
 * completes or collapses them.
 */
export function processTakeovers(
  state: GameState,
  ids: IdFactory,
  rng: Rng,
  names: { forNation: (n: never) => { firstName: string; lastName: string } },
): void {
  advanceExisting(state, ids, rng)
  if (!isTakeoverSeason(state.date.week)) return

  const active = new Set(state.takeovers.map((t) => t.clubId))
  const clubs = Object.values(state.clubs)

  // A handful of approaches a season across the whole world. Enough that the
  // division looks different after a few years and rivals get rich without
  // warning; not so many that ownership stops meaning anything.
  for (const club of clubs) {
    if (active.has(club.id)) continue
    const appeal = takeoverAppeal(state, club)
    if (appeal <= 0) continue
    if (!rng.chance(appeal * 0.006)) continue

    const nation = state.nations[club.nationId]
    const person = names.forNation(nation as never)
    const kind = buyerKindFor(rng, state, club)
    const incoming = createOwner(
      rng,
      kind,
      ownerName(rng, kind, `${person.firstName} ${person.lastName}`,
        { name: club.city, size: 50 }),
      state.date.season,
      kind === 'consortium' && rng.chance(0.4) ? rng.int(55, 85) : 100,
    )

    const takeover: Takeover = {
      id: ids.next(ID_PREFIX.takeover),
      clubId: club.id,
      stage: 'interest',
      incoming,
      stageSince: absoluteWeek(state),
      season: state.date.season,
      public: false,
      collapseReason: null,
    }
    state.takeovers.push(takeover)
    active.add(club.id)
  }
}

function advanceExisting(state: GameState, ids: IdFactory, rng: Rng): void {
  const remaining: Takeover[] = []

  for (const takeover of state.takeovers) {
    const club = state.clubs[takeover.clubId]
    if (!club) continue

    const elapsed = absoluteWeek(state) - takeover.stageSince
    const isPlayerClub = club.id === state.playerClubId

    // It leaks. A deal nobody hears about is a number changing overnight, and
    // half the value of a takeover is the fortnight of speculation first.
    if (!takeover.public && elapsed >= 1 && rng.chance(0.35)) {
      takeover.public = true
      if (isPlayerClub) {
        addInboxItem(state, ids, {
          category: 'media',
          subject: `${club.name} takeover talk`,
          from: 'Press Officer',
          body: `Reports this morning say ${takeover.incoming.name} have approached the owners about buying the club. `
            + 'Nobody at the club has confirmed anything and you were not consulted.',
          link: { view: 'board' },
        })
      } else {
        addNews(state, ids, 'board',
          `${takeover.incoming.name} are reported to be interested in buying ${club.name}.`,
          { view: 'league' }, club.id)
      }
    }

    const window = STAGE_WEEKS[takeover.stage] ?? 4
    if (elapsed < window) {
      remaining.push(takeover)
      continue
    }

    // Deals fall over, and more often the further from completion they are.
    const collapseChance = takeover.stage === 'interest' ? 0.4
      : takeover.stage === 'dueDiligence' ? 0.25
      : 0.1
    if (rng.chance(collapseChance)) {
      const reason = rng.pick([
        'the two sides could not agree a price',
        'the buyers walked away after examining the accounts',
        'the funding behind the bid did not materialise',
        'the owners decided not to sell after all',
      ])
      if (isPlayerClub) {
        addNews(state, ids, 'board', `The takeover of ${club.name} has collapsed — ${reason}.`,
          { view: 'board' })
      }
      continue
    }

    if (takeover.stage === 'interest') {
      takeover.stage = 'dueDiligence'
      takeover.stageSince = absoluteWeek(state)
      remaining.push(takeover)
      continue
    }
    if (takeover.stage === 'dueDiligence') {
      takeover.stage = 'agreed'
      takeover.stageSince = absoluteWeek(state)
      if (isPlayerClub) {
        addInboxItem(state, ids, {
          category: 'board',
          subject: 'Takeover agreed in principle',
          from: 'Chairman',
          body: `The sale of the club to ${takeover.incoming.name} has been agreed in principle and should `
            + 'complete within the month. I have told them you are worth keeping. Beyond that it is out of my hands.',
          urgent: true,
          link: { view: 'board' },
        })
      }
      remaining.push(takeover)
      continue
    }

    completeTakeover(state, ids, club, takeover)
  }

  state.takeovers = remaining
}

/**
 * Hand the club over.
 *
 * Everything the board does keys off the owner, so the change propagates by
 * itself: budgets, expectations, mandates, patience, how a request is heard.
 * What is done explicitly here is the rest of it — the money a buyer puts in
 * on day one, what it does to the club's standing and support, and the fact
 * that the director's accumulated goodwill is not transferable.
 */
export function completeTakeover(
  state: GameState,
  ids: IdFactory,
  club: Club,
  takeover: Takeover,
): void {
  const previous = club.board.owner
  const incoming = takeover.incoming
  incoming.sinceSeason = state.date.season
  club.board.owner = incoming

  // The debt is part of what has been bought, and settling it is the condition
  // of the sale.
  //
  // A wealthy buyer clears it outright. Anyone buying a club that was actually
  // in crisis restructures it down to something the new owner can service,
  // whatever their means, because otherwise there is no deal to do — nobody
  // buys a business they cannot then run. Without this a rescue was not a
  // rescue: a club bought by a modest owner stayed in crisis under him, and
  // clubs sat in it for thirteen and fifteen seasons while being sold along
  // the way.
  if (club.finances.debt > 0) {
    if (incoming.wealth >= 70) {
      club.finances.debt = Math.round(club.finances.debt * (1 - (incoming.wealth - 70) / 40))
    }
    if (club.finances.inCrisis) {
      const serviceable = Math.round(
        weeklyRevenue(state, club) * debtTolerance(incoming) * 0.6,
      )
      club.finances.debt = Math.min(club.finances.debt, serviceable)
    }
    club.finances.inCrisis = false
  }

  // Money in on completion, sized by how deep the pockets are.
  const injection = Math.round(
    weeklyRevenue(state, club) * 52 * clamp((incoming.wealth - 30) / 100, 0, 0.8),
  )
  if (injection > 0) {
    club.finances.balance += injection
    club.finances.season.otherIncome += injection
  }

  // A famous name sells shirts and fills seats; a fund makes the club a
  // destination. They are different currencies and they buy different things.
  if (incoming.kind === 'celebrity') {
    club.fanbase = clamp(club.fanbase + 9, 0, 100)
    club.reputation = clamp(club.reputation + 2, 3, 99)
  } else if (incoming.kind === 'foreignFund') {
    club.reputation = clamp(club.reputation + 5, 3, 99)
    club.fanbase = clamp(club.fanbase + 2, 0, 100)
  } else if (incoming.kind === 'fanOwned') {
    club.fanbase = clamp(club.fanbase + 5, 0, 100)
  }
  club.fanMood = clamp(club.fanMood + (incoming.wealth > 60 ? 16 : 6), 0, 100)

  const league = state.leagues[club.leagueId]
  if (league) setSeasonExpectation(state, club, league)
  setSeasonMandates(state, club)
  recalculateBudgets(state, club)

  if (club.id !== state.playerClubId) {
    addNews(state, ids, 'board',
      `${club.name} have been bought by ${incoming.name}. ${OWNER_LABELS[incoming.kind]}.`,
      { view: 'league' })
    return
  }

  // Goodwill is not transferable. Whatever the last board thought of you, this
  // one starts from what it has read — and a season to make up its own mind.
  club.board.warnings = 0
  club.board.graceUntilSeason = state.date.season
  club.board.confidence = clamp(45 + (club.board.confidence - 50) * 0.35, 20, 70)
  incoming.faithInDirector = 50

  addInboxItem(state, ids, {
    category: 'board',
    subject: `${incoming.name} have completed their purchase`,
    from: 'Chairman',
    body: `The sale is done. ${previous.name} have gone and ${incoming.name} own the club. `
      + `${OWNER_LABELS[incoming.kind]}. They want to meet you before they decide anything.`,
    urgent: true,
    decision: {
      prompt: 'They have asked what you would do with the club. You get one answer, and it is '
        + 'the only say you will have in any of this.',
      options: PITCH_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        hint: option.hint,
        available: true,
      })),
      defaultOptionId: 'consolidate',
    },
    payload: { kind: 'ownerPitch' },
    link: { view: 'board' },
  })
}

/**
 * The one meeting.
 *
 * Three plans, and the right answer is whichever the people who just bought
 * the club already believe. That is not a puzzle with a hidden solution — the
 * owner's type and traits are on the boardroom screen before you answer — it
 * is a test of whether the director bothered to find out who he is working
 * for.
 */
export const PITCH_OPTIONS = [
  {
    id: 'push',
    label: 'Go for it now',
    hint: 'Spend, sign, and chase promotion this season.',
    detail: 'Ambitious owners want to hear it. Careful ones hear recklessness.',
  },
  {
    id: 'youth',
    label: 'Build through the academy',
    hint: 'A three-year project, cheaper and slower.',
    detail: 'The right answer for a patient owner and the wrong one for a fund.',
  },
  {
    id: 'consolidate',
    label: 'Steady the club first',
    hint: 'Wages down, books balanced, no gambles.',
    detail: 'Reassures anyone cautious; sounds like no ambition at all to anyone else.',
  },
] as const

export type PitchId = typeof PITCH_OPTIONS[number]['id']

/**
 * How well a plan lands, from -1 to 1.
 *
 * Read straight off the owner's traits, so a director who has looked at the
 * boardroom screen knows the answer and one who has not is guessing.
 */
export function pitchFit(owner: { ambition: number; patience: number; youthBelief: number; leverage: number }, pitch: PitchId): number {
  const ambition = owner.ambition / 100
  const patience = owner.patience / 100
  const youth = owner.youthBelief / 100
  const prudence = 1 - owner.leverage / 100

  switch (pitch) {
    case 'push':
      return clamp(ambition * 1.4 - patience * 0.6 - prudence * 0.4, -1, 1)
    case 'youth':
      return clamp(youth * 1.3 + patience * 0.6 - ambition * 0.8, -1, 1)
    case 'consolidate':
      return clamp(prudence * 1.0 + patience * 0.7 - ambition * 0.9, -1, 1)
  }
}

/**
 * Apply the pitch. Returns the line the director is told afterwards.
 *
 * Reading the room correctly is worth standing and money; misreading it costs
 * the season's goodwill. It never costs the job — that guarantee is the whole
 * reason the meeting is worth having rather than dreading.
 */
export function resolveOwnerPitch(club: Club, pitch: PitchId): string {
  const owner = club.board.owner
  const fit = pitchFit(owner, pitch)

  owner.faithInDirector = clamp(Math.round(50 + fit * 42), 5, 95)
  club.board.confidence = clamp(club.board.confidence + fit * 22, 5, 95)

  if (fit > 0.35) {
    // They liked it enough to back it.
    const bump = Math.round(club.finances.transferBudget * (0.2 + fit * 0.5))
    club.finances.transferBudget += bump
    return 'They liked what they heard. You have their backing, and a budget to go with it.'
  }
  if (fit > -0.15) {
    return 'They listened, thanked you, and told you nothing. You keep your job and no more than that.'
  }
  return 'It went badly. They think you are the wrong man for what they want to do here, '
    + 'and you have a season to change their minds.'
}
