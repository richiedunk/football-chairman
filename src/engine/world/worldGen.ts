import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { NameGenerator } from '../names/generator'
import { NATION_DEFS, type NationDef } from './nations'
import { generateClubName, generateStadiumName, type ClubNameStyle } from './clubNames'
import { generatePlayer, generateSquad, generateYouthIntake } from './playerGen'
import { generateBackroom, generateFreeAgentStaff } from './staffGen'
import { computeValue, computeWageDemand } from '../systems/valuation'
import { scheduleLeague } from '../sim/schedule'
import { generateArchitects } from '../systems/stadium'
import { autoRegister } from '../systems/registration'
import { resetCup } from '../sim/cups'
import { SAVE_VERSION } from '../types'
import type {
  Agent, BoardExpectation, BoardMandate, Club, ClubFinances, ClubStrategy, CupCompetition,
  DirectorBackground, Facilities, GameState, ID, League, LeagueTableRow, MediaOutlet, Nation, Player,
  Position, Staff, Stand, StandId, StandType,
} from '../types'

/**
 * World generation.
 *
 * Builds an entire footballing world from a seed: nations, divisions, clubs
 * with finances and facilities, squads, backroom staff, agents and the press.
 * Everything is derived rather than authored, so the same seed always rebuilds
 * the same world and a save file never has to ship a database.
 */

export type WorldSize = 'compact' | 'standard' | 'large'

export interface WorldGenOptions {
  seed: string
  season: number
  size: WorldSize
  /** Nation whose pyramid is generated in full depth — where you start. */
  homeNationId: string
  directorName: string
  background: DirectorBackground
}

/** Nations included at each world size, and how deep their pyramid goes. */
const SIZE_NATIONS: Record<WorldSize, string[]> = {
  compact: ['eng', 'esp', 'ita', 'ger', 'fra', 'ned', 'por', 'sco'],
  standard: [
    'eng', 'esp', 'ita', 'ger', 'fra', 'ned', 'por', 'sco', 'bel', 'tur',
    'gre', 'pol', 'den', 'bra', 'arg', 'usa', 'mex', 'jpn',
  ],
  large: NATION_DEFS.map((n) => n.id),
}

