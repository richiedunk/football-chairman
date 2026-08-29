import { clamp } from '../rng'
import type {
  Club, DirectorProfile, GameState, ID, League, XpAward, XpCategory,
} from '../types'

/**
 * Director career progression.
 *
 * You are a person with a CV, not a disembodied club owner. You start
 * unproven, which means the only clubs that will interview you are the ones
 * nobody else wants, and you climb by demonstrably doing the job: finishing
 * above expectation, turning a profit in the market, graduating academy
 * players, keeping a wage bill under control.
 *
 * Level gates which clubs will consider you. That constraint is what makes an
 * offer from a bigger club feel earned rather than handed over, and it gives
 * a reason to leave a club you have taken as far as it goes.
 */

export interface CareerLevel {
  level: number
  title: string
  /** Total XP required to reach this level. */
  xpRequired: number
  /**
   * Highest club reputation that will consider you. A level 1 director is
   * looking at non-league; a level 10 director gets calls from anyone.
   */
  maxClubReputation: number
  description: string
}

export const CAREER_LEVELS: CareerLevel[] = [
  {
    level: 1, title: 'Unproven', xpRequired: 0, maxClubReputation: 26,
    description: 'Nobody has heard of you. Part-time clubs, a squad of twelve and a photocopier.',
  },
  {
    level: 2, title: 'Journeyman', xpRequired: 900, maxClubReputation: 36,
    description: 'One decent season on the CV. Lower-league clubs will take your call.',
  },
  {
    level: 3, title: 'Recognised', xpRequired: 2_400, maxClubReputation: 46,
    description: 'A reputation for finding players. Third-tier clubs are interested.',
  },
  {
    level: 4, title: 'Established', xpRequired: 5_000, maxClubReputation: 56,
    description: 'You have run a real recruitment department. Second-tier clubs are watching.',
  },
  {
    level: 5, title: 'Respected', xpRequired: 9_000, maxClubReputation: 66,
    description: 'Agents return your calls the same day. Big second-tier and small top-flight jobs.',
  },
  {
    level: 6, title: 'Sought After', xpRequired: 15_000, maxClubReputation: 75,
    description: 'Mid-table top-flight clubs consider you an upgrade on what they have.',
  },
  {
    level: 7, title: 'Elite', xpRequired: 24_000, maxClubReputation: 83,
    description: 'You are named in articles about how clubs should be run.',
  },
  {
    level: 8, title: 'Renowned', xpRequired: 38_000, maxClubReputation: 90,
    description: 'Continental clubs court you. Your name sells a project to a player.',
  },
  {
    level: 9, title: 'Architect', xpRequired: 58_000, maxClubReputation: 96,
    description: 'You have built something that outlasted you. Anyone below the giants will pay.',
  },
  {
    level: 10, title: 'Legendary', xpRequired: 88_000, maxClubReputation: 100,
    description: 'Every job in world football is open to you.',
  },
]

export function levelFor(xp: number): CareerLevel {
  let current = CAREER_LEVELS[0]
  for (const level of CAREER_LEVELS) {
    if (xp >= level.xpRequired) current = level
    else break
  }
  return current
}

export function nextLevel(xp: number): CareerLevel | null {
  const current = levelFor(xp)
  return CAREER_LEVELS.find((l) => l.level === current.level + 1) ?? null
}

/** Progress toward the next level as a 0-1 fraction, for the progress bar. */
export function levelProgress(xp: number): number {
  const current = levelFor(xp)
  const next = nextLevel(xp)
  if (!next) return 1
  const span = next.xpRequired - current.xpRequired
  if (span <= 0) return 1
  return clamp((xp - current.xpRequired) / span, 0, 1)
}

/**
 * Award XP. Everything that grants XP goes through here so the multiplier hook
 * applies uniformly and the season review can itemise where the XP came from.
 */
