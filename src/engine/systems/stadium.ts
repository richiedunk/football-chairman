import { clamp, Rng } from '../rng'
import { IdFactory, ID_PREFIX } from '../ids'
import { costOfLivingIndex, weeklyRevenue } from './finance'
import { formatMoney } from './valuation'
import type {
  Architect, ArchitectBid, Club, GameState, ID, Stadium, Stand, StandId, StandType,
  StadiumProject, StadiumWorkKind,
} from '../types'

/**
 * The stadium.
 *
 * Grounds are modelled stand by stand, because that is how they are built,
 * maintained and condemned. A club with three good stands and one crumbling
 * terrace has a specific problem it can price and fix; a club with "stadium
 * quality 47" has an abstraction nobody can act on.
 *
 * Work is tendered to architects rather than bought from a menu. That turns a
 * capital project into the decision it actually is: the cheap firm and the
 * good firm quote different numbers, the good firm is busy until March, and
 * the difference between them only shows up eighteen months later.
 */

const STAND_IDS: StandId[] = ['north', 'south', 'east', 'west']

export const WORK_LABELS: Record<StadiumWorkKind, string> = {
  repair: 'Repairs',
  upgrade: 'Upgrade',
  expand: 'Expansion',
  rebuild: 'Full rebuild',
  relocate: 'New stadium',
}

export const WORK_DESCRIPTIONS: Record<StadiumWorkKind, string> = {
  repair: 'Make a stand safe again. Reopens closed places and restores condition. No new capacity.',
  upgrade: 'Improve a stand: seat a terrace, put a roof on it, add executive boxes. Raises what each supporter is worth.',
  expand: 'Demolish a stand and rebuild it larger. The main route to real capacity.',
  rebuild: 'Level the whole ground and build a new one on the same site. Years of work and reduced capacity throughout.',
  relocate: 'Build a new stadium elsewhere and sell the old site. The biggest thing a club can do, and supporters do not all forgive it.',
}

export const STAND_TYPE_LABELS: Record<StandType, string> = {
  terrace: 'Terrace',
  seated: 'Seated',
  coveredSeated: 'Covered seating',
}

/** Revenue multiplier per head by stand type — a covered seat sells more. */
const STAND_TYPE_REVENUE: Record<StandType, number> = {
  terrace: 0.72,
  seated: 1,
  coveredSeated: 1.18,
}

/** A single executive box is worth many ordinary seats on matchday. */
const HOSPITALITY_BOX_MULTIPLIER = 34

// ---------------------------------------------------------------------------
// Derived stadium state
// ---------------------------------------------------------------------------

/**
 * The ground this club would have if it had built for its own catchment.
 *
 * Capacity is driven by both club standing and the size of the town it sits
 * in: a big club in a small city is capped by its catchment. Generation sizes
 * every stadium from this, and `expandStadium` will not build past it — which
 * is the only thing stopping AI expansion running away, because attendance is
 * modelled as a *share* of capacity and so a bigger ground fills to the same
 * fraction and sells out all over again. Reputation rises with success, so the
 * ceiling rises with the club rather than being fixed at what it started as.
 */
export function naturalCapacity(reputation: number, citySize: number): number {
  const capacityBase = 2_000 + Math.pow(reputation / 100, 2.1) * 62_000
  const cityFactor = 0.55 + (citySize / 100) * 0.75
  return capacityBase * cityFactor
}

/** Places actually usable this week, allowing for closures and ongoing works. */
export function usableCapacity(stadium: Stadium, project: StadiumProject | null): number {
  const built = stadium.stands.reduce(
    (sum, stand) => sum + Math.max(0, stand.capacity - stand.closedSeats),
    0,
  )
  return Math.max(0, built - (project?.capacityReduction ?? 0))
}

/** Overall condition of the ground, weighted by how big each stand is. */
function stadiumQuality(stadium: Stadium): number {
  const total = stadium.stands.reduce((sum, s) => sum + s.capacity, 0)
  if (total === 0) return 0
  const weighted = stadium.stands.reduce((sum, s) => {
    const typeBonus = s.type === 'coveredSeated' ? 12 : s.type === 'seated' ? 5 : 0
    const boxBonus = Math.min(15, s.hospitalityBoxes * 0.4)
    return sum + (clamp(s.condition + typeBonus + boxBonus, 0, 100) * s.capacity)
  }, 0)
  return clamp(Math.round(weighted / total), 1, 100)
}

/**
 * Matchday revenue per attending supporter.
 *
 * Executive boxes dominate this at a well-appointed ground, which is why an
 * upgrade that adds twenty boxes can be worth more than an expansion that adds
 * five thousand seats.
 */
