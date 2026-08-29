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

export const STAND_IDS: StandId[] = ['north', 'south', 'east', 'west']

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

/** Places actually usable this week, allowing for closures and ongoing works. */
export function usableCapacity(stadium: Stadium, project: StadiumProject | null): number {
  const built = stadium.stands.reduce(
    (sum, stand) => sum + Math.max(0, stand.capacity - stand.closedSeats),
    0,
  )
  return Math.max(0, built - (project?.capacityReduction ?? 0))
}

/** Overall condition of the ground, weighted by how big each stand is. */
export function stadiumQuality(stadium: Stadium): number {
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
export function refreshStadium(club: Club): void {
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

export function isAvailable(architect: Architect, state: GameState): boolean {
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
export function buildStands(
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
