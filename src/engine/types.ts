/**
 * Domain model for the simulation.
 *
 * Everything here is a plain serialisable structure — no classes, no methods,
 * no Vue reactivity. The entire GameState must survive `JSON.stringify` and
 * come back identical, because that is exactly what the save system does.
 *
 * Entities live in flat id-keyed tables on GameState rather than as nested
 * objects, so that a player can be referenced from a squad, a scout report, a
 * transfer negotiation and a media story without four copies drifting apart.
 */

export type ID = string

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * The game clock. A season is 52 weeks starting in week 1 (early July,
 * pre-season) and matches run roughly weeks 6-44, leaving a summer window.
 */
export interface GameDate {
  season: number // calendar year the season starts in, e.g. 2025 for 2025/26
  week: number // 1-52
}

export type SeasonPhase =
  | 'preseason'
  | 'earlySeason'
  | 'autumn'
  | 'winterWindow'
  | 'runIn'
  | 'endOfSeason'
  | 'summerWindow'

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export interface Nation {
  id: ID
  name: string
  adjective: string
  code: string // 3-letter code, e.g. ENG
  /** 0-100. Drives league strength, wages, and who a player will move to. */
  reputation: number
  /** Multiplier on wages and transfer fees in this nation's market. */
  economyFactor: number
  /** Name pool this nation draws from (may be shared, e.g. Austria/Germany). */
  namePool: string
  /**
   * Secondary name pools with weights, modelling diaspora and immigration —
   * a French academy produces French, Maghrebi and West African names.
   */
  secondaryPools: { pool: string; weight: number }[]
  cities: City[]
  leagueIds: ID[]
  /** Continental confederation, for continental competition eligibility. */
  confederation: Confederation
  /** Rough population in millions — scales how many big clubs it supports. */
  population: number
}