export function revenuePerHead(stadium: Stadium): number {
  const total = stadium.stands.reduce((sum, s) => sum + s.capacity, 0)
  if (total === 0) return stadium.ticketPrice

  let weighted = 0
  let boxes = 0
  for (const stand of stadium.stands) {
    weighted += STAND_TYPE_REVENUE[stand.type] * stand.capacity
    boxes += stand.hospitalityBoxes
  }
  const typeFactor = weighted / total
  const conditionFactor = 0.82 + (stadiumQuality(stadium) / 100) * 0.36
  const hospitality = (boxes * HOSPITALITY_BOX_MULTIPLIER) / Math.max(1, total)

  return stadium.ticketPrice * (typeFactor * conditionFactor + hospitality)
}

/** Recompute the cached capacity and quality fields after any change. */
function refreshStadium(club: Club): void {
  const stadium = club.facilities.stadium
  stadium.capacity = usableCapacity(stadium, club.facilities.stadiumProject)
  stadium.quality = stadiumQuality(stadium)
}

// ---------------------------------------------------------------------------
// Decay and safety
// ---------------------------------------------------------------------------

/**
 * Weekly wear. Stands decay faster as they age, and once condition falls far
 * enough the safety officer starts closing places — which costs real matchday
 * income and is the mechanism that makes neglect expensive rather than free.
 */
export function decayStadium(
  state: GameState,
  club: Club,
  rng: Rng,
): { closures: string[]; warnings: string[] } {
  const closures: string[] = []
  const warnings: string[] = []
  const stadium = club.facilities.stadium
  const project = club.facilities.stadiumProject

  for (const stand of stadium.stands) {
    // A stand being worked on is not decaying.
    if (project && project.standId === stand.id) continue

    const age = Math.max(0, state.date.season - stand.builtYear)
    // Older structures need more looking after.
    const decayRate = 0.035 + age * 0.0016
    stand.condition = clamp(stand.condition - decayRate, 0, 100)

    if (stand.condition < 30) {
      // The safety officer starts taking places out of use.
      const atRisk = Math.round(stand.capacity * 0.12)
      if (stand.closedSeats < stand.capacity * 0.6 && rng.chance(0.08)) {
        stand.closedSeats = Math.min(stand.capacity, stand.closedSeats + atRisk)
        closures.push(
          `The safety officer has closed ${atRisk.toLocaleString()} places in the ${stand.name}. They stay shut until the stand is repaired.`,
        )
      }
    } else if (stand.condition < 45 && rng.chance(0.03)) {
      warnings.push(
        `The ${stand.name} is deteriorating. Repairs now would be cheaper than a closure notice later.`,
      )
    }
  }

  // The pitch, which is cheap to look after and expensive to ignore.
  stadium.pitchCondition = clamp(stadium.pitchCondition - 0.25, 0, 100)
  if (state.date.week >= 48 || state.date.week <= 5) {
    // Relaid in the summer.
    stadium.pitchCondition = clamp(stadium.pitchCondition + 4, 0, 100)
  }

  refreshStadium(club)
  return { closures, warnings }
}

// ---------------------------------------------------------------------------
// Costing
// ---------------------------------------------------------------------------

export interface WorkSpec {
  kind: StadiumWorkKind
  standId?: StandId
  /** Expansion and relocation: places to add or build. */
  capacity?: number
  /** Upgrade: what the stand becomes. */
  standType?: StandType
  /** Upgrade: boxes to add. */
  hospitalityBoxes?: number
  /** Relocation: what the new ground is called. */
  stadiumName?: string
}

/**
 * Base cost of a piece of work before any architect's fee.
 *
 * Everything is priced off real drivers — seats built, condition restored,
 * boxes fitted — and scaled by local construction costs, so the same stand
 * costs more in London than in Carlisle.
 */
export function baseCost(state: GameState, club: Club, spec: WorkSpec): number {
  const col = costOfLivingIndex(state, club)
  const stadium = club.facilities.stadium
  const stand = spec.standId ? stadium.stands.find((s) => s.id === spec.standId) : null

  switch (spec.kind) {
    case 'repair': {
      if (!stand) return 0
      const deficit = 100 - stand.condition
      // Priced per place, rising with how far the stand has been let go. The
      // per-place figure matters: an earlier version multiplied the condition
      // deficit by the capacity by a large constant and quoted £208,000 to
      // repair an 850-place non-league terrace.
      return Math.round(stand.capacity * (14 + deficit * 0.55) * col)
    }
    case 'upgrade': {
      if (!stand) return 0
      const typeCost = spec.standType && spec.standType !== stand.type
        ? stand.capacity * (spec.standType === 'coveredSeated' ? 520 : 300)
        : 0
      const boxCost = (spec.hospitalityBoxes ?? 0) * 62_000
      return Math.round((typeCost + boxCost + stand.capacity * 30) * col)
    }
    case 'expand': {
      const added = spec.capacity ?? 0
      const demolition = stand ? stand.capacity * 90 : 0
      return Math.round((added * 1_450 + demolition + 700_000) * col)
    }
    case 'rebuild': {
      const target = spec.capacity ?? stadium.capacity
      return Math.round((target * 2_100 + stadium.capacity * 140 + 1_800_000) * col)
    }
    case 'relocate': {
      const target = spec.capacity ?? stadium.capacity
      // Land, infrastructure and a whole new ground. The fixed component
      // scales with the size of the project rather than being a flat figure,
      // so a 4,000-seat ground is not priced like a 60,000-seat one.
      return Math.round((target * 2_600 + Math.max(1_500_000, target * 700)) * col)
    }
  }
}