export function generateWorld(options: WorldGenOptions): GameState {
  const rng = new Rng(options.seed)
  const ids = new IdFactory(1)
  const names = new NameGenerator(rng.fork('names'))
  const season = options.season

  const includedIds = new Set(SIZE_NATIONS[options.size])
  includedIds.add(options.homeNationId)
  const defs = NATION_DEFS.filter((d) => includedIds.has(d.id))

  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed,
    createdAt: Date.now(),
    savedAt: Date.now(),
    date: { season, week: 1 },
    phase: 'preseason',
    playerClubId: '',
    director: {
      name: options.directorName,
      reputation: 8,
      background: options.background,
      xp: 0,
      level: 1,
      xpThisSeason: 0,
      xpLog: [],
      xpMultiplier: 1,
      careerHistory: [],
      jobOffers: [],
      contract: null,
      careerEarnings: 0,
      earningsThisSeason: 0,
      earnings: [],
    },
    nations: {},
    leagues: {},
    clubs: {},
    players: {},
    staff: {},
    agents: {},
    outlets: {},
    architects: {},
    tables: {},
    fixtures: [],
    cups: {},
    scoutReports: {},
    shortlist: [],
    negotiations: [],
    completedTransfers: [],
    mediaStories: [],
    mediaStanding: {
      credibility: 70,
      goodwill: 55,
      fabricationsPlanted: 0,
      fabricationsExposed: 0,
      lastBriefingWeek: 0,
    },
    inbox: [],
    newsFeed: [],
    nextId: 1,
    rngCounters: {},
    settings: {
      currency: 'GBP',
      revealTrueAttributes: false,
      autosave: true,
      fastAdvance: false,
      hapticsEnabled: true,
    },
  }

  // --- Nations -------------------------------------------------------------
  const nationRecords: Nation[] = []
  for (const def of defs) {
    const nation: Nation = {
      id: def.id,
      name: def.name,
      adjective: def.adjective,
      code: def.code,
      reputation: def.reputation,
      economyFactor: def.economyFactor,
      namePool: def.namePool,
      secondaryPools: def.secondaryPools,
      cities: def.cities,
      leagueIds: [],
      confederation: def.confederation,
      population: def.population,
    }
    state.nations[nation.id] = nation
    nationRecords.push(nation)
  }

  const playerCtx = { rng, ids, names, nations: nationRecords, season }
  const staffCtx = { rng, ids, names, nations: nationRecords, season }
  const takenClubNames = new Set<string>()

  // --- Media outlets -------------------------------------------------------
  for (const def of defs) {
    for (const outlet of generateOutlets(rng, ids, def)) {
      state.outlets[outlet.id] = outlet
    }
  }

  // --- Leagues and clubs ---------------------------------------------------
  for (const def of defs) {
    const nation = state.nations[def.id]
    const depth = tierDepthFor(def, options)
    // Cities are handed out best-first, so the biggest cities host the biggest
    // clubs — which is why a top-flight club in a small town reads as unusual.
    const cityPool = def.cities.slice().sort((a, b) => b.size - a.size)
    let cityIndex = 0

    for (let tierIdx = 0; tierIdx < depth; tierIdx++) {
      const tierDef = def.tiers[tierIdx]
      if (!tierDef) break

      const league: League = {
        id: ids.next(ID_PREFIX.league),
        nationId: nation.id,
        name: tierDef.name,
        tier: tierIdx + 1,
        clubIds: [],
        reputation: tierDef.strength,
        promotionPlaces: tierDef.promotionPlaces,
        playoffPlaces: tierDef.playoffPlaces,
        relegationPlaces: tierDef.relegationPlaces,
        prizeMoneyTop: tierDef.prizeMoneyTop,
        prizeMoneyBottom: tierDef.prizeMoneyBottom,
        tvRevenue: tierDef.tvRevenue,
        continentalPlaces: tierDef.continentalPlaces,
      }
      state.leagues[league.id] = league
      nation.leagueIds.push(league.id)

      // Reputations for the whole division are drawn up front, sorted, and
      // then loosely paired with cities by size. Big clubs mostly come from
      // big cities — but the pairing is deliberately imperfect, because the
      // small-town club punching above its weight is one of football's most
      // recognisable shapes and the world feels dead without it.
      const reputations = Array.from({ length: tierDef.clubCount }, () =>
        clamp(
          rng.normal(tierDef.strength, tierDef.strength * 0.14 + 4),
          Math.max(3, tierDef.strength - 22),
          Math.min(99, tierDef.strength + 20),
        ),
      ).sort((a, b) => b - a)

      for (let i = 0; i < Math.floor(tierDef.clubCount / 3); i++) {
        const a = rng.int(0, reputations.length - 1)
        const b = rng.int(0, reputations.length - 1)
        const tmp = reputations[a]
        reputations[a] = reputations[b]
        reputations[b] = tmp
      }

      for (let i = 0; i < tierDef.clubCount; i++) {
        const city = cityPool[cityIndex % cityPool.length]
        cityIndex++
        const reputation = reputations[i]

        const club = createClub(
          rng, ids, nation, league, def, city.name, city.size, reputation, takenClubNames, season,
        )
        state.clubs[club.id] = club
        league.clubIds.push(club.id)

        // Squad. Foreign-player share rises with league wealth — a Premier
        // division is cosmopolitan, a fourth tier is overwhelmingly local.
        const foreignChance = clamp(Math.pow(league.reputation / 100, 1.2) * 0.72 - 0.03, 0.02, 0.68)
        const squad = generateSquad(playerCtx, club.id, reputation, nation, foreignChance)
        for (const player of squad) {
          state.players[player.id] = player
          club.squad.push(player.id)
        }

        // Academy intake sitting below the senior squad.
        const academy = generateYouthIntake(
          playerCtx, club.id, nation, club.facilities.youthFacilities, 50,
          Math.max(3, Math.round(club.facilities.youthFacilities / 2.5)),
        )
        for (const player of academy) {
          state.players[player.id] = player
          club.squad.push(player.id)
        }

        // Backroom staff.
        const backroom = generateBackroom(staffCtx, club.id, reputation, nation)
        for (const member of backroom) {
          state.staff[member.id] = member
          club.staff.push(member.id)
          if (member.role === 'headCoach') club.headCoachId = member.id
        }
      }
    }
  }

  // --- Derived economics ---------------------------------------------------
  // Values and wages need league context, so they are computed once every club
  // exists rather than during squad generation.
  for (const player of Object.values(state.players)) {
    finalisePlayerEconomics(state, player, season)
  }
  for (const club of Object.values(state.clubs)) {
    setBudgets(state, club)
  }

  // --- Architects ----------------------------------------------------------
  // One panel for the whole world: firms take work across borders, and a
  // per-nation panel would leave small countries with two builders.
  for (const architect of generateArchitects(
    rng.fork('architects'), ids, nationRecords.map((n) => n.id),
    Math.max(34, Math.round(nationRecords.length * 3)),
  )) {
    state.architects[architect.id] = architect
  }

  // --- Unattached staff ----------------------------------------------------
  for (const member of generateFreeAgentStaff(
    staffCtx, Object.keys(state.clubs).length, nationRecords,
  )) {
    state.staff[member.id] = member
  }

  // --- Agents --------------------------------------------------------------
  assignAgents(state, rng, ids, names, nationRecords)

  // --- Free agents ---------------------------------------------------------
  generateFreeAgents(state, playerCtx, rng)

  // --- Squad registration --------------------------------------------------
  // Named after free agents exist, so a club that starts a place short can be
  // seen to be a place short rather than quietly padded.
  for (const club of Object.values(state.clubs)) autoRegister(state, club)

  // --- Fixtures and tables -------------------------------------------------
  for (const league of Object.values(state.leagues)) {
    state.fixtures.push(...scheduleLeague(rng.fork(league.id), ids, league.id, league.clubIds, season))
    state.tables[league.id] = league.clubIds.map((clubId) => emptyTableRow(clubId))
  }

  // --- Cups ----------------------------------------------------------------
  for (const def of defs) {
    const nation = state.nations[def.id]
    const entrants = nation.leagueIds.flatMap((lid) => state.leagues[lid].clubIds)
    if (entrants.length < 4) continue
    const cup: CupCompetition = {
      id: ids.next(ID_PREFIX.cup),
      name: def.domesticCupName,
      nationId: nation.id,
      type: 'domestic',
      tier: 'none',
      entrantIds: entrants,
      rounds: [],
      currentRound: 0,
      winnerId: null,
      prizeMoneyPerRound: buildCupPrizeMoney(def.tiers[0].prizeMoneyTop),
    }
    state.cups[cup.id] = cup
  }

  // Cup entrants and the round calendar are derived, so they are established
  // the same way at world creation as at every subsequent season roll.
  for (const cup of Object.values(state.cups)) resetCup(state, cup)

  state.nextId = ids.value
  return state
}

