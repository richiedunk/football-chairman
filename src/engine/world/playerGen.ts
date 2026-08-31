import { clamp, Rng } from '../rng'
import type {
  Contract, ID, Nation, Player, PlayerTrait, Position, SquadStatus,
} from '../types'
import { IdFactory, ID_PREFIX } from '../ids'
import { generateAttributes, positionGroup } from './attributes'
import type { NameGenerator } from '../names/generator'

/**
 * Player generation.
 *
 * Squads are built to a *shape* rather than by rolling 25 random players: a
 * real squad has two or three keepers, a spine of first-teamers, a tail of
 * squad players and a couple of teenagers. Generating that shape is what makes
 * the squad screen feel like a football club instead of a spreadsheet, and it
 * is what gives the director of football something to fix.
 */

/** Positions a squad needs, and how many of each, for a 25-man senior squad. */
const SQUAD_SHAPE: { position: Position; count: number }[] = [
  { position: 'GK', count: 3 },
  { position: 'DC', count: 4 },
  { position: 'DL', count: 2 },
  { position: 'DR', count: 2 },
  { position: 'DM', count: 2 },
  { position: 'MC', count: 4 },
  { position: 'ML', count: 2 },
  { position: 'MR', count: 2 },
  { position: 'AM', count: 2 },
  { position: 'ST', count: 3 },
]

/**
 * Where a squad's quality sits relative to its best player. Index 0 is the best
 * player in the squad, and the tail runs down to fringe players and kids. The
 * shape of this curve is why a squad has a "spine" worth protecting.
 */
const SQUAD_QUALITY_CURVE = [
  1.00, 0.98, 0.96, 0.95, 0.93, 0.92, 0.90, 0.89, 0.87, 0.86,
  0.84, 0.82, 0.80, 0.78, 0.76, 0.73, 0.71, 0.68, 0.65, 0.62,
  0.58, 0.55, 0.51, 0.47, 0.43, 0.40, 0.37, 0.34,
]

const TRAIT_POOL: { trait: PlayerTrait; weight: number }[] = [
  { trait: 'leader', weight: 8 },
  { trait: 'hothead', weight: 7 },
  { trait: 'professional', weight: 12 },
  { trait: 'mercenary', weight: 8 },
  { trait: 'loyal', weight: 8 },
  { trait: 'injuryProne', weight: 6 },
  { trait: 'lateDeveloper', weight: 5 },
  { trait: 'mediaDarling', weight: 6 },
  { trait: 'mediaShy', weight: 6 },
  { trait: 'bigGameplayer', weight: 6 },
  { trait: 'inconsistent', weight: 9 },
  { trait: 'ambitious', weight: 10 },
  { trait: 'homesick', weight: 4 },
  { trait: 'disruptive', weight: 3 },
  { trait: 'versatile', weight: 7 },
]

export interface PlayerGenContext {
  rng: Rng
  ids: IdFactory
  names: NameGenerator
  nations: Nation[]
  season: number
}

export interface PlayerGenOptions {
  position: Position
  /** Target current ability, 1-200. */
  currentAbility: number
  /** Nation the player is most likely to come from. */
  homeNation: Nation
  /** Chance the player is foreign to `homeNation`. */
  foreignChance: number
  clubId: ID | null
  age?: number
  isAcademy?: boolean
  squadStatus?: SquadStatus
  /** Wage the club will pay; if omitted, derived from ability at generation. */
  wage?: number
  contractSeasons?: number
}