/** Base duration in weeks, before the architect's speed is applied. */
export function baseWeeks(club: Club, spec: WorkSpec): number {
  const stadium = club.facilities.stadium
  const stand = spec.standId ? stadium.stands.find((s) => s.id === spec.standId) : null

  switch (spec.kind) {
    case 'repair':
      return Math.max(3, Math.round(3 + (stand ? (100 - stand.condition) / 12 : 4)))
    case 'upgrade':
      return Math.max(8, Math.round(8 + (spec.hospitalityBoxes ?? 0) * 0.5))
    case 'expand':
      return Math.max(24, Math.round(24 + (spec.capacity ?? 0) / 700))
    case 'rebuild':
      return Math.max(70, Math.round(70 + (spec.capacity ?? stadium.capacity) / 900))
    case 'relocate':
      return Math.max(90, Math.round(90 + (spec.capacity ?? stadium.capacity) / 800))
  }
}

/** Places out of use while the work is done. */
export function capacityLostDuring(club: Club, spec: WorkSpec): number {
  const stadium = club.facilities.stadium
  const stand = spec.standId ? stadium.stands.find((s) => s.id === spec.standId) : null

  switch (spec.kind) {
    case 'repair':
      // Repairs are done around the fixture list where possible.
      return stand ? Math.round(stand.capacity * 0.25) : 0
    case 'upgrade':
      return stand ? Math.round(stand.capacity * 0.6) : 0
    case 'expand':
      return stand ? stand.capacity : 0
    case 'rebuild':
      // Playing on a building site: most of the ground is unusable throughout.
      return Math.round(stadium.capacity * 0.55)
    case 'relocate':
      // The old ground keeps working until the new one opens.
      return 0
  }
}

// ---------------------------------------------------------------------------
// The architect panel
// ---------------------------------------------------------------------------

function isAvailable(architect: Architect, state: GameState): boolean {
  if (!architect.busyUntil) return true
  const { season, week } = architect.busyUntil
  if (state.date.season > season) return true
  return state.date.season === season && state.date.week >= week
}

/**
 * Invite tenders.
 *
 * Every firm on the panel quotes, including the ones that are busy or out of
 * their depth — with the reason. A panel that silently hid the good firms
 * would just look like a short list.
 */
export function inviteTenders(
  state: GameState,
  club: Club,
  spec: WorkSpec,
): ArchitectBid[] {
  const base = baseCost(state, club, spec)
  const weeks = baseWeeks(club, spec)

  // Every firm on the panel quotes. Filtering by nationality left a club in a
  // smaller country with two possible builders, and the reputation gate below
  // already decides who will actually take the job.
  return Object.values(state.architects)
    .map((architect) => {
      const specialist = architect.specialisms.includes(spec.kind)
      // Outside their specialism a firm quotes higher and slower, because they
      // are covering themselves.
      const costPenalty = specialist ? 1 : 1.22
      const timePenalty = specialist ? 1 : 1.25

      // Round to a granularity that suits the size of the job. A flat £10,000
      // step made every cheap firm quote exactly the same figure for a small
      // repair, which removed the point of comparing them.
      const raw = base * architect.costFactor * costPenalty
      const step = raw < 250_000 ? 1_000 : raw < 2_000_000 ? 10_000 : 50_000
      const cost = Math.round(raw / step) * step
      const duration = Math.max(2, Math.round(weeks * architect.speedFactor * timePenalty))

      const available = isAvailable(architect, state)
      const unavailableReason = available
        ? undefined
        : `Committed elsewhere until week ${architect.busyUntil?.week} of ${architect.busyUntil?.season}.`

      return {
        architectId: architect.id,
        firm: architect.firm,
        cost,
        weeks: duration,
        note: pitchFor(architect, spec, specialist),
        risk: riskBand(architect.reliability),
        // A landmark practice will not do a small club's repairs, but the gap
        // has to be wide before that bites — otherwise a lower-league club has
        // nobody at all willing to quote.
        available: available && (club.reputation >= architect.reputation - 48),
        unavailableReason: available
          ? (club.reputation < architect.reputation - 48
            ? 'They do not take on work at clubs of this size.'
            : undefined)
          : unavailableReason,
      }
    })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1
      return a.cost - b.cost
    })
}

function riskBand(reliability: number): ArchitectBid['risk'] {
  if (reliability >= 80) return 'dependable'
  if (reliability >= 60) return 'usually fine'
  if (reliability >= 38) return 'has form for overruns'
  return 'a gamble'
}