export interface City {
  name: string
  /** 0-100 — larger cities support bigger clubs and bigger stadiums. */
  size: number
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export interface League {
  id: ID
  nationId: ID
  name: string
  tier: number // 1 = top flight
  clubIds: ID[]
  /** 0-100, derived from member clubs; drives player interest and TV money. */
  reputation: number
  promotionPlaces: number
  playoffPlaces: number
  relegationPlaces: number
  /** Prize money for finishing 1st, in whole currency units. */
  prizeMoneyTop: number
  /** Prize money for finishing last. Positions interpolate between. */
  prizeMoneyBottom: number
  /** Base per-club TV/central distribution for the season. */
  tvRevenue: number
  /** Continental qualification: league positions granted a place. */
  continentalPlaces: { competition: ContinentalTier; positions: number[] }[]
}

export type ContinentalTier = 'elite' | 'secondary' | 'none'

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC'

export interface LeagueTableRow {
  clubId: ID
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
  /** Last six results, most recent last. */
  form: MatchOutcome[]
}

export type MatchOutcome = 'W' | 'D' | 'L'

export interface Fixture {
  id: ID
  competitionId: ID
  competitionType: 'league' | 'cup' | 'continental'
  round: number
  week: number
  season: number
  homeClubId: ID
  awayClubId: ID
  result?: MatchResult
  /** Cup ties only: leg number and aggregate partner. */
  legOf?: { tieId: ID; leg: 1 | 2 }
}

export interface MatchResult {
  homeGoals: number
  awayGoals: number
  /** Post-extra-time / shootout scores for knockout ties. */
  penalties?: { home: number; away: number }
  events: MatchEvent[]
  /** Per-player performance ratings, 0.0-10.0. */
  ratings: Record<ID, number>
  homeLineup: ID[]
  awayLineup: ID[]
  possession: number // home share, 0-100
  shots: { home: number; away: number }
  shotsOnTarget: { home: number; away: number }
  attendance: number
  /** One-line verdict used in the results feed. */
  summary: string
}

export type MatchEventType =
  | 'goal'
  | 'ownGoal'
  | 'penaltyScored'
  | 'penaltyMissed'
  | 'yellowCard'
  | 'redCard'
  | 'injury'
  | 'substitution'
  | 'chanceMissed'
  | 'save'

export interface MatchEvent {
  minute: number
  type: MatchEventType
  clubId: ID
  playerId: ID
  /** Assister, fouled player, or the player coming on. */
  secondaryPlayerId?: ID
  text: string
}

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

export interface Club {
  id: ID
  name: string
  shortName: string
  nickname: string
  nationId: ID
  city: string
  leagueId: ID
  founded: number
  colors: { primary: string; secondary: string }
  /** 0-100. Drives who will sign, sponsorship, attendance, media interest. */
  reputation: number
  /** Reputation across the continent — lags domestic reputation. */
  continentalReputation: number
  finances: ClubFinances
  facilities: Facilities
  /** Player ids the club owns, including those it has loaned out. */
  squad: ID[]
  /**
   * Players borrowed from other clubs. Kept separate from `squad` because the
   * club may select them but does not own them — merging the two would make a
   * loanee sellable, and splitting ownership from availability is the only
   * honest way to model it.
   */
  loanedIn: ID[]
  /** Staff ids, including the head coach. */
  staff: ID[]
  headCoachId: ID | null
  /** The club's own strategy dials, set by the director of football. */
  strategy: ClubStrategy
  board: BoardState
  /** Historical league positions, most recent last. */
  history: SeasonHistory[]
  /** Local support base 0-100 — floors attendance regardless of form. */
  fanbase: number
  fanMood: number // 0-100
  /** True for the club the human player runs. */
  isPlayerClub: boolean
  /**
   * The senior players named on the squad list.
   *
   * Under-21s are outside it and unlimited; anyone older who is not on this
   * list cannot be picked at all. Set during a window and locked in between,
   * which is what turns a January signing into a decision about who gets
   * left out rather than a free addition.
   */
  registeredIds: ID[]
}

export interface ClubFinances {
  balance: number
  /** Board-imposed ceiling on total weekly wages. */
  wageBudget: number
  /** Remaining transfer budget for the current window. */
  transferBudget: number
  /** Debt, repaid weekly with interest. */
  debt: number
  weeklyInterestRate: number
  /** Rolling ledger of the current season, for the finance screen. */
  season: FinanceLedger
  /** Previous season's closed ledger. */
  lastSeason: FinanceLedger | null
  sponsorship: Sponsorship
  /** Set true when wages cannot be paid; triggers board crisis. */
  inCrisis: boolean
  /** Standing with the financial regulator. */
  regulation: ClubRegulation
}

/**
 * A club's record with the financial authorities.
 *
 * The rule modelled is the squad-cost ratio rather than a three-year
 * profit-and-loss test. A P&L test barely moves at the bottom of a pyramid
 * spanning two orders of magnitude, and takes three seasons to bite; a ratio
 * of what you spend on the squad against what you earn means the same thing
 * to a non-league club as to a champion, and it bites in season one.
 */
export interface ClubRegulation {
  /** Squad cost as a share of revenue, from the last completed season. */
  lastRatio: number | null
  /** Consecutive completed seasons in breach. */
  breachSeasons: number
  sanctions: RegulationSanction[]
  /** Points to be deducted from the current season's table. */
  pointsDeducted: number
}

export type SanctionKind = 'warning' | 'fine' | 'pointsDeduction' | 'registrationEmbargo'

export interface RegulationSanction {
  id: ID
  season: number
  kind: SanctionKind
  /** Money for a fine, points for a deduction, otherwise zero. */
  amount: number
  reason: string
  /** Seasons a lasting sanction still runs for. Zero for one-off sanctions. */
  seasonsRemaining: number
}

export interface FinanceLedger {
  matchdayIncome: number
  tvIncome: number
  sponsorshipIncome: number
  prizeMoney: number
  transfersIn: number
  wagesPaid: number
  transfersOut: number
  facilitiesSpend: number
  staffWages: number
  agentFees: number
  /** This season's write-down of transfer fees. A cost, but not a cash cost. */
  amortisation: number
  /** Profit on player sales above book value, less losses below it. */
  playerTradingProfit: number
  interestPaid: number
  otherIncome: number
  otherCosts: number
}

export interface Sponsorship {
  shirtSponsor: string
  shirtValuePerSeason: number
  kitSupplier: string
  kitValuePerSeason: number
  /** Season the current deals expire at the end of. */
  expiresSeason: number
}

export interface Facilities {
  stadium: Stadium
  /** Stadium work runs one project at a time; everything else is separate. */
  stadiumProject: StadiumProject | null
  /** All 1-20. Each level costs progressively more to build and to run. */
  trainingGround: number
  youthFacilities: number
  medicalCentre: number
  dataDepartment: number
  scoutingNetwork: number
  /** Ongoing construction projects. */
  projects: FacilityProject[]
}

export type StandId = 'north' | 'south' | 'east' | 'west'

export type StandType = 'terrace' | 'seated' | 'coveredSeated'

/**
 * A single stand.
 *
 * Stadiums are modelled stand by stand rather than as one capacity number
 * because that is how they are actually built, maintained and condemned. A
 * club with three good stands and one crumbling terrace has a specific,
 * addressable problem; a club with "quality 47" has an abstraction.
 */
export interface Stand {
  id: StandId
  name: string
  /** Seats or standing places built. Not all of them are necessarily usable. */
  capacity: number
  /** 0-100 physical condition. Decays with age; restored by repair work. */
  condition: number
  type: StandType
  /** Executive boxes. Worth far more per head than an ordinary seat. */
  hospitalityBoxes: number
  builtYear: number
  /**
   * Places closed by the safety officer. Unusable until the stand is repaired,
   * and the single most expensive consequence of neglecting the ground.
   */
  closedSeats: number
}

export interface Stadium {
  name: string
  /** Usable capacity: built places, less anything closed or under works. */
  capacity: number
  /** 0-100, derived from the stands. Drives matchday spend and fan mood. */
  quality: number
  /** Base ticket price. */
  ticketPrice: number
  stands: Stand[]
  builtYear: number
  /**
   * Whether the club owns its ground. A tenant pays rent, cannot rebuild, and
   * has relocation as its only route to a bigger stadium.
   */
  owned: boolean
  /** 0-100. A poor pitch raises injury risk and annoys the coach. */
  pitchCondition: number
  /**
   * Season the club last moved ground, if it ever has. Supporters remember a
   * relocation for years, and the fan-mood assessment needs to be able to say
   * so rather than leaving an unexplained collapse.
   */
  relocatedSeason: number | null
}

// ---------------------------------------------------------------------------
// Stadium works
// ---------------------------------------------------------------------------

export type StadiumWorkKind = 'repair' | 'upgrade' | 'expand' | 'rebuild' | 'relocate'

/**
 * A firm that builds stadiums.
 *
 * Architects are the reason a capital project is a decision rather than a
 * purchase. Cheap firms overrun, prestige firms deliver landmarks that lift
 * the club's standing, and the good ones are busy when you need them.
 */
export interface Architect {
  id: ID
  firm: string
  /** 0-100. Drives fee, and how much the finished ground flatters the club. */
  reputation: number
  /** The kinds of work this firm actually does well. */
  specialisms: StadiumWorkKind[]
  /** Multiplier on the base cost of the work. */
  costFactor: number
  /** Multiplier on the base duration. */
  speedFactor: number
  /** 0-100. Low reliability means overruns in both money and time. */
  reliability: number
  /** Bonus to the finished stand's condition and the ground's character. */
  craftsmanship: number
  nationId: ID
  /** Season and week they are free again. Null when available now. */
  busyUntil: { season: number; week: number } | null
}

/** One firm's answer to a tender. */
export interface ArchitectBid {
  architectId: ID
  firm: string
  cost: number
  weeks: number
  /** Their pitch, in their own words. */
  note: string
  /** Plain-language read on the risk of overrun. */
  risk: 'dependable' | 'usually fine' | 'has form for overruns' | 'a gamble'
  available: boolean
  unavailableReason?: string
}

export interface StadiumProject {
  id: ID
  kind: StadiumWorkKind
  standId: StandId | null
  architectId: ID
  architectFirm: string
  /** What was agreed at tender. */
  agreedCost: number
  agreedWeeks: number
  weeklyCost: number
  weeksRemaining: number
  /** What it has actually cost and taken so far. */
  spent: number
  overrunCost: number
  overrunWeeks: number
  description: string
  /** Places taken out of use for the duration of the work. */
  capacityReduction: number
  /** Applied on completion. */
  outcome: {
    capacity?: number
    type?: StandType
    hospitalityBoxes?: number
    condition?: number
    stadiumName?: string
    newStands?: Stand[]
    pitchCondition?: number
  }
}

export type FacilityKind =
  | 'trainingGround'
  | 'youthFacilities'
  | 'medicalCentre'
  | 'dataDepartment'
  | 'scoutingNetwork'

export interface FacilityProject {
  id: ID
  kind: FacilityKind
  targetLevel?: number
  totalCost: number
  weeklyCost: number
  weeksRemaining: number
  description: string
}

/**
 * The director of football's strategic dials. These do not pick a team — they
 * shape recruitment, the coach's selection bias, and how the squad develops.
 */
export interface ClubStrategy {
  /** 0-100. High = buy young and sell on; low = buy proven and win now. */
  youthEmphasis: number
  /** 0-100. High = only sign players who fit the coach's system. */
  systemFit: number
  /** 0-100. High = aggressive wage offers to win transfer races. */
  wageAggression: number
  /** 0-100. High = happy to sell key players at the right price. */
  sellingClubStance: number
  /** 0-100. High = sign domestic; low = scout globally. */
  domesticBias: number
  /** How the club talks to the press by default. */
  mediaStance: MediaStance
  /** Squad size target the coach is briefed to work with. */
  targetSquadSize: number
  /**
   * The club's stated recruitment policy — what kind of club this is in the
   * market, as everyone else understands it. Sets the dials above rather than
   * sitting beside them.
   */
  philosophy?: PhilosophyId
  /** Absolute week it was stated, so changing direction can have a cost. */
  philosophySince?: number
}

export type MediaStance = 'guarded' | 'balanced' | 'open' | 'combative'

export type PhilosophyId =
  | 'developAndSell'
  | 'winNow'
  | 'valueHunting'
  | 'homegrown'
  | 'starNames'
  | 'unstated'

/**
 * Who actually owns the club.
 *
 * Modelled from day one rather than appearing when somebody buys the place,
 * because an owner explains behaviour the board already had. A tight budget at
 * a well-supported club is not a rule of the game — it is a local builder who
 * will not put money in, and saying so out loud makes every club read
 * differently before a takeover ever happens.
 *
 * A takeover is then a change to this one object, propagating through budgets,
 * expectations, mandates and patience, instead of a pile of special cases.
 */
export type OwnerKind =
  | 'legacyFamily'
  | 'localBusiness'
  | 'foreignFund'
  | 'celebrity'
  | 'consortium'
  | 'fanOwned'

export interface Owner {
  name: string
  kind: OwnerKind
  /** 0-100. How much of their own money they will actually put in. */
  wealth: number
  /** 0-100. How long they will wait. Drives how fast confidence falls. */
  patience: number
  /** 0-100. How much they demand, in league position and in silverware. */
  ambition: number
  /** 0-100. How much they involve themselves in decisions that are yours. */
  interference: number
  /** 0-100. Appetite for running the club on borrowed money. */
  leverage: number
  /** 0-100. Belief that the academy is the answer rather than the market. */
  youthBelief: number
  /** Season they took control. */
  sinceSeason: number
  /** Percentage held. Below 100 there are other shareholders to answer to. */
  stake: number
  /**
   * 0-100, and only meaningful at the club the human runs: what this owner
   * makes of the director they inherited. A takeover never costs you the job
   * outright, but it can cost you every ounce of goodwill you had built.
   */
  faithInDirector: number
}

/**
 * A takeover in progress.
 *
 * Deliberately a process rather than an event. Interest becomes due diligence
 * becomes an agreed deal over a matter of weeks, it leaks to the press on the
 * way, and it can fall through — which is what makes it something a director
 * watches happen to him rather than a number that changes overnight.
 */
export type TakeoverStage = 'interest' | 'dueDiligence' | 'agreed' | 'completed' | 'collapsed'

export interface Takeover {
  id: ID
  clubId: ID
  stage: TakeoverStage
  /** The prospective owner, already rolled so the terms are knowable. */
  incoming: Owner
  /** Absolute week (season * 52 + week) the current stage began. */
  stageSince: number
  season: number
  /** Whether the press have it yet. */
  public: boolean
  /** Set when it collapses, for the news item. */
  collapseReason: string | null
}

export interface BoardState {
  /** 0-100. Below ~25 you are one bad month from the sack. */
  confidence: number
  /** What they told you to achieve this season. */
  expectation: BoardExpectation
  /** Standing instructions that constrain your decisions. */
  mandates: BoardMandate[]
  /** Seasons you have been in post. */
  tenureSeasons: number
  /** Ticks up when confidence is critical; at 3 you are sacked. */
  warnings: number
  /** Week of the last formal request, to stop the board being badgered. */
  lastRequestWeek: number
  /** Requests made this season. Boards tire of being asked. */
  requestsThisSeason: number
  /** Who they answer to. */
  owner: Owner
  /**
   * Set for the season following a takeover. A new owner always lets a
   * director see out the campaign, however little they rate him.
   */
  graceUntilSeason: number | null
}

export interface BoardExpectation {
  /** League position the board wants, 1-indexed. */
  leaguePosition: number
  description: string
  /** 0-100 weight the board puts on cup runs vs league. */
  cupImportance: number
  /** 0-100 weight on financial health vs results. */
  financialImportance: number
  /** 0-100 weight on promoting academy players. */
  youthImportance: number
}

export type BoardMandate =
  | 'reduceWageBill'
  | 'balanceBooks'
  | 'developYouth'
  | 'winPromotion'
  | 'avoidRelegation'
  | 'winTrophy'
  | 'sellStarPlayer'
  | 'improveFacilities'
  | 'qualifyContinental'

export interface SeasonHistory {
  season: number
  leagueId: ID
  leagueName: string
  position: number
  played: number
  points: number
  goalsFor: number
  goalsAgainst: number
  cupResult: string
  continentalResult: string
  netSpend: number
  finalBalance: number
  /** Head coach at season's end. */
  headCoachName: string
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type Position = 'GK' | 'DC' | 'DL' | 'DR' | 'DM' | 'MC' | 'ML' | 'MR' | 'AM' | 'ST'

export type PositionGroup = 'goalkeeper' | 'defender' | 'midfielder' | 'forward'

export interface PlayerAttributes {
  // Technical
  passing: number
  shooting: number
  dribbling: number
  tackling: number
  heading: number
  crossing: number
  setPieces: number
  firstTouch: number
  // Physical
  pace: number
  strength: number
  stamina: number
  agility: number
  // Mental
  composure: number
  vision: number
  workRate: number
  positioning: number
  leadership: number
  determination: number
  temperament: number
  // Goalkeeping (0 for outfield players)
  reflexes: number
  handling: number
  distribution: number
  command: number
}

export type AttributeKey = keyof PlayerAttributes

export interface Player {
  id: ID
  firstName: string
  lastName: string
  /** Display name — may be a mononym or nickname (Brazilian style). */
  knownAs: string
  nationalityId: ID
  secondNationalityId: ID | null
  /** Age in years, recalculated at each birthday week. */
  age: number
  /** Week of the year (1-52) their age ticks over. */
  birthWeek: number
  position: Position
  /** Positions they can also fill, with a competence penalty. */
  altPositions: Position[]
  attributes: PlayerAttributes
  /** 1-200, the true present-day quality. Hidden from the player. */
  currentAbility: number
  /** 1-200 ceiling. Hidden; scouts estimate a range. */
  potentialAbility: number
  clubId: ID | null
  /** Set when out on loan; clubId remains the parent club. */
  loanClubId: ID | null
  loanUntilSeason: number | null
  /** Share of a loanee's wage still paid by the parent club, 0-1. */
  loanWageShare: number
  contract: Contract | null
  agentId: ID | null
  /** 0-100. Drives performance, transfer requests and press leaks. */
  morale: number
  /** 0-100. Short-term performance swing, moves with results. */
  form: number
  /** 0-100. Match sharpness; drops when not playing. */
  fitness: number
  /** 0-100. Long-term robustness; low means frequent injuries. */
  injuryProneness: number
  injury: Injury | null
  /** Weeks of suspension still to serve. Blocks selection while above zero. */
  suspendedWeeks: number
  /** How the player sees their standing at the club. */
  squadStatus: SquadStatus
  /** What the player believes they deserve. Mismatch causes unrest. */
  desiredStatus: SquadStatus
  /** Personality traits shaping development, media and negotiation. */
  traits: PlayerTrait[]
  /** 0-100 attachment to the club — resists transfer approaches. */
  loyalty: number
  /** 0-100 how much they value money over trophies/playing time. */
  ambitionVsMoney: number
  /** Present-day market valuation, recomputed weekly. */
  value: number
  /** Wage the player would currently demand on a new deal. */
  wageDemand: number
  /** True while the player has formally asked to leave. */
  transferRequested: boolean
  /** Set by the DoF; makes the player appear on other clubs' shortlists. */
  listedForTransfer: boolean
  listedForLoan: boolean
  /** Career and current-season records. */
  stats: PlayerSeasonStats
  careerStats: PlayerCareerRecord[]
  /** Ids of clubs whose scouts have watched them, for the interest system. */
  interestedClubIds: ID[]
  /**
   * International caps. Never goes down, and neither does what he costs
   * because of them — the most reliably real thing about the market.
   */
  caps?: number
  /**
   * Week he is back from international duty, or null. He is away from his club
   * until then: the league does not pause for it, which is the whole
   * complaint.
   */
  internationalUntilWeek?: number | null
  /**
   * What a good tournament did to his price, as a fraction on top.
   *
   * Separate from caps because it behaves differently: caps never come back
   * down, a tournament summer does. A player who is the story of a June is
   * priced on it for a year and then priced on his football again, and a club
   * that did not sell him in that window finds the number gone. It is the
   * cruellest honest thing in the market and it happens every other summer.
   */
  tournamentStock?: number
  /** True for academy players not yet promoted to the senior squad. */
  isAcademy: boolean
  /** Season they joined the club, for loyalty and testimonials. */
  joinedSeason: number
  /** Fee paid for them, for amortisation and sell-on reporting. */
  purchaseFee: number
  /**
   * Unamortised remainder of the transfer fee.
   *
   * A fee is not an expense in the season it is paid: it is written down over
   * the length of the contract signed with it. What is left is the player's
   * book value, and selling him for more than that is a profit while selling
   * him for less is a loss — which is why a club under financial pressure
   * sells an academy graduate, whose book value is zero and whose whole fee is
   * profit, rather than the expensive signing it would take a loss on.
   */
  bookValue: number
  /** Annual write-down of the fee. Counts towards the squad-cost ratio. */
  amortisationCharge: number
  /** Percentage of any future sale owed to a previous club, 0-1. */
  sellOnClauseOwed: { clubId: ID; percentage: number }[]
  /**
   * A right to buy him back at a fixed price, held by a club that sold him.
   *
   * The instrument that stops selling a nineteen-year-old being a pure loss:
   * take the money, let somebody else pay his wages and give him the football
   * you could not, and keep the right to bring him back at a price agreed
   * before anybody knew what he would become. At most one is held at a time —
   * a buy-back is extinguished when it is exercised or when it lapses, and a
   * club that sells him on cannot pass the old one along.
   */
  buyBack: BuyBackClause | null
  /** Hidden development modifier — some players just kick on, some stall. */
  developmentRate: number
  /**
   * Years registered with a club in each nation before turning 21, keyed by
   * nation id.
   *
   * This is what decides homegrown status, and it is deliberately about where
   * a player was *trained* rather than what passport he holds: a Senegalese
   * who came through an English academy is homegrown in England, and an
   * Englishman who left for Spain at sixteen is not.
   */
  trainingYears: Record<ID, number>
  /**
   * Consecutive weeks without a club.
   *
   * Drives how far a free agent will climb down: his demands soften, and a
   * player nobody has called in two seasons stops waiting for the phone.
   */
  weeksUnattached: number
}

export type PlayerTrait =
  | 'leader'
  | 'hothead'
  | 'professional'
  | 'mercenary'
  | 'loyal'
  | 'injuryProne'
  | 'lateDeveloper'
  | 'wonderkid'
  | 'mediaDarling'
  | 'mediaShy'
  | 'bigGameplayer'
  | 'inconsistent'
  | 'ambitious'
  | 'homesick'
  | 'disruptive'
  | 'versatile'

export type SquadStatus =
  | 'star'
  | 'firstTeam'
  | 'rotation'
  | 'backup'
  | 'prospect'
  | 'surplus'

export interface Injury {
  type: string
  weeksRemaining: number
  severity: 'knock' | 'minor' | 'moderate' | 'serious' | 'severe'
  /** Permanent hit to physical attributes applied on recovery. */
  lingeringEffect: number
}

export interface Contract {
  wage: number // per week
  expiresSeason: number // end of this season
  signingBonus: number
  releaseClause: number | null
  /** Per-appearance and per-goal bonuses. */
  appearanceFee: number
  goalBonus: number
  loyaltyBonus: number
  /** True while renewal talks are open. */
  inNegotiation: boolean
  /** Weeks since the player last asked about a new deal. */
  weeksSinceRenewalRequest: number
}

export interface PlayerSeasonStats {
  appearances: number
  starts: number
  minutes: number
  goals: number
  assists: number
  cleanSheets: number
  yellowCards: number
  redCards: number
  /** Sum of match ratings, for computing the average. */
  ratingSum: number
  motmAwards: number
}

export interface PlayerCareerRecord extends PlayerSeasonStats {
  season: number
  clubId: ID
  clubName: string
  leagueName: string
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type StaffRole =
  | 'headCoach'
  | 'assistantCoach'
  | 'scout'
  | 'physio'
  | 'analyst'
  | 'academyDirector'
  | 'fitnessCoach'
  | 'goalkeepingCoach'
  | 'setPieceCoach'

export interface Staff {
  id: ID
  firstName: string
  lastName: string
  knownAs: string
  nationalityId: ID
  age: number
  role: StaffRole
  clubId: ID | null
  /** 1-100 role-relevant skill ratings. */
  attributes: StaffAttributes
  /** 0-100 overall standing in the game; drives who will join you. */
  reputation: number
  contract: { wage: number; expiresSeason: number } | null
  /** 0-100 how happy they are working with you. */
  relationship: number
  /** Head coaches only. */
  coachProfile: CoachProfile | null
  /** Scouts only — where they are currently deployed. */
  assignment: ScoutAssignment | null
  joinedSeason: number
}

export interface StaffAttributes {
  coaching: number
  manManagement: number
  tactical: number
  youthDevelopment: number
  judgingAbility: number
  judgingPotential: number
  physiotherapy: number
  dataAnalysis: number
  negotiating: number
  /** How much they court the press. */
  mediaHandling: number
}

/**
 * A head coach is an AI actor with opinions. They pick the team, they want
 * certain kinds of player, and they will fall out with you if you ignore them.
 */
export interface CoachProfile {
  /** Preferred shape, used for selection and to judge squad balance. */
  formation: Formation
  style: CoachStyle
  /** 0-100 willingness to play academy graduates. */
  trustInYouth: number
  /** 0-100 how much they rotate. */
  rotationTendency: number
  /** Attribute keys this coach over-weights when picking a side. */
  valuedAttributes: AttributeKey[]
  /** Positions the coach has publicly said the squad is short in. */
  requests: SquadRequest[]
  /** 0-100 relationship with the director of football specifically. */
  dofRelationship: number
  /** 0-100 how safe their job is; low means the board may sack them. */
  jobSecurity: number
}

export type CoachStyle =
  | 'possession'
  | 'counterAttack'
  | 'highPress'
  | 'direct'
  | 'defensive'
  | 'balanced'

export type Formation = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1' | '3-4-3'

export interface SquadRequest {
  id: ID
  position: Position
  urgency: 'nice-to-have' | 'wanted' | 'urgent'
  /** Minimum ability the coach considers an upgrade. */
  minAbility: number
  weekRaised: number
  /** Set when the DoF formally accepts or rejects the request. */
  response: 'pending' | 'accepted' | 'rejected' | 'fulfilled' | 'expired'
}

export interface ScoutAssignment {
  type: 'nation' | 'league' | 'position' | 'player'
  targetId: ID
  /** Positional briefs only. */
  position?: Position
  /** Weeks the scout has spent on this brief; accuracy improves over time. */
  weeksOnAssignment: number
  /** Minimum ability worth reporting on. */
  minAbility: number
  maxAge: number
}

// ---------------------------------------------------------------------------
// Scouting
// ---------------------------------------------------------------------------

/**
 * What the club *thinks* it knows about a player. The UI must never show a
 * player's true attributes unless knowledge is complete — the uncertainty is
 * the point of the scouting system.
 */
export interface ScoutReport {
  playerId: ID
  scoutId: ID
  /** 0-100. Drives how tight the reported ranges are. */
  knowledge: number
  /** Reported current ability range. */
  abilityRange: [number, number]
  /** Reported potential range. */
  potentialRange: [number, number]
  /** Per-attribute reported values, fuzzed by scout quality. */
  attributeEstimates: Partial<Record<AttributeKey, [number, number]>>
  /** Scout's written verdict. */
  verdict: string
  /** Scout's recommendation strength, 0-100. */
  recommendation: number
  /** Estimated fee to sign them, which may be wrong. */
  estimatedFee: [number, number]
  /** Estimated wage demand. */
  estimatedWage: [number, number]
  weekFiled: number
  seasonFiled: number
  /** Set when the report is stale enough to warrant a fresh look. */
  stale: boolean
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type TransferKind = 'permanent' | 'loan' | 'loanWithOption' | 'free'

export type NegotiationStage =
  | 'enquiry'
  | 'clubTalks'
  | 'clubAgreed'
  | 'playerTalks'
  | 'agreed'
  | 'completed'
  | 'rejected'
  | 'withdrawn'
  | 'hijacked'

export interface TransferNegotiation {
  id: ID
  playerId: ID
  buyingClubId: ID
  sellingClubId: ID | null // null for free agents
  kind: TransferKind
  stage: NegotiationStage
  /** Fee currently on the table. */
  offeredFee: number
  /** What the selling club has said it wants; may be a bluff. */
  askingPrice: number
  /** Structured payment terms. */
  terms: TransferTerms
  /** Contract offered to the player. */
  playerTerms: Contract | null
  /** Agent's cut demanded. */
  agentFee: number
  /** Rounds of haggling so far — patience runs out. */
  rounds: number
  /** Week the other side will respond. */
  respondsOnWeek: number
  /** Rival clubs also in for the player. */
  competingClubIds: ID[]
  /** Log of what has been said, for the negotiation screen. */
  log: NegotiationLogEntry[]
  /** True when the human club initiated it. */
  playerInitiated: boolean
  deadlineWeek: number
}

export interface DataFinding {
  playerId: ID
  /** What the model thinks he is worth to this club. */
  modelValue: number
  /** What the market is asking, at the time the finding was made. */
  marketValue: number
  /** 0-1. How far the department stands behind it. Low is honest, not shy. */
  confidence: number
  /** One line on where the edge is said to be. */
  rationale: string
  week: number
  season: number
}

export interface BuyBackClause {
  /** The club that sold him and kept the right. */
  clubId: ID
  /** Fixed fee to bring him back. Agreed at the sale, whatever he becomes. */
  price: number
  /** First season the right can be exercised — never the one he just left in. */
  fromSeason: number
  /** Last season it is live. After this it lapses and cannot be revived. */
  untilSeason: number
  /** The fee he was sold for, so the screen can say what the right is worth. */
  soldFor: number
}

export interface TransferTerms {
  upfrontPercentage: number // 0-1
  instalments: number // number of seasons
  sellOnPercentage: number // 0-1
  /**
   * Selling only: a fixed price to buy him back later, 0 for none. Costly to
   * ask for and cheap to grant at a high price, which is exactly how it works.
   */
  buyBackPrice: number
  appearanceBonus: number
  promotionBonus: number
  /** Loans only: share of wages the parent club keeps paying, 0-1. */
  wageContribution: number
  /** Loans with option: the agreed future fee. */
  optionFee?: number
}

export interface NegotiationLogEntry {
  week: number
  season: number
  speaker: 'you' | 'club' | 'player' | 'agent' | 'media'
  text: string
}

export interface CompletedTransfer {
  id: ID
  season: number
  week: number
  playerId: ID
  playerName: string
  fromClubId: ID | null
  fromClubName: string
  toClubId: ID
  toClubName: string
  fee: number
  kind: TransferKind
}

export interface Agent {
  id: ID
  name: string
  /** 0-100. High-reputation agents represent better players, demand more. */
  reputation: number
  /** 0-100 how hard they push; high means big fees and sudden ultimatums. */
  aggression: number
  /** 0-100 relationship with the human club. */
  relationship: number
  clientIds: ID[]
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaStoryKind =
  | 'transferLink'
  | 'contractStandoff'
  | 'playerUnrest'
  | 'coachUnderPressure'
  | 'boardBacking'
  | 'injuryNews'
  | 'formPraise'
  | 'formCriticism'
  | 'financialConcern'
  | 'academyHype'
  | 'rivalTaunt'
  | 'signingReaction'
  | 'sackSpeculation'

export interface MediaStory {
  id: ID
  kind: MediaStoryKind
  season: number
  week: number
  headline: string
  body: string
  outletId: ID
  /** Whether the story is factually true in-world. */
  truth: 'true' | 'exaggerated' | 'fabricated'
  /** Who or what the story is about. */
  subjectPlayerIds: ID[]
  subjectClubIds: ID[]
  subjectStaffIds: ID[]
  /** Set when the human club planted it. */
  plantedBy: ID | null
  /** Effects already applied, kept for the "what did this do" panel. */
  effects: MediaEffect[]
  /** Whether the player club has responded. */
  response: MediaResponse | null
  /** 0-100 how widely the story ran. Big stories have bigger effects. */
  prominence: number
}

export interface MediaEffect {
  target: 'player' | 'club' | 'staff' | 'fans' | 'board'
  targetId: ID
  metric: string
  delta: number
  description: string
}

export type MediaResponse =
  | 'noComment'
  | 'deny'
  | 'confirm'
  | 'backPlayer'
  | 'backCoach'
  | 'criticise'
  | 'deflect'

export interface MediaOutlet {
  id: ID
  name: string
  nationId: ID
  /** 0-100. High-credibility outlets do more damage but are harder to plant. */
  credibility: number
  /** 0-100. High means they chase gossip and are easy to feed. */
  sensationalism: number
  /** 0-100 relationship with the human club. */
  relationship: number
}

/**
 * A briefing the director of football gives the press. This is the offensive
 * side of media management — planting a link about a rival's unsettled striker
 * to depress his price, or leaking your own interest to force a board's hand.
 */
export interface MediaBriefing {
  kind: MediaStoryKind
  targetPlayerId?: ID
  targetClubId?: ID
  targetStaffId?: ID
  outletId: ID
  truth: 'true' | 'exaggerated' | 'fabricated'
  /** How hard the club pushes; higher = bigger effect, bigger exposure risk. */
  intensity: number
}

/**
 * The club's standing with the press, tracked separately from board and fans.
 * Getting caught planting fabrications burns this, and a burnt DoF finds their
 * genuine briefings ignored.
 */
export interface MediaStanding {
  /** 0-100. Falls when fabrications are exposed. */
  credibility: number
  /** 0-100 general press goodwill. */
  goodwill: number
  /** Fabrications planted this season, and how many were exposed. */
  fabricationsPlanted: number
  fabricationsExposed: number
  /** Week of the most recent briefing, to rate-limit spin. */
  lastBriefingWeek: number
}

// ---------------------------------------------------------------------------
// Inbox / events
// ---------------------------------------------------------------------------

export type InboxCategory =
  | 'board'
  | 'coach'
  | 'player'
  | 'transfer'
  | 'scouting'
  | 'media'
  | 'finance'
  | 'facilities'
  | 'academy'
  | 'match'
  | 'league'

export interface InboxItem {
  id: ID
  season: number
  week: number
  category: InboxCategory
  /** Short subject line for the list view. */
  subject: string
  /** Who it is from, e.g. "Marcus Reidy, Head Coach". */
  from: string
  body: string
  read: boolean
  /** Urgent items block the "advance week" button until handled. */
  urgent: boolean
  /** Choices the player must make. Resolved items keep the chosen id. */
  decision: InboxDecision | null
  /** Deep-link the UI can follow, e.g. to a player or negotiation. */
  link: { view: string; id?: ID } | null
  /** Week the item expires and auto-resolves with its default option. */
  expiresWeek: number | null
  /**
   * Structured context for the decision resolver. Inbox bodies are prose meant
   * for a human; anything the game needs to act on has to be here, not parsed
   * back out of a sentence.
   */
  payload?: Record<string, string | number> | null
}

export interface InboxDecision {
  prompt: string
  options: InboxOption[]
  /** Set once the player (or expiry) has chosen. */
  chosenId: string | null
  /** Option applied automatically on expiry. */
  defaultOptionId: string
  /** Narrative shown after resolution. */
  outcomeText: string | null
}

export interface InboxOption {
  id: string
  label: string
  /** Short line explaining the likely consequence. */
  hint: string
  /** Set false when the option is unaffordable or otherwise blocked. */
  available: boolean
  unavailableReason?: string
}

// ---------------------------------------------------------------------------
// Root state
// ---------------------------------------------------------------------------

export interface GameState {
  /** Save format version, for migrations. */
  version: number
  seed: string
  createdAt: number
  savedAt: number
  date: GameDate
  phase: SeasonPhase
  /**
   * The club the director runs, or null while he is out of work and looking.
   *
   * Nullable because being sacked has to actually remove you: leaving this
   * pointing at the club that dismissed you meant the board sacked you again
   * the following week, and again, 169 times over one career.
   */
  playerClubId: ID | null
  /** The human's name and standing. */
  director: DirectorProfile