export function awardXp(
  director: DirectorProfile,
  amount: number,
  reason: string,
  category: XpCategory,
  season: number,
  week: number,
): XpAward {
  const scaled = Math.round(amount * (director.xpMultiplier || 1))
  const award: XpAward = { season, week, reason, amount: scaled, category }
  director.xp += scaled
  director.xpThisSeason += scaled
  director.xpLog.push(award)
  director.level = levelFor(director.xp).level
  return award
}

/**
 * XP awarded for a completed season. Weighted so that *over-performance*
 * matters more than raw finishing position — taking a club expected to finish
 * 18th to 11th is worth more than a rich club finishing 4th as expected.
 */
export function seasonEndXp(
  state: GameState,
  club: Club,
  league: League,
  finalPosition: number,
): { amount: number; reason: string; category: XpCategory }[] {
  const awards: { amount: number; reason: string; category: XpCategory }[] = []
  const expected = club.board.expectation.leaguePosition
  const clubCount = league.clubIds.length

  // Base XP scales with the level you are operating at, so a season in the
  // fourth tier is worth less than a season in the top flight — otherwise
  // there would be no reason to ever take a bigger job.
  const tierFactor = 0.5 + (league.reputation / 100) * 1.5
  awards.push({
    amount: Math.round(180 * tierFactor),
    reason: `Completed a season at ${club.name}`,
    category: 'survival',
  })

  // Over- or under-performance against the board's expectation.
  const delta = expected - finalPosition
  if (delta > 0) {
    awards.push({
      amount: Math.round(delta * 55 * tierFactor),
      reason: `Finished ${finalPosition}${ordinal(finalPosition)}, ${delta} place${delta === 1 ? '' : 's'} above expectation`,
      category: 'results',
    })
  } else if (delta < 0) {
    awards.push({
      amount: Math.round(delta * 30 * tierFactor),
      reason: `Finished ${finalPosition}${ordinal(finalPosition)}, below the board's target of ${expected}${ordinal(expected)}`,
      category: 'results',
    })
  }

  // Winning the division, and promotion, are the headline achievements at the
  // bottom of the pyramid where most careers start.
  if (finalPosition === 1) {
    awards.push({
      amount: Math.round(400 * tierFactor),
      reason: `Won ${league.name}`,
      category: 'trophies',
    })
  }
  if (finalPosition <= league.promotionPlaces && league.promotionPlaces > 0) {
    awards.push({
      amount: Math.round(600 * tierFactor),
      reason: 'Won promotion',
      category: 'promotion',
    })
  }
  if (league.relegationPlaces > 0 && finalPosition > clubCount - league.relegationPlaces) {
    awards.push({
      amount: Math.round(-250 * tierFactor),
      reason: 'Relegated',
      category: 'results',
    })
  }

  // Transfer trading. The core of the job, so it is weighted heavily.
  const ledger = club.finances.season
  const netTransfer = ledger.transfersOut - ledger.transfersIn
  if (netTransfer > 0) {
    awards.push({
      amount: Math.min(900, Math.round((netTransfer / 1_000_000) * 40 * tierFactor)),
      reason: 'Turned a profit in the transfer market',
      category: 'transfers',
    })
  }

  // Financial stewardship: rewarded for a healthy balance, penalised for debt.
  if (club.finances.balance > 0 && !club.finances.inCrisis) {
    awards.push({
      amount: Math.round(120 * tierFactor),
      reason: 'Kept the club solvent',
      category: 'finance',
    })
  }
  if (club.finances.inCrisis) {
    awards.push({ amount: -400, reason: 'Allowed the club to fall into financial crisis', category: 'finance' })
  }

  // Academy graduates who actually played. Counted as senior players who came
  // through the club's own academy and made league appearances.
  const graduates = club.squad
    .map((id) => state.players[id])
    .filter((p) => p && !p.isAcademy && p.joinedSeason <= state.date.season && p.purchaseFee === 0 && p.age <= 23)
    .filter((p) => p!.stats.appearances >= 5)
  if (graduates.length > 0) {
    awards.push({
      amount: Math.round(graduates.length * 90 * tierFactor),
      reason: `${graduates.length} academy graduate${graduates.length === 1 ? '' : 's'} established in the first team`,
      category: 'youth',
    })
  }

  return awards
}