function pitchFor(architect: Architect, spec: WorkSpec, specialist: boolean): string {
  if (!specialist) {
    return `${architect.firm} do not usually take on ${WORK_LABELS[spec.kind].toLowerCase()}, and have priced accordingly.`
  }
  if (architect.reputation > 78) {
    return 'A landmark practice. Expensive, and the finished ground will say so.'
  }
  if (architect.costFactor < 0.9) {
    return 'The cheapest quote on the table. There is usually a reason for that.'
  }
  if (architect.reliability > 80) {
    return 'Unglamorous, punctual, and they finish what they start.'
  }
  return 'A straightforward quote from a firm that does this sort of work regularly.'
}

// ---------------------------------------------------------------------------
// Awarding and running the work
// ---------------------------------------------------------------------------

export interface AwardResult {
  ok: boolean
  message: string
  project?: StadiumProject
}

/**
 * How a project is paid for.
 *
 * Cash is simpler and cheaper. Borrowing is how stadiums actually get built:
 * the money arrives now and the club services the debt for years afterwards,
 * which is precisely the trade a director of football should have to weigh.
 */
export type Financing = 'cash' | 'borrow'

/** The most a club can borrow against future revenue for building work. */
export function borrowingLimit(state: GameState, club: Club): number {
  const revenue = weeklyRevenue(state, club)
  const headroom = Math.max(0, revenue * 110 - club.finances.debt)
  return Math.round(headroom / 10_000) * 10_000
}

export function awardContract(
  state: GameState,
  club: Club,
  ids: IdFactory,
  spec: WorkSpec,
  architectId: ID,
  financing: Financing = 'cash',
): AwardResult {
  if (club.facilities.stadiumProject) {
    return { ok: false, message: 'There is already work under way at the ground.' }
  }
  const architect = state.architects[architectId]
  if (!architect) return { ok: false, message: 'That firm is not on the panel.' }

  const bid = inviteTenders(state, club, spec).find((b) => b.architectId === architectId)
  if (!bid) return { ok: false, message: 'That firm did not tender for this work.' }
  if (!bid.available) {
    return { ok: false, message: bid.unavailableReason ?? 'They are not available.' }
  }
  // A tenant can maintain the ground it plays in — a landlord will always
  // permit repairs, and forbidding them created a dead end where safety
  // closures accumulated with no remedy short of an unaffordable move. What a
  // tenant cannot do is alter or rebuild somebody else's property.
  if (!club.facilities.stadium.owned && spec.kind !== 'relocate' && spec.kind !== 'repair') {
    return {
      ok: false,
      message: 'The club does not own the ground. It can be maintained, but not altered — a move is the only way to a bigger stadium.',
    }
  }
  if (club.finances.inCrisis) {
    return { ok: false, message: 'The board will not sanction building work while the club is in crisis.' }
  }
  if (financing === 'cash' && bid.cost > club.finances.balance) {
    return {
      ok: false,
      message: `The club cannot cover ${formatMoney(bid.cost, state.settings.currency)} in cash. Borrow against future revenue, or ask the board to underwrite it.`,
    }
  }
  if (financing === 'borrow' && bid.cost > borrowingLimit(state, club)) {
    return {
      ok: false,
      message: `No lender will advance ${formatMoney(bid.cost, state.settings.currency)} against this club's revenue.`,
    }
  }

  const stadium = club.facilities.stadium
  const stand = spec.standId ? stadium.stands.find((s) => s.id === spec.standId) : null

  const project: StadiumProject = {
    id: ids.next(ID_PREFIX.project),
    kind: spec.kind,
    standId: spec.standId ?? null,
    architectId: architect.id,
    architectFirm: architect.firm,
    agreedCost: bid.cost,
    agreedWeeks: bid.weeks,
    weeklyCost: Math.round(bid.cost / bid.weeks),
    weeksRemaining: bid.weeks,
    spent: 0,
    overrunCost: 0,
    overrunWeeks: 0,
    description: describeWork(spec, stand?.name),
    capacityReduction: capacityLostDuring(club, spec),
    outcome: buildOutcome(state, club, spec, architect),
  }

  if (financing === 'borrow') {
    // The money arrives now and is repaid out of revenue for years afterwards.
    club.finances.debt += bid.cost
    club.finances.balance += bid.cost
  }

  club.facilities.stadiumProject = project
  architect.busyUntil = {
    season: state.date.season + Math.floor((state.date.week + bid.weeks) / 52),
    week: (state.date.week + bid.weeks) % 52,
  }
  refreshStadium(club)

  return { ok: true, message: `${architect.firm} have been appointed. Work starts immediately.`, project }
}