  nations: Record<ID, Nation>
  leagues: Record<ID, League>
  clubs: Record<ID, Club>
  players: Record<ID, Player>
  staff: Record<ID, Staff>
  agents: Record<ID, Agent>
  outlets: Record<ID, MediaOutlet>
  architects: Record<ID, Architect>

  /** League tables keyed by league id. */
  tables: Record<ID, LeagueTableRow[]>
  /** Fixtures for the current season only; past seasons are summarised. */
  fixtures: Fixture[]
  cups: Record<ID, CupCompetition>

  /** Scout reports the player club holds, keyed by player id. */
  scoutReports: Record<ID, ScoutReport>
  /** Players the DoF is tracking. */
  shortlist: ID[]
  /**
   * What the data department last put in front of you: players its model
   * believes are underpriced, with how much it stands behind each. Re-run on a
   * cadence rather than kept live, because a model is consulted, not watched.
   */
  dataFindings?: DataFinding[]
  negotiations: TransferNegotiation[]
  completedTransfers: CompletedTransfer[]
  /** Takeovers in progress anywhere in the world. */
  takeovers: Takeover[]

  mediaStories: MediaStory[]
  mediaStanding: MediaStanding

  inbox: InboxItem[]
  /** Rolling news feed of world events, newest first. */
  newsFeed: NewsItem[]