// ---------------------------------------------------------------------------

function tierDepthFor(def: NationDef, options: WorldGenOptions): number {
  if (options.size === 'large') return def.tiers.length
  if (def.id === options.homeNationId) return def.tiers.length
  // The strongest nations keep a second tier so the transfer market has depth
  // below the elite; everyone else is top-flight only.
  if (options.size === 'standard' && def.reputation >= 85) return Math.min(2, def.tiers.length)
  return 1
}

function createClub(
  rng: Rng,
  ids: IdFactory,
  nation: Nation,
  league: League,
  def: NationDef,
  city: string,
  citySize: number,
  reputation: number,
  taken: Set<string>,
  season: number,
): Club {
  const naming = generateClubName(rng, city, def.clubNameStyle as ClubNameStyle, taken, season)

  // Stadium capacity is driven by both club standing and the size of the town
  // it sits in: a big club in a small city is capped by its catchment.
  const capacityBase = 2_000 + Math.pow(reputation / 100, 2.1) * 62_000
  const cityFactor = 0.55 + (citySize / 100) * 0.75
  const capacity = Math.round((capacityBase * cityFactor) / 250) * 250

  // Grounds are built stand by stand, with condition and type reflecting the
  // club's standing: a non-league ground is a terrace with a roof over one
  // side, a top-flight one is four covered stands and a row of boxes.
  const totalCapacity = clamp(capacity, 800, 82_000)
  const stands = generateStands(rng, totalCapacity, reputation, season)

  // Stands are each rounded to the nearest fifty, so the ground's capacity is
  // whatever they actually add up to rather than the figure they were sized
  // from — otherwise the cached total disagrees with the stands beneath it.
  const builtCapacity = stands.reduce((sum, st) => sum + st.capacity, 0)

  const facilities: Facilities = {
    stadium: {
      name: generateStadiumName(rng, city, naming.name),
      capacity: builtCapacity,
      quality: clamp(rng.normalInt(reputation * 0.85 + 12, 10, 5, 99), 5, 99),
      ticketPrice: Math.round(clamp(8 + (reputation / 100) * 42, 6, 62)),
      stands,
      builtYear: Math.min(...stands.map((st) => st.builtYear)),
      // Most clubs own their ground; a minority of smaller ones are tenants,
      // which closes off every option but relocation.
      owned: reputation > 30 || rng.chance(0.75),
      pitchCondition: clamp(rng.normalInt(60 + reputation * 0.3, 12, 25, 99), 25, 99),
      relocatedSeason: null,
    },
    stadiumProject: null,
    trainingGround: facilityLevel(rng, reputation),
    youthFacilities: facilityLevel(rng, reputation),
    medicalCentre: facilityLevel(rng, reputation),
    dataDepartment: facilityLevel(rng, reputation * 0.85),
    scoutingNetwork: facilityLevel(rng, reputation),
    projects: [],
  }

  const finances = createFinances(rng, reputation, league, nation)
  const strategy = createStrategy(rng, reputation)
  const expectation = createExpectation(rng, league, reputation)

  return {
    id: ids.next(ID_PREFIX.club),
    name: naming.name,
    shortName: naming.shortName,
    nickname: naming.nickname,
    nationId: nation.id,
    city,
    leagueId: league.id,
    founded: naming.founded,
    colors: naming.colors,
    reputation: Math.round(reputation),
    continentalReputation: Math.round(reputation * 0.85),
    finances,
    facilities,
    squad: [],
    loanedIn: [],
    registeredIds: [],
    staff: [],
    headCoachId: null,
    strategy,
    board: {
      confidence: rng.normalInt(66, 10, 35, 92),
      expectation,
      mandates: rollMandates(rng, finances, reputation, league),
      tenureSeasons: 0,
      warnings: 0,
      lastRequestWeek: -99,
      requestsThisSeason: 0,
    },
    history: [],
    fanbase: clamp(Math.round(reputation * 0.7 + citySize * 0.3), 4, 99),
    fanMood: rng.normalInt(62, 10, 30, 90),
    isPlayerClub: false,
  }
}