export function generatePlayer(ctx: PlayerGenContext, opts: PlayerGenOptions): Player {
  const { rng, ids, names, season } = ctx

  const nationality = pickNationality(ctx, opts)
  const age = opts.age ?? generateAge(rng, opts.currentAbility, opts.isAcademy ?? false)

  // Potential. Young players carry real headroom; by 27 potential and current
  // have converged, which is exactly why the market prices 27-year-olds on
  // output and 20-year-olds on hope.
  const potentialAbility = generatePotential(rng, opts.currentAbility, age)

  const attributes = generateAttributes(
    rng,
    opts.position,
    opts.currentAbility,
    rng.float(0.25, 0.9),
  )

  const traits = rollTraits(rng, age, opts.currentAbility, potentialAbility)
  const altPositions = rollAltPositions(rng, opts.position, traits.includes('versatile'))

  const name = names.forNation(nationality, { youthProspect: age <= 19 })

  const contract: Contract | null = opts.clubId
    ? {
        wage: opts.wage ?? 0,
        expiresSeason: season + (opts.contractSeasons ?? contractLengthFor(rng, age)),
        signingBonus: 0,
        releaseClause: rng.chance(0.12) ? 0 : null, // filled in by the caller
        appearanceFee: 0,
        goalBonus: 0,
        loyaltyBonus: 0,
        inNegotiation: false,
        weeksSinceRenewalRequest: 0,
      }
    : null

  const player: Player = {
    id: ids.next(ID_PREFIX.player),
    firstName: name.firstName,
    lastName: name.lastName,
    knownAs: name.knownAs,
    nationalityId: nationality.id,
    secondNationalityId: rollSecondNationality(ctx, nationality),
    age,
    birthWeek: rng.int(1, 52),
    position: opts.position,
    altPositions,
    attributes,
    currentAbility: opts.currentAbility,
    potentialAbility,
    clubId: opts.clubId,
    loanClubId: null,
    loanUntilSeason: null,
    loanWageShare: 0,
    contract,
    agentId: null,
    morale: rng.normalInt(68, 12, 20, 95),
    form: rng.normalInt(55, 14, 15, 92),
    fitness: rng.normalInt(88, 8, 55, 100),
    injuryProneness: traits.includes('injuryProne')
      ? rng.normalInt(64, 10, 40, 92)
      : rng.normalInt(28, 14, 3, 70),
    injury: null,
    suspendedWeeks: 0,
    squadStatus: opts.squadStatus ?? 'rotation',
    desiredStatus: opts.squadStatus ?? 'rotation',
    traits,
    loyalty: rng.normalInt(traits.includes('loyal') ? 76 : 48, 16, 5, 98),
    ambitionVsMoney: traits.includes('mercenary')
      ? rng.normalInt(78, 10, 45, 99)
      : rng.normalInt(48, 18, 5, 95),
    value: 0, // computed by the caller once league context exists
    wageDemand: 0,
    transferRequested: false,
    listedForTransfer: false,
    listedForLoan: false,
    stats: emptyStats(),
    careerStats: [],
    interestedClubIds: [],
    isAcademy: opts.isAcademy ?? false,
    joinedSeason: season - Math.min(rng.int(0, 6), Math.max(0, age - 17)),
    purchaseFee: 0,
    bookValue: 0,
    amortisationCharge: 0,
    sellOnClauseOwed: [],
    buyBack: null,
    caps: 0,
    internationalUntilWeek: null,
    tournamentStock: 0,
    academyRelease: null,
    gotAwayReported: false,
    developmentRate: rng.float(0.7, 1.35),
    trainingYears: seedTrainingYears(rng, nationality, opts, age),
    weeksUnattached: 0,
  }

  return player
}

/**
 * Where a generated player was trained, for homegrown status.
 *
 * A world that starts with everyone homegrown makes the squad-registration
 * ceiling inert, and one that starts with nobody homegrown makes it
 * impossible. The split below is the realistic one: the overwhelming majority
 * of players came through the system of the country they represent, a small
 * minority moved abroad young enough to qualify where they now play, and an
 * academy graduate is homegrown by definition.
 */
function seedTrainingYears(
  rng: Rng,
  nationality: Nation,
  opts: PlayerGenOptions,
  age: number,
): Record<ID, number> {
  const years: Record<ID, number> = {}
  if (opts.isAcademy) {
    years[opts.homeNation.id] = 3 + Math.min(3, Math.max(0, age - 16))
    return years
  }

  const trainedAtHome = rng.chance(nationality.id === opts.homeNation.id ? 0.92 : 0.08)
  const trainedIn = trainedAtHome ? opts.homeNation.id : nationality.id
  years[trainedIn] = 3 + rng.int(0, 3)
  return years
}