/**
 * Clubs that would consider hiring this director. Level gates the ceiling; a
 * floor exists too, because a club two divisions below your standing does not
 * bother approaching someone who will leave in a season.
 */
export function eligibleClubs(state: GameState, director: DirectorProfile): Club[] {
  const level = levelFor(director.xp)
  const ceiling = level.maxClubReputation
  // The floor sits a level and a half below your ceiling: enough that stepping
  // sideways or slightly down is possible, not so much that every club in the
  // world is on the list.
  const previous = CAREER_LEVELS.find((l) => l.level === Math.max(1, level.level - 2))
  const floor = level.level <= 1 ? 0 : (previous?.maxClubReputation ?? 0) - 6

  return Object.values(state.clubs).filter(
    (club) => club.reputation <= ceiling && club.reputation >= floor,
  )
}

/** Whether a specific club would consider this director at all. */
export function canTakeJobAt(director: DirectorProfile, club: Club): boolean {
  return club.reputation <= levelFor(director.xp).maxClubReputation
}

/**
 * The career level at which a club of this standing becomes reachable.
 *
 * Used by the jobs board to show *why* a job is closed to you and what it
 * would take — a locked entry that says nothing is just a wall, whereas one
 * that names the level and the XP gap is a target.
 */
export function levelRequiredFor(clubReputation: number): CareerLevel {
  for (const level of CAREER_LEVELS) {
    if (clubReputation <= level.maxClubReputation) return level
  }
  return CAREER_LEVELS[CAREER_LEVELS.length - 1]
}

/** XP still needed before a club of this standing will consider you. */
export function xpNeededFor(director: DirectorProfile, clubReputation: number): number {
  const required = levelRequiredFor(clubReputation)
  return Math.max(0, required.xpRequired - director.xp)
}

/**
 * Clubs offered at the start of a brand-new career. Deliberately a short list
 * of genuinely struggling clubs — the opening position is meant to be a mess
 * you have to fix, not a choice between good options.
 */
export function startingClubCandidates(state: GameState, count = 5): Club[] {
  const eligible = Object.values(state.clubs).filter(
    (club) => club.reputation <= CAREER_LEVELS[0].maxClubReputation,
  )
  // Prefer clubs with visible problems: debt, an ageing squad, a thin bench.
  return eligible
    .slice()
    .sort((a, b) => problemScore(state, b) - problemScore(state, a))
    .slice(0, Math.max(count, 1))
}

function problemScore(state: GameState, club: Club): number {
  let score = 0
  if (club.finances.balance < 0) score += 3
  if (club.finances.debt > 0) score += 2
  const squad = club.squad.map((id) => state.players[id]).filter(Boolean)
  if (squad.length < 20) score += 2
  const avgAge = squad.length
    ? squad.reduce((sum, p) => sum + p!.age, 0) / squad.length
    : 26
  if (avgAge > 29) score += 2
  if (club.board.confidence < 50) score += 1
  return score
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

/** Close out the current career entry when leaving a club. */
export function closeCareerEntry(
  director: DirectorProfile,
  clubId: ID,
  season: number,
  outcome: string,
): void {
  const entry = director.careerHistory.find((e) => e.clubId === clubId && e.toSeason === null)
  if (!entry) return
  entry.toSeason = season
  entry.outcome = outcome
}

export function openCareerEntry(
  director: DirectorProfile,
  club: Club,
  season: number,
): void {
  director.careerHistory.push({
    clubId: club.id,
    clubName: club.name,
    fromSeason: season,
    toSeason: null,
    outcome: 'In post',
    bestFinish: 99,
    trophies: [],
    netSpend: 0,
    xpEarned: 0,
  })
}