/**
 * Lay out an existing ground.
 *
 * Stands vary in age and condition within one stadium, because real grounds
 * are built piecemeal over a century — which is what gives a club one
 * crumbling end and three sound ones, and therefore something specific to fix.
 */
function generateStands(
  rng: Rng,
  totalCapacity: number,
  reputation: number,
  season: number,
): Stand[] {
  const shares = [0.3, 0.27, 0.22, 0.21]
  const names = ['Main Stand', 'North Stand', 'East Stand', 'West Stand']
  const ids: StandId[] = ['north', 'south', 'east', 'west']

  return ids.map((id, index) => {
    // The main stand is newest and best appointed; the ends lag behind.
    const isMain = index === 0
    const modernity = clamp(reputation / 100 + (isMain ? 0.2 : 0) + rng.float(-0.18, 0.18), 0, 1)

    const type: StandType = modernity > 0.62
      ? 'coveredSeated'
      : modernity > 0.3 ? 'seated' : 'terrace'

    const builtYear = Math.round(clamp(
      season - rng.normal(38 - modernity * 26, 16),
      season - 95,
      season - 2,
    ))

    return {
      id,
      name: names[index],
      capacity: Math.round((totalCapacity * shares[index]) / 50) * 50,
      // Condition follows age as well as standing. Without the age term a
      // stand built six years ago could be generated half-derelict, which
      // reads as a bug the moment the build year is shown next to it.
      condition: clamp(
        rng.normalInt(
          clamp(96 - (season - builtYear) * 1.15 + reputation * 0.12, 20, 97),
          10, 15, 98,
        ),
        15, 98,
      ),
      type,
      hospitalityBoxes: isMain
        ? Math.max(0, Math.round(rng.normal(reputation / 3.5, reputation / 8)))
        : Math.max(0, Math.round(rng.normal(reputation / 14, 3))),
      builtYear,
      closedSeats: 0,
    }
  })
}