/**
 * Build a full squad for a club of a given standard.
 *
 * `clubStrength` is the club's reputation, 0-100, mapped onto the ability of
 * its best player. The rest of the squad falls away along SQUAD_QUALITY_CURVE.
 */
/**
 * The ability of the best player a club of a given standing would have.
 *
 * Deliberately convex: a linear mapping hands 180-rated players to every
 * mid-table top-flight club, and the world ends up with hundreds of elite
 * players instead of the couple of dozen that make the top of the market feel
 * scarce. Squad generation and AI recruitment both work off this, so a club's
 * idea of "someone at our level" means the same thing in both places.
 */
export function abilityCeilingFor(clubStrength: number): number {
  return clamp(45 + Math.pow(clubStrength / 100, 1.55) * 148, 42, 194)
}

export function generateSquad(
  ctx: PlayerGenContext,
  clubId: ID,
  clubStrength: number,
  homeNation: Nation,
  foreignChance: number,
): Player[] {
  const { rng } = ctx
  // Map club reputation onto the ability of the club's best player. The
  // mapping is deliberately convex: a linear one hands 180-rated players to
  // every mid-table top-flight club, and the world ends up with hundreds of
  // elite players instead of the couple of dozen that make the top of the
  // market feel scarce.
  const bestAbility = abilityCeilingFor(clubStrength)

  const slots: Position[] = []
  for (const { position, count } of SQUAD_SHAPE) {
    for (let i = 0; i < count; i++) slots.push(position)
  }

  // Assign quality ranks. Shuffling positions against the curve means the best
  // player might be a centre-back or a striker, as it should be.
  const order = rng.shuffle(slots)
  const players: Player[] = []

  for (let i = 0; i < order.length; i++) {
    const curve = SQUAD_QUALITY_CURVE[Math.min(i, SQUAD_QUALITY_CURVE.length - 1)]
    const noise = rng.normal(0, 4)
    const ability = clamp(bestAbility * curve + noise, 30, 198)

    const squadStatus: SquadStatus =
      i < 2 ? 'star' : i < 11 ? 'firstTeam' : i < 17 ? 'rotation' : i < 22 ? 'backup' : 'prospect'

    players.push(
      generatePlayer(ctx, {
        position: order[i],
        currentAbility: Math.round(ability),
        homeNation,
        foreignChance,
        clubId,
        squadStatus,
        // The tail of the squad is deliberately young — these are the fringe
        // players and academy graduates a director of football is meant to
        // either develop, loan out, or move on.
        age: i >= 22
          ? rng.int(Math.max(MIN_SENIOR_AGE, minAgeForAbility(Math.round(ability))), 21)
          : undefined,
      }),
    )
  }

  return players
}

/**
 * Academy intake. Deliberately noisy: most youth players never make it, and
 * the occasional generational talent is what keeps the youth system worth
 * funding. Facility level shifts both the average and the tail.
 */