function describeWork(spec: WorkSpec, standName?: string): string {
  switch (spec.kind) {
    case 'repair': return `Repairing the ${standName ?? 'stand'}`
    case 'upgrade': return `Upgrading the ${standName ?? 'stand'}`
    case 'expand': return `Rebuilding the ${standName ?? 'stand'} larger`
    case 'rebuild': return 'Rebuilding the stadium'
    case 'relocate': return `Building ${spec.stadiumName ?? 'a new stadium'}`
  }
}

function buildOutcome(
  state: GameState,
  club: Club,
  spec: WorkSpec,
  architect: Architect,
): StadiumProject['outcome'] {
  const stadium = club.facilities.stadium
  const stand = spec.standId ? stadium.stands.find((s) => s.id === spec.standId) : null
  // A good firm leaves a better building behind than a cheap one, for the same
  // brief — which is the whole reason to pay more.
  const finish = clamp(88 + architect.craftsmanship * 0.12, 85, 100)

  switch (spec.kind) {
    case 'repair':
      return { condition: finish }
    case 'upgrade':
      return {
        condition: finish,
        type: spec.standType ?? stand?.type,
        hospitalityBoxes: (stand?.hospitalityBoxes ?? 0) + (spec.hospitalityBoxes ?? 0),
      }
    case 'expand':
      return {
        condition: finish,
        capacity: (stand?.capacity ?? 0) + (spec.capacity ?? 0),
        type: stand?.type === 'terrace' ? 'seated' : stand?.type,
      }
    case 'rebuild': {
      const capacity = spec.capacity ?? stadium.capacity
      return {
        newStands: buildStands(
          new Rng(`${state.seed}:rebuild:${club.id}`),
          capacity, state.date.season, finish, boxCountFor(capacity, architect),
        ),
        condition: finish,
        pitchCondition: 95,
      }
    }
    case 'relocate': {
      const capacity = spec.capacity ?? stadium.capacity
      return {
        newStands: buildStands(
          new Rng(`${state.seed}:relocate:${club.id}`),
          capacity, state.date.season, finish, boxCountFor(capacity, architect),
        ),
        stadiumName: spec.stadiumName ?? `New ${club.city} Stadium`,
        condition: finish,
        pitchCondition: 98,
      }
    }
  }
}

/**
 * How many executive boxes a new ground gets.
 *
 * Driven by the size of the stadium, not by how famous the architect is: a
 * 12,000-seat ground built today has a row of boxes whoever designed it, and
 * pinning the count to the architect's reputation produced a £39m stadium with
 * two of them.
 */
function boxCountFor(capacity: number, architect: Architect): number {
  const base = capacity / 380
  return Math.max(2, Math.round(base * (0.75 + (architect.craftsmanship / 100) * 0.5)))
}

/** Lay out a fresh set of four stands to a target capacity. */
function buildStands(
  rng: Rng,
  totalCapacity: number,
  year: number,
  condition: number,
  boxes: number,
): Stand[] {
  // Main stand is bigger than the ends, as it almost always is.
  const shares = [0.3, 0.28, 0.21, 0.21]
  const names = ['Main Stand', 'North Stand', 'East Stand', 'West Stand']
  return STAND_IDS.map((id, index) => ({
    id,
    name: names[index],
    capacity: Math.round((totalCapacity * shares[index]) / 50) * 50,
    condition,
    type: 'coveredSeated' as StandType,
    hospitalityBoxes: index === 0 ? boxes : Math.round(boxes * rng.float(0, 0.2)),
    builtYear: year,
    closedSeats: 0,
  }))
}

/**
 * Weekly construction pass.
 *
 * Overruns are rolled each week against the architect's reliability, so a
 * cheap firm's true cost emerges gradually rather than being known up front —
 * which is exactly what makes choosing one a gamble rather than arithmetic.
 */
export function progressStadiumWork(
  state: GameState,
  club: Club,
  rng: Rng,
): { notices: string[]; completed: boolean } {
  const project = club.facilities.stadiumProject
  if (!project) return { notices: [], completed: false }

  const notices: string[] = []
  const architect = state.architects[project.architectId]

  club.finances.balance -= project.weeklyCost
  club.finances.season.facilitiesSpend += project.weeklyCost
  project.spent += project.weeklyCost
  project.weeksRemaining -= 1

  // Overrun risk, weighted by how unreliable the firm is.
  const reliability = architect?.reliability ?? 60
  const overrunChance = clamp((100 - reliability) / 1400, 0.005, 0.08)
  if (project.weeksRemaining > 0 && rng.chance(overrunChance)) {
    const extraWeeks = rng.int(2, 6)
    const extraCost = Math.round(project.weeklyCost * extraWeeks * rng.float(0.8, 1.5))
    project.weeksRemaining += extraWeeks
    project.overrunWeeks += extraWeeks
    project.overrunCost += extraCost
    project.agreedCost += extraCost
    notices.push(
      `${project.architectFirm} report a delay on the ${project.description.toLowerCase()}: ${extraWeeks} more weeks and ${formatMoney(extraCost, state.settings.currency)} on top.`,
    )
  }

  if (project.weeksRemaining > 0) {
    refreshStadium(club)
    return { notices, completed: false }
  }

  notices.push(...completeProject(state, club, project))
  club.facilities.stadiumProject = null
  refreshStadium(club)
  return { notices, completed: true }
}