function facilityLevel(rng: Rng, reputation: number): number {
  return clamp(Math.round(rng.normal(1 + (reputation / 100) * 17, 2.4)), 1, 20)
}

function createFinances(rng: Rng, reputation: number, league: League, nation: Nation): ClubFinances {
  // Revenue scales sharply with standing, so does the wage bill; the balance
  // left over is small and volatile, which is what makes finance a live
  // constraint rather than a number that only goes up.
  const revenueScale = Math.pow(reputation / 100, 2.4) * 120_000_000 * nation.economyFactor
  const wageBudget = Math.round(((revenueScale * 0.58) / 52) / 100) * 100
  const balance = Math.round(rng.normal(revenueScale * 0.06, revenueScale * 0.09))
  const debt = rng.chance(0.35) ? Math.round(Math.abs(rng.normal(revenueScale * 0.12, revenueScale * 0.1))) : 0

  return {
    balance,
    wageBudget: Math.max(2_500, wageBudget),
    transferBudget: Math.max(0, Math.round(Math.max(0, balance) * 0.45 + revenueScale * 0.05)),
    debt,
    weeklyInterestRate: 0.0009,
    season: emptyLedger(),
    lastSeason: null,
    sponsorship: {
      shirtSponsor: generateSponsorName(rng),
      shirtValuePerSeason: Math.round((revenueScale * 0.09) / 1000) * 1000,
      kitSupplier: generateKitSupplier(rng),
      kitValuePerSeason: Math.round((revenueScale * 0.05) / 1000) * 1000,
      expiresSeason: league.tier === 1 ? 0 : 0, // set by caller relative to season
    },
    inCrisis: false,
    regulation: { lastRatio: null, breachSeasons: 0, sanctions: [], pointsDeducted: 0 },
  }
}

export function emptyLedger() {
  return {
    matchdayIncome: 0,
    tvIncome: 0,
    sponsorshipIncome: 0,
    prizeMoney: 0,
    transfersIn: 0,
    wagesPaid: 0,
    transfersOut: 0,
    facilitiesSpend: 0,
    staffWages: 0,
    agentFees: 0,
    amortisation: 0,
    playerTradingProfit: 0,
    interestPaid: 0,
    otherIncome: 0,
    otherCosts: 0,
  }
}

function createStrategy(rng: Rng, reputation: number): ClubStrategy {
  return {
    // Smaller clubs lean on youth and selling because they have to.
    youthEmphasis: clamp(rng.normalInt(75 - reputation * 0.4, 14, 5, 95), 5, 95),
    systemFit: rng.normalInt(55, 15, 10, 92),
    wageAggression: clamp(rng.normalInt(30 + reputation * 0.4, 13, 5, 95), 5, 95),
    sellingClubStance: clamp(rng.normalInt(80 - reputation * 0.55, 14, 5, 95), 5, 95),
    domesticBias: clamp(rng.normalInt(80 - reputation * 0.45, 15, 8, 95), 8, 95),
    mediaStance: rng.weightedPairs([
      ['guarded' as const, 30], ['balanced' as const, 45], ['open' as const, 18], ['combative' as const, 7],
    ]),
    targetSquadSize: rng.int(23, 27),
  }
}

function createExpectation(rng: Rng, league: League, reputation: number): BoardExpectation {
  // Where the board thinks this club belongs, given its standing relative to
  // the rest of its division. Generated from reputation alone at world
  // creation; recalculated each season from actual finishes after that.
  const clubCount = league.clubIds.length || 20
  const relative = clamp((league.reputation + 20 - reputation) / 40, 0, 1)
  const target = clamp(Math.round(1 + relative * (clubCount - 1)), 1, clubCount)

  let description: string
  if (target === 1) description = 'Win the division'
  else if (target <= 4) description = `Finish in the top ${target}`
  else if (target <= clubCount / 2) description = `Finish comfortably in the top half`
  else if (target >= clubCount - 3) description = 'Survive'
  else description = 'Consolidate in mid-table'

  return {
    leaguePosition: target,
    description,
    cupImportance: rng.normalInt(40, 15, 5, 90),
    financialImportance: rng.normalInt(55, 18, 10, 95),
    youthImportance: rng.normalInt(45, 18, 5, 95),
  }
}