export function generateYouthIntake(
  ctx: PlayerGenContext,
  clubId: ID,
  homeNation: Nation,
  youthFacilityLevel: number,
  academyDirectorSkill: number,
  count: number,
  /**
   * How far this club's academy recruits, from its `domesticBias`. An academy
   * is the most local thing a club has — a club that looks at home barely has
   * a foreign teenager on the books, and one that scouts the world has a few.
   * Held to a flat one-in-eight everywhere, the academy quietly imported the
   * same share of foreigners into a homegrown club as into a global one.
   */
  foreignChance = 0.12,
): Player[] {
  const { rng } = ctx
  const out: Player[] = []

  // Facilities raise the floor; the academy director raises the ceiling. That
  // asymmetry means the two investments are not interchangeable.
  const floor = 28 + youthFacilityLevel * 1.6
  const ceiling = 70 + youthFacilityLevel * 2.2 + academyDirectorSkill * 0.55

  for (let i = 0; i < count; i++) {
    const position = rng.weightedPairs<Position>([
      ['GK', 8], ['DC', 14], ['DL', 8], ['DR', 8], ['DM', 8],
      ['MC', 16], ['ML', 8], ['MR', 8], ['AM', 10], ['ST', 12],
    ])
    const age = rng.int(15, 18)
    // The wonderkid roll. Rare enough that finding one is an event, common
    // enough that a well-funded academy pays for itself over a decade.
    const wonderkidChance = 0.012 + youthFacilityLevel * 0.0035 + academyDirectorSkill * 0.0004
    const isWonderkid = rng.chance(wonderkidChance)

    // A genuine prospect is already noticeably better than his intake, not a
    // hopeless teenager with a hidden number attached. That matters because the
    // coach decides who plays: a 50-rated wonderkid would never get on the pitch
    // to develop, and the talent would rot in the reserves.
    //
    // The age ceiling still applies. A well-funded academy could otherwise
    // produce a 15-year-old rated above what any 15-year-old has ever been,
    // which contradicts the same curve squad generation is held to.
    const ceilingForAge = maxAbilityForAge(age)
    const currentAbility = Math.round(
      clamp(
        isWonderkid ? rng.normal(floor + 46, 12) : rng.normal(floor + 12, 10),
        20,
        Math.min(isWonderkid ? 130 : 95, ceilingForAge),
      ),
    )

    const potentialCeiling = isWonderkid
      ? clamp(rng.normal(168, 12), 140, 198)
      : clamp(rng.normal(ceiling, 22), currentAbility + 4, 185)

    const player = generatePlayer(ctx, {
      position,
      currentAbility,
      homeNation,
      foreignChance,
      clubId,
      age,
      isAcademy: true,
      squadStatus: 'prospect',
      contractSeasons: 3,
    })
    player.potentialAbility = Math.round(potentialCeiling)
    if (isWonderkid && !player.traits.includes('wonderkid')) player.traits.push('wonderkid')
    player.joinedSeason = ctx.season
    out.push(player)
  }

  return out
}

// ---------------------------------------------------------------------------

function pickNationality(ctx: PlayerGenContext, opts: PlayerGenOptions): Nation {
  if (!ctx.rng.chance(opts.foreignChance)) return opts.homeNation
  // Foreign players skew toward strong footballing nations rather than being
  // uniformly distributed — that is what makes a Brazilian in the Championship
  // read as a signing rather than as noise.
  const candidates = ctx.nations.filter((n) => n.id !== opts.homeNation.id)
  if (candidates.length === 0) return opts.homeNation
  return ctx.rng.weighted(candidates, candidates.map((n) => Math.pow(n.reputation / 10, 2)))
}

function rollSecondNationality(ctx: PlayerGenContext, primary: Nation): ID | null {
  if (!ctx.rng.chance(0.14)) return null
  const candidates = ctx.nations.filter((n) => n.id !== primary.id)
  if (candidates.length === 0) return null
  return ctx.rng.pick(candidates).id
}

/**
 * The highest ability a player of a given age can plausibly have reached.
 *
 * Without this, squad generation happily produces a 16-year-old rated among
 * the best players in the world — which breaks the entire youth-development
 * premise, since there is then nothing left for him to develop into.
 * The curve allows a 22-year-old to be world class and a 19-year-old to be
 * very good, which is where the real ceiling sits.
 */
export function maxAbilityForAge(age: number): number {
  if (age >= 23) return 200
  return 70 + (age - 15) * 17
}

/**
 * Youngest age at which a *senior professional* may exist.
 *
 * Seventeen, because that is when a professional contract can first be signed
 * in the countries this game models — a fifteen-year-old is a scholar, and
 * belongs in the academy where the game already puts them. World generation
 * used to allow fifteen straight into a first-team squad, which produced
 * fourteen of them across a compact world, one rated 84 and his club's
 * fourth-best player.
 */
export const MIN_SENIOR_AGE = 17

/** Youngest age at which `ability` is credible. Inverse of maxAbilityForAge. */
export function minAgeForAbility(ability: number): number {
  if (ability <= 70) return 15
  return clamp(Math.ceil(15 + (ability - 70) / 17), 15, 23)
}