function completeProject(state: GameState, club: Club, project: StadiumProject): string[] {
  const stadium = club.facilities.stadium
  const notices: string[] = []
  const outcome = project.outcome

  if (outcome.newStands) {
    // A rebuild or a move: the old ground is gone.
    const oldName = stadium.name
    stadium.stands = outcome.newStands
    stadium.builtYear = state.date.season
    stadium.owned = true
    if (outcome.stadiumName) stadium.name = outcome.stadiumName
    if (outcome.pitchCondition) stadium.pitchCondition = outcome.pitchCondition

    if (project.kind === 'relocate') {
      stadium.relocatedSeason = state.date.season
      // Selling the old site is a substantial one-off.
      const saleValue = Math.round(weeklyRevenue(state, club) * 26)
      club.finances.balance += saleValue
      club.finances.season.otherIncome += saleValue
      // Supporters do not all come with you.
      club.fanMood = clamp(club.fanMood - 14, 1, 100)
      club.fanbase = clamp(club.fanbase - 3, 1, 100)
      notices.push(
        `${stadium.name} is open. The old ${oldName} site sold for ${formatMoney(saleValue, state.settings.currency)}. Not every supporter has made the move.`,
      )
    } else {
      notices.push(`The rebuilt ${stadium.name} is complete.`)
    }
    // A new ground raises the club's standing.
    club.reputation = Math.min(99, club.reputation + (project.kind === 'relocate' ? 3 : 2))
  } else if (project.standId) {
    const stand = stadium.stands.find((s) => s.id === project.standId)
    if (stand) {
      if (outcome.condition !== undefined) stand.condition = outcome.condition
      if (outcome.capacity !== undefined) stand.capacity = outcome.capacity
      if (outcome.type !== undefined) stand.type = outcome.type
      if (outcome.hospitalityBoxes !== undefined) stand.hospitalityBoxes = outcome.hospitalityBoxes
      stand.closedSeats = 0
      stand.builtYear = state.date.season
      notices.push(`${project.description} is complete. The ${stand.name} is back in full use.`)
    }
  }

  // A finished project pleases the crowd — a relocation notwithstanding.
  if (project.kind !== 'relocate') {
    club.fanMood = clamp(club.fanMood + (project.kind === 'repair' ? 2 : 6), 1, 100)
  }

  if (project.overrunCost > 0) {
    notices.push(
      `Final cost ${formatMoney(project.agreedCost, state.settings.currency)}, ${formatMoney(project.overrunCost, state.settings.currency)} over the tender.`,
    )
  }

  return notices
}

// ---------------------------------------------------------------------------
// Architect generation
// ---------------------------------------------------------------------------

const FIRM_PREFIXES = [
  'Halloran', 'Whitfield', 'Braid', 'Ashcombe', 'Renwick', 'Calder', 'Meyrick',
  'Sandhurst', 'Vantage', 'Oakhill', 'Pemberton', 'Thackray', 'Lindqvist',
  'Moreau', 'Brenner', 'Castellan', 'Nordheim', 'Alvarez', 'Okonkwo', 'Takeda',
]
const FIRM_SUFFIXES = [
  'Partnership', 'Associates', 'Architects', 'Design Group', 'Studio',
  'Structures', 'Consulting', 'Projects', 'Works',
]

/**
 * Build the panel.
 *
 * Deliberately spans the full range: a handful of landmark practices who will
 * not look at a small club, a middle tier of competent regional firms, and
 * some cheap outfits whose quotes are too good to be true.
 */