function rollMandates(rng: Rng, finances: ClubFinances, reputation: number, league: League): BoardMandate[] {
  const mandates: BoardMandate[] = []
  if (finances.debt > 0 && rng.chance(0.7)) mandates.push('balanceBooks')
  if (finances.balance < 0) mandates.push('reduceWageBill')
  if (reputation < league.reputation - 8) mandates.push('avoidRelegation')
  if (reputation > league.reputation + 10 && league.promotionPlaces > 0) mandates.push('winPromotion')
  if (rng.chance(0.35)) mandates.push('developYouth')
  if (rng.chance(0.2)) mandates.push('improveFacilities')
  return mandates
}

function generateSponsorName(rng: Rng): string {
  const prefixes = [
    'Northgate', 'Ardent', 'Kestrel', 'Vantage', 'Meridian', 'Halcyon', 'Brightpath',
    'Ironclad', 'Sablewood', 'Crestline', 'Belmont', 'Quorum', 'Larkfield', 'Redshift',
  ]
  const suffixes = [
    'Insurance', 'Logistics', 'Energy', 'Bank', 'Motors', 'Telecom', 'Group',
    'Holdings', 'Partners', 'Foods', 'Airlines', 'Digital', 'Brewing', 'Homes',
  ]
  return `${rng.pick(prefixes)} ${rng.pick(suffixes)}`
}

function generateKitSupplier(rng: Rng): string {
  return rng.pick([
    'Volara', 'Strider', 'Kappix', 'Meridia', 'Orbital', 'Tessera', 'Vantik',
    'Hallmark Sport', 'Northfield', 'Apex Athletic', 'Cadence', 'Fenwick Sport',
  ])
}

function finalisePlayerEconomics(state: GameState, player: Player, season: number): void {
  const club = player.clubId ? state.clubs[player.clubId] : null
  const league = club ? state.leagues[club.leagueId] : null
  const nation = club ? state.nations[club.nationId] : state.nations[player.nationalityId]

  player.value = computeValue(player, league, nation ?? null, season)
  player.wageDemand = computeWageDemand(player, league, nation ?? null)

  if (player.contract) {
    if (player.contract.wage === 0) {
      // Existing contracts were signed in the past, so they sit somewhat below
      // what the player would now command — which is exactly the gap that makes
      // renewals a live problem the moment a player has a good season.
      player.contract.wage = Math.round(player.wageDemand * (player.isAcademy ? 0.25 : 0.86))
    }
    if (player.contract.releaseClause === 0) {
      player.contract.releaseClause = Math.round((player.value * 1.9) / 100_000) * 100_000
    }
  }
}

function setBudgets(state: GameState, club: Club): void {
  // The wage budget generated from revenue has to be reconciled against the
  // squad the club actually has, or half the world starts in breach of it.
  let wageBill = 0
  for (const id of club.squad) {
    const p = state.players[id]
    if (p?.contract) wageBill += p.contract.wage
  }
  for (const id of club.staff) {
    const s = state.staff[id]
    if (s?.contract) wageBill += s.contract.wage
  }
  club.finances.wageBudget = Math.max(club.finances.wageBudget, Math.round(wageBill * 1.08))
  const sponsorship = club.finances.sponsorship
  sponsorship.expiresSeason = state.date.season + 1 + (club.reputation % 3)
}

function assignAgents(
  state: GameState,
  rng: Rng,
  ids: IdFactory,
  names: NameGenerator,
  nations: Nation[],
): void {
  // A modest number of agents, each with several clients, so that a
  // relationship with one agent is worth cultivating and falling out with a
  // powerful one has consequences across several deals.
  const agentCount = Math.max(12, Math.round(Object.keys(state.players).length / 90))
  const agents: Agent[] = []

  for (let i = 0; i < agentCount; i++) {
    const nation = rng.weighted(nations, nations.map((n) => n.reputation))
    const name = names.forNation(nation)
    const agent: Agent = {
      id: ids.next(ID_PREFIX.agent),
      name: `${name.firstName} ${name.lastName}`,
      reputation: clamp(rng.normalInt(52, 22, 5, 99), 5, 99),
      aggression: rng.normalInt(50, 20, 5, 95),
      relationship: rng.normalInt(50, 12, 20, 80),
      clientIds: [],
    }
    state.agents[agent.id] = agent
    agents.push(agent)
  }

  // Better players get better-connected agents. Fringe and academy players
  // often have none, which is why they are cheaper to deal with.
  for (const player of Object.values(state.players)) {
    if (player.isAcademy && !rng.chance(0.25)) continue
    if (player.currentAbility < 55 && !rng.chance(0.4)) continue

    const suitability = agents.map((a) => {
      const gap = Math.abs(a.reputation - player.currentAbility / 2)
      return Math.max(1, 60 - gap)
    })
    const agent = rng.weighted(agents, suitability)
    player.agentId = agent.id
    agent.clientIds.push(player.id)
  }
}

