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
  confederation: 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC'
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
  /** Player ids currently contracted, including those out on loan. */
  squad: ID[]
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
  /** All 1-20. Each level costs progressively more to build and to run. */
  trainingGround: number
  youthFacilities: number
  medicalCentre: number
  dataDepartment: number
  scoutingNetwork: number
  /** Ongoing construction projects. */
  projects: FacilityProject[]
}

export interface Stadium {
  name: string
  capacity: number
  /** 0-100; affects matchday revenue per head and fan mood. */
  quality: number
  /** Base ticket price. */
  ticketPrice: number
}

export type FacilityKind =
  | 'stadium'
  | 'trainingGround'
  | 'youthFacilities'
  | 'medicalCentre'
  | 'dataDepartment'
  | 'scoutingNetwork'

export interface FacilityProject {
  id: ID
  kind: FacilityKind
  /** For stadium projects, the seats being added. */
  capacityAdded?: number
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
}

export type MediaStance = 'guarded' | 'balanced' | 'open' | 'combative'

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
  /** True for academy players not yet promoted to the senior squad. */
  isAcademy: boolean
  /** Season they joined the club, for loyalty and testimonials. */
  joinedSeason: number
  /** Fee paid for them, for amortisation and sell-on reporting. */
  purchaseFee: number
  /** Percentage of any future sale owed to a previous club, 0-1. */
  sellOnClauseOwed: { clubId: ID; percentage: number }[]
  /** Hidden development modifier — some players just kick on, some stall. */
  developmentRate: number
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
  | 'clubhouseCancer'
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

export interface TransferTerms {
  upfrontPercentage: number // 0-1
  instalments: number // number of seasons
  sellOnPercentage: number // 0-1
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
  playerClubId: ID
  /** The human's name and standing. */
  director: DirectorProfile

  nations: Record<ID, Nation>
  leagues: Record<ID, League>
  clubs: Record<ID, Club>
  players: Record<ID, Player>
  staff: Record<ID, Staff>
  agents: Record<ID, Agent>
  outlets: Record<ID, MediaOutlet>

  /** League tables keyed by league id. */
  tables: Record<ID, LeagueTableRow[]>
  /** Fixtures for the current season only; past seasons are summarised. */
  fixtures: Fixture[]
  cups: Record<ID, CupCompetition>

  /** Scout reports the player club holds, keyed by player id. */
  scoutReports: Record<ID, ScoutReport>
  /** Players the DoF is tracking. */
  shortlist: ID[]
  negotiations: TransferNegotiation[]
  completedTransfers: CompletedTransfer[]

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
}

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

export const SAVE_VERSION = 1