export function generateArchitects(
  rng: Rng,
  ids: IdFactory,
  nationIds: ID[],
  count: number,
): Architect[] {
  const out: Architect[] = []
  const usedNames = new Set<string>()

  // Prefixes are consumed rather than sampled, so the panel does not end up
  // with three variations on the same family name.
  const availablePrefixes = rng.shuffle(FIRM_PREFIXES)

  for (let i = 0; i < count; i++) {
    let firm = ''
    const prefix = availablePrefixes[i % availablePrefixes.length]
    for (const suffix of rng.shuffle(FIRM_SUFFIXES)) {
      const candidate = `${prefix} ${suffix}`
      if (!usedNames.has(candidate)) {
        firm = candidate
        usedNames.add(candidate)
        break
      }
    }
    if (!firm) firm = `${prefix} & Partners ${i}`

    // Skewed low: most architectural practices are small regional firms, and
    // a panel clustered around the middle leaves lower-league clubs with
    // nobody who will quote for a terrace repair.
    const reputation = clamp(rng.normal(38, 24), 6, 96)

    // Specialisms cluster by size: small firms do repairs and upgrades, big
    // ones do rebuilds and new grounds.
    const specialisms: StadiumWorkKind[] = ['repair']
    if (reputation > 22) specialisms.push('upgrade')
    if (reputation > 40) specialisms.push('expand')
    if (reputation > 62) specialisms.push('rebuild')
    if (reputation > 76) specialisms.push('relocate')

    out.push({
      id: ids.next(ID_PREFIX.project),
      firm,
      reputation: Math.round(reputation),
      specialisms,
      // Reputation and price correlate, but imperfectly — the point of a panel
      // is that the cheapest quote is not always the worst decision.
      costFactor: clamp(0.72 + (reputation / 100) * 0.55 + rng.float(-0.12, 0.12), 0.65, 1.5),
      speedFactor: clamp(rng.normal(1, 0.16), 0.7, 1.45),
      reliability: clamp(Math.round(rng.normal(30 + reputation * 0.55, 16)), 10, 97),
      craftsmanship: clamp(Math.round(rng.normal(reputation, 12)), 5, 99),
      nationId: rng.pick(nationIds),
      busyUntil: null,
    })
  }

  return out
}

/** Free up architects whose commitments have run out. */
export function releaseArchitects(state: GameState): void {
  for (const architect of Object.values(state.architects)) {
    if (architect.busyUntil && isAvailable(architect, state)) architect.busyUntil = null
  }
}

// ---------------------------------------------------------------------------
// Clubs that look after their own ground
// ---------------------------------------------------------------------------

/**
 * A club with nobody in the director's chair maintaining its own stadium.
 *
 * **This was missing entirely, and it was quietly the largest defect in the
 * game.** `stadiumProject` was only ever set by the human: no AI code path
 * anywhere started building work. So every stand at all 237 other clubs
 * decayed at three and a half per cent a week for ever, the safety officer
 * closed places twelve per cent at a time up to sixty per cent of a stand, and
 * nothing was ever repaired.
 *
 * Measured over fourteen seasons, average stadium capacity fell 27% in the top
 * flight and 45% in the fourth tier. Matchday income is capacity times a rate,
 * so it fell with it — a third to a half of every club's largest revenue line,
 * gone. That is what was shrinking the world's economy, which shrank the wage
 * budgets, which priced adult professionals out of the lower leagues and left
 * fourteen hundred of them unsigned while squads ran four to five men short.
 *
 * The young drift, the season roll that never healed and the falling revenue
 * were all the same thing: the grounds were falling down.
 *
 * Real clubs do this without being asked. A safety closure is an emergency and
 * gets fixed; a stand allowed to rot is a scandal. So an AI club repairs on the
 * same terms a director would, and no better: it pays the going rate to a real
 * firm from the same panel, it cannot start work while in crisis, and it can
 * only afford what it can afford.
 */

/** Condition at which a club calls somebody in, before the closures start. */
const AI_REPAIR_THRESHOLD = 55

/**
 * How much of the balance a club will put into its ground at once.
 *
 * Deliberately cautious. The point is that grounds are maintained, not that AI
 * clubs out-build the player — a director who inherits a well-kept stadium
 * still has expansion, hospitality and relocation to himself, and those are
 * where the interesting decisions are.
 */
const AI_REPAIR_SHARE = 0.35

/**
 * Look at the ground, and call the builders if it needs them.
 *
 * Runs for AI clubs only, on the same rotation as the rest of the club week.
 */
export function maintainStadium(
  state: GameState,
  club: Club,
  ids: IdFactory,
  rng: Rng,
): void {
  if (club.facilities.stadiumProject) return
  if (club.finances.inCrisis) return

  // The worst stand, and only if it is bad enough to act on. Closed places
  // count for more than a low condition: seats nobody may sit in are revenue
  // already being lost rather than revenue at risk.
  let worst: Stand | null = null
  let worstScore = 0
  for (const stand of club.facilities.stadium.stands) {
    const closedShare = stand.capacity > 0 ? stand.closedSeats / stand.capacity : 0
    const score = (AI_REPAIR_THRESHOLD - stand.condition) + closedShare * 120
    if (score > worstScore) {
      worst = stand
      worstScore = score
    }
  }
  if (!worst || worstScore <= 0) return

  // Not every club is on top of it every week. Without this the whole world
  // repairs in lockstep the moment a threshold is crossed, which is both
  // unrealistic and a wall of identical building work.
  if (!rng.chance(0.12)) return

  const spec: WorkSpec = { kind: 'repair', standId: worst.id }
  const affordable = club.finances.balance * AI_REPAIR_SHARE
  const bids = inviteTenders(state, club, spec)
    .filter((b) => b.available && b.cost <= affordable)
  if (bids.length === 0) return

  // Cheapest that can do the job. An AI club has no reason to pay for a name,
  // and a director who does is buying speed and a better finish with money the
  // board would rather have kept — which is the trade the human gets to make.
  const chosen = bids.reduce((best, b) => (b.cost < best.cost ? b : best))
  awardContract(state, club, ids, spec, chosen.architectId, 'cash')
}