function generateFreeAgents(
  state: GameState,
  ctx: Parameters<typeof generatePlayer>[0],
  rng: Rng,
): void {
  // A pool of unattached players, mostly older or lower-quality, plus a few
  // genuine bargains. This is the lifeline for a club with no transfer budget,
  // which at the bottom of the pyramid is every club.
  const nations = Object.values(state.nations)
  const count = Math.max(40, Math.round(Object.keys(state.clubs).length * 0.8))

  for (let i = 0; i < count; i++) {
    const nation = rng.weighted(nations, nations.map((n) => n.population))
    const ability = rng.chance(0.08)
      ? rng.normalInt(115, 18, 70, 160) // the occasional real find
      : rng.normalInt(62, 18, 25, 110)
    const position = rng.weightedPairs<Position>([
      ['GK', 10], ['DC', 14], ['DL', 8], ['DR', 8], ['DM', 8],
      ['MC', 14], ['ML', 8], ['MR', 8], ['AM', 9], ['ST', 13],
    ])
    const player = generatePlayer(ctx, {
      position,
      currentAbility: ability,
      homeNation: nation,
      foreignChance: 0.25,
      clubId: null,
      age: rng.chance(0.6) ? rng.int(29, 36) : rng.int(19, 28),
    })
    player.value = 0
    player.wageDemand = computeWageDemand(player, null, nation)
    state.players[player.id] = player
  }
}

function generateOutlets(rng: Rng, ids: IdFactory, def: NationDef): MediaOutlet[] {
  const broadsheets = ['The Chronicle', 'The Gazette', 'The Observer Post', 'The Standard']
  const tabloids = ['The Daily Roar', 'Back Page', 'The Whistle', 'Kick Off Daily']
  const digital = ['Touchline', 'The Byline', 'Matchday Wire', 'Transfer Desk']

  const outlets: MediaOutlet[] = []
  const make = (name: string, credibility: number, sensationalism: number): MediaOutlet => ({
    id: ids.next(ID_PREFIX.outlet),
    name: `${name} (${def.code})`,
    nationId: def.id,
    credibility: clamp(Math.round(rng.normal(credibility, 8)), 5, 98),
    sensationalism: clamp(Math.round(rng.normal(sensationalism, 10)), 5, 98),
    relationship: rng.normalInt(50, 10, 25, 78),
  })

  outlets.push(make(rng.pick(broadsheets), 82, 25))
  outlets.push(make(rng.pick(tabloids), 42, 85))
  outlets.push(make(rng.pick(digital), 62, 58))
  return outlets
}

/**
 * Round-by-round cup prize money, paid to every club that survives a round.
 *
 * Scaled so a winner collects roughly a seventh of what winning the top
 * division pays — a cup run is a windfall, not a substitute for league revenue.
 * The early rounds matter most in absolute terms at the bottom of the pyramid,
 * where a first-round cheque is several months of wages.
 */
function buildCupPrizeMoney(topFlightPrize: number): number[] {
  const base = topFlightPrize * 0.003
  return [1, 1.6, 2.6, 4.2, 7, 12, 22].map((m) => Math.round((base * m) / 1000) * 1000)
}

export function emptyTableRow(clubId: ID): LeagueTableRow {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
  }
}

/** Convenience accessor used widely by the UI and the systems. */
export function playersOf(state: GameState, club: Club): Player[] {
  return club.squad.map((id) => state.players[id]).filter((p): p is Player => Boolean(p))
}

export function staffOf(state: GameState, club: Club): Staff[] {
  return club.staff.map((id) => state.staff[id]).filter((s): s is Staff => Boolean(s))
}