  /** Counter used to mint unique ids deterministically. */
  nextId: number
  /** Per-subsystem RNG stream counters, so streams stay independent. */
  rngCounters: Record<string, number>
  settings: GameSettings
}

export interface DirectorProfile {
  name: string
  /**
   * Your age. Thirty on the first day, gone after sixty-five, which bounds a
   * career at thirty-five seasons and is what makes time cost anything: a
   * three-year rebuild at fifty-eight is not the same decision as the same
   * rebuild at thirty-four. See systems/directorCareer.ts.
   */
  age: number
  /** 0-100 standing in the game. Drives job offers and who takes your calls. */
  reputation: number
  /** Traits the player picked at the start, shaping their strengths. */
  background: DirectorBackground
  /**
   * Career experience. You start unproven and can only take jobs at clubs
   * within your level band, so climbing the pyramid is the meta-progression
   * that spans saves at one club — the reason to accept a job at a club you
   * have outgrown rather than restarting.
   */
  xp: number
  level: number
  /** XP banked this season, shown on the season-review screen. */
  xpThisSeason: number
  /** Itemised XP awards this season, so the review can show the breakdown. */
  xpLog: XpAward[]
  /**
   * Multiplier applied to all XP awards. Defaults to 1. Exists as the hook for
   * an optional purchasable boost without threading a store through the
   * simulation — nothing in the engine reads it except awardXp.
   */
  xpMultiplier: number
  careerHistory: DirectorCareerEntry[]
  /** Job offers currently on the table, refreshed at season end. */
  jobOffers: JobOffer[]
  /**
   * Your own contract. You are an employee, negotiated on arrival, and the
   * club pays you out of the same wage bill you are trying to control — so
   * asking for more is a real trade-off, not free money.
   */
  contract: DirectorContract | null
  /** Everything you have ever been paid, across every club. */
  careerEarnings: number
  earningsThisSeason: number
  /** Itemised, newest first, for the career screen. */
  earnings: EarningEntry[]
  /**
   * Set once, when the career ends. Its presence is what the UI reads to know
   * the save is finished — there is no going back and no further weeks to
   * play, only the record to look at.
   */
  retiredAtSeason?: number
  retiredBecause?: 'age' | 'choice'
}

export interface DirectorContract {
  /** Per week, paid from the club's wage bill. */
  salary: number
  expiresSeason: number
  signingBonus: number
  /** Paid once if the club goes up. */
  promotionBonus: number
  /** Paid once per trophy won. */
  trophyBonus: number
  /** Paid if the club finishes at or above the board's target. */
  targetBonus: number
  /** Weeks of salary paid if the club dismisses you. */
  severanceWeeks: number
  clubId: ID
  signedSeason: number
}

export interface EarningEntry {
  season: number
  week: number
  amount: number
  source: EarningSource
  description: string
  clubName: string
}

export type EarningSource =
  | 'salary'
  | 'signingBonus'
  | 'promotionBonus'
  | 'trophyBonus'
  | 'targetBonus'
  | 'severance'

export interface DirectorCareerEntry {
  clubId: ID
  clubName: string
  fromSeason: number
  toSeason: number | null
  /** How it ended: "Resigned", "Sacked", "Contract expired", or in post. */
  outcome: string
  /** Best league finish achieved there. */
  bestFinish: number
  trophies: string[]
  netSpend: number
  xpEarned: number
}

export interface XpAward {
  season: number
  week: number
  reason: string
  amount: number
  category: XpCategory
}

export type XpCategory =
  | 'results'
  | 'trophies'
  | 'promotion'
  | 'transfers'
  | 'youth'
  | 'finance'
  | 'squad'
  | 'media'
  | 'survival'

export interface JobOffer {
  id: ID
  clubId: ID
  clubName: string
  leagueName: string
  clubReputation: number
  /** What they expect if you take it. */
  expectation: BoardExpectation
  wageOffer: number
  transferBudgetOffer: number
  /** Week the offer lapses. */
  expiresWeek: number
  expiresSeason: number
  /** Why they are interested — shown in the offer letter. */
  pitch: string
  /**
   * A post you can see and cannot have. The obvious one is the club that has
   * just sacked you: their vacancy is real, it is public, and it is the first
   * thing you would look at — but the board that dismissed you last week is not
   * going to interview you this week.
   */
  barred?: boolean
  /** Said plainly on the listing, because a greyed-out row explains nothing. */
  barredReason?: string
}

export type DirectorBackground =
  | 'formerPlayer'
  | 'agent'
  | 'analyst'
  | 'financier'
  | 'scout'
  | 'academyCoach'

export interface CupCompetition {
  id: ID
  name: string
  nationId: ID | null
  type: 'domestic' | 'continental'
  tier: ContinentalTier
  /**
   * Continental competitions only: whose competition this is. A domestic cup
   * knows its field from `nationId`; a continental one has to be told, because
   * its entrants are re-drawn from a dozen different league tables every
   * summer rather than being every club in one country.
   */
  confederation?: Confederation
  /** Clubs still involved. */
  entrantIds: ID[]
  rounds: CupRound[]
  currentRound: number
  winnerId: ID | null
  prizeMoneyPerRound: number[]
}

export interface CupRound {
  round: number
  name: string
  week: number
  fixtureIds: ID[]
  twoLegged: boolean
}

export interface NewsItem {
  id: ID
  season: number
  week: number
  category: InboxCategory
  text: string
  /** Optional link to an entity for the UI. */
  link: { view: string; id?: ID } | null
  /**
   * The division the item belongs to, so the league screen can carry what
   * happened in this one. Derived from whichever club the item is about.
   * Absent on items from before the feed was surfaced anywhere.
   */
  leagueId?: ID
}

export interface GameSettings {
  currency: 'GBP' | 'EUR' | 'USD'
  /** Show true attributes instead of scouted ranges — a cheat/debug toggle. */
  revealTrueAttributes: boolean
  autosave: boolean
  /** Skip confirmation dialogs on routine actions. */
  fastAdvance: boolean
  hapticsEnabled: boolean
}

export const SAVE_VERSION = 13