/**
 * Building a bigger ground.
 *
 * The other half of why AI clubs hoard. Twelve seasons in, a top-flight club
 * holds two years of turnover and has spent £44,000 of a £106m income on its
 * stadium — not because it decided against building, but because nothing ever
 * asked it to. Wage budgets are a share of revenue, so a bank balance is
 * invisible to every other spending decision in the game; capital work is the
 * only thing that can touch it.
 *
 * The trigger is the one a real board uses: the ground keeps selling out.
 * `selloutsThisSeason` is counted on matchday because `computeAttendance`
 * clamps fill at capacity and the excess demand is unrecoverable afterwards.
 *
 * This only ever fires where the demand is. Measured across every
 * fixture-shaped pairing in the world, tier 1 runs at 0.868 mean fill with a
 * p90 of 0.992, tier 2 at 0.802 — and tiers 3-5 at 0.69, 0.60 and 0.54 never
 * come close, which is roughly right for real lower-league football. A club in
 * front of half-empty stands does not build, and the gate below leaves it
 * alone rather than needing a tier check to say so.
 */

/** Full houses in a season before a board will look at the drawings. */
const AI_EXPAND_SELLOUTS = 6

/**
 * How much of the balance goes into an expansion.
 *
 * Larger than the repair share because this is the deliberate act rather than
 * the maintenance, and because the whole point is to move a balance that
 * nothing else in the game can move. Still short of everything: a club that
 * empties its account to build cannot then sign anybody.
 */
const AI_EXPAND_SHARE = 0.45

/** Places added, as a share of the current ground. */
const AI_EXPAND_STEP = 0.18

/**
 * How far past its catchment a club will build.
 *
 * Without this the whole thing runs away, and the measurement was unambiguous:
 * over thirty seasons the average top-flight ground reached 103,849 places,
 * larger than any stadium on earth. The cause is structural rather than a
 * mis-set number — `computeAttendance` returns a *share* of capacity, so a
 * ground that doubles fills to the same fraction, sells out again and is
 * expanded again, for ever. Nothing in that loop can ever be satisfied.
 *
 * The honest repair is an absolute demand model: a headcount that a bigger
 * ground actually serves. Short of that, the catchment is the real limit and
 * the world model already states it — a big club in a small city is capped by
 * the town it plays in. A club may build somewhat past it, because ambitious
 * clubs do, and no further.
 */
const AI_EXPAND_HEADROOM = 1.15

export function expandStadium(
  state: GameState,
  club: Club,
  ids: IdFactory,
  rng: Rng,
): void {
  if (club.facilities.stadiumProject) return
  if (club.finances.inCrisis) return
  // A tenant cannot alter somebody else's property. `awardContract` refuses
  // this too; checking here saves tendering for work that cannot be awarded.
  if (!club.facilities.stadium.owned) return
  if (club.facilities.stadium.selloutsThisSeason < AI_EXPAND_SELLOUTS) return

  // Rebuild the smallest stand larger. It is the cheapest to demolish, it is
  // usually the oldest, and it is how grounds actually grow — one side at a
  // time, over years, rather than all at once.
  let smallest: Stand | null = null
  for (const stand of club.facilities.stadium.stands) {
    if (!smallest || stand.capacity < smallest.capacity) smallest = stand
  }
  if (!smallest) return

  // Boards do not all move in the same week, and a stadium project runs for
  // most of two years — so this is rarer than the repair check by design.
  if (!rng.chance(0.06)) return

  // Not past what the town will fill. Reputation is in here, so a club that
  // climbs the pyramid earns a bigger ceiling rather than being held to the
  // one it was generated with.
  const nation = state.nations[club.nationId]
  const citySize = nation?.cities.find((c) => c.name === club.city)?.size ?? 50
  const ceiling = naturalCapacity(club.reputation, citySize) * AI_EXPAND_HEADROOM
  if (club.facilities.stadium.capacity >= ceiling) return

  // Never overshoot the ceiling with the step itself.
  const step = Math.round(club.facilities.stadium.capacity * AI_EXPAND_STEP)
  const added = Math.min(step, Math.round(ceiling - club.facilities.stadium.capacity))
  if (added < 500) return

  const spec: WorkSpec = { kind: 'expand', standId: smallest.id, capacity: added }
  const affordable = club.finances.balance * AI_EXPAND_SHARE
  const bids = inviteTenders(state, club, spec)
    .filter((b) => b.available && b.cost <= affordable)
  if (bids.length === 0) return

  const chosen = bids.reduce((best, b) => (b.cost < best.cost ? b : best))
  awardContract(state, club, ids, spec, chosen.architectId, 'cash')
}