function generateAge(rng: Rng, ability: number, isAcademy: boolean): number {
  // Better players skew slightly older because ability takes time to accrue,
  // but the distribution stays wide enough for genuine young stars to exist.
  const base = rng.normal(25.5, 4.2)
  const abilityShift = (ability - 100) / 60
  // Two floors, not one. The ability curve says how young someone *could* be
  // and still be that good; the professional-age rule says how young a senior
  // squad member may be at all. A schoolboy prodigy is generated into the
  // academy, and reaches the first team by being promoted.
  const floor = isAcademy
    ? minAgeForAbility(ability)
    : Math.max(MIN_SENIOR_AGE, minAgeForAbility(ability))
  return clamp(Math.round(base + abilityShift), floor, 38)
}

function generatePotential(rng: Rng, currentAbility: number, age: number): number {
  if (age >= 29) return currentAbility
  // Headroom shrinks steeply with age. A 17-year-old can double; a 26-year-old
  // has maybe five points left in him.
  const yearsLeft = Math.max(0, 27 - age)
  const maxHeadroom = yearsLeft * 8.5
  const headroom = Math.abs(rng.normal(0, maxHeadroom * 0.42))
  return Math.round(clamp(currentAbility + headroom, currentAbility, 198))
}

function rollTraits(
  rng: Rng,
  age: number,
  currentAbility: number,
  potentialAbility: number,
): PlayerTrait[] {
  const traits: PlayerTrait[] = []
  const count = rng.weightedPairs([[0, 12], [1, 34], [2, 34], [3, 16], [4, 4]])
  const pool = TRAIT_POOL.slice()

  for (let i = 0; i < count && pool.length > 0; i++) {
    const chosen = rng.weighted(pool, pool.map((t) => t.weight))
    traits.push(chosen.trait)
    const idx = pool.indexOf(chosen)
    pool.splice(idx, 1)
  }

  // Derived traits that describe a situation rather than a personality.
  if (age <= 20 && potentialAbility - currentAbility > 55 && !traits.includes('wonderkid')) {
    traits.push('wonderkid')
  }
  if (age >= 21 && age <= 24 && potentialAbility - currentAbility > 35 && !traits.includes('lateDeveloper')) {
    if (rng.chance(0.4)) traits.push('lateDeveloper')
  }
  return traits
}

function rollAltPositions(rng: Rng, natural: Position, versatile: boolean): Position[] {
  if (natural === 'GK') return []
  const count = versatile ? rng.int(1, 3) : rng.weightedPairs([[0, 55], [1, 34], [2, 11]])
  if (count === 0) return []

  const adjacency: Record<Position, Position[]> = {
    GK: [],
    DC: ['DM', 'DL', 'DR'],
    DL: ['ML', 'DC', 'DR'],
    DR: ['MR', 'DC', 'DL'],
    DM: ['MC', 'DC'],
    MC: ['DM', 'AM', 'ML', 'MR'],
    ML: ['DL', 'AM', 'MC', 'ST'],
    MR: ['DR', 'AM', 'MC', 'ST'],
    AM: ['MC', 'ST', 'ML', 'MR'],
    ST: ['AM', 'ML', 'MR'],
  }
  return rng.sample(adjacency[natural], count)
}

function contractLengthFor(rng: Rng, age: number): number {
  if (age <= 21) return rng.int(3, 5)
  if (age <= 27) return rng.int(2, 5)
  if (age <= 31) return rng.int(1, 3)
  return rng.int(1, 2)
}

export function emptyStats() {
  return {
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    ratingSum: 0,
    motmAwards: 0,
  }
}

/** Squad-shape audit used by the coach's requests and the squad screen. */
export function countByPositionGroup(players: Player[]): Record<string, number> {
  const counts: Record<string, number> = {
    goalkeeper: 0, defender: 0, midfielder: 0, forward: 0,
  }
  for (const p of players) counts[positionGroup(p.position)]++
  return counts
}
