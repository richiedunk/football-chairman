import { IdFactory, ID_PREFIX } from '../ids'
import { clamp } from '../rng'
import { annualAmortisation, ledgerIncome, weeklyRevenue } from './finance'
import { totalWageBill } from './valuation'
import type {
  Club, FinanceLedger, GameState, RegulationSanction, SanctionKind,
} from '../types'

/**
 * Financial regulation.
 *
 * The rule modelled is the **squad-cost ratio**, not a three-year
 * profit-and-loss test. That choice matters. A P&L test is a rule about
 * owners: it asks whether somebody covered the losses, which is not a
 * question a director of football answers. The squad-cost ratio asks what
 * share of what the club earns is going on the squad — wages, the write-down
 * of transfer fees, and agents — and that is precisely the number a director
 * of football moves every time he signs anyone.
 *
 * It also travels. This world spans two orders of magnitude from a non-league
 * club to a champion, and a fixed cash allowance would be meaningless at one
 * end and irrelevant at the other. A ratio means the same thing to both, and
 * it bites in season one rather than in season three.
 *
 * Sanctions stop at the sporting: a warning, a fine, an embargo on
 * registering players, and ultimately a points deduction. No administration,
 * no forced sale, no winding-up — those are things that happen to owners, and
 * you are not the owner. What happens to you is that the board runs out of
 * patience, which the board machinery already handles.
 */

/** Share of revenue a club may spend on its squad. */
export const SQUAD_COST_LIMIT = 0.7

/**
 * Above the limit, but inside what the authorities will live with.
 *
 * Every real regime has one of these — UEFA calls it acceptable deviation —
 * and it is the difference between a rule and a trap. A club a little over
 * agrees a plan and is monitored; only a club a long way over, and staying
 * there, gets punished. Without the band, one club in eight was being fined
 * and embargoed every season, which is an order of magnitude more than
 * football actually sanctions.
 *
 * Widened once, from 80%, when a busier transfer market raised amortisation
 * across the world and pushed the number of clubs punished back into double
 * figures. The clubs were genuinely spending more; the band is what decides
 * how much of that the authorities will live with.
 */
export const SANCTION_THRESHOLD = 0.85

/** Above this the breach is severe enough to skip a step. */
export const SEVERE_BREACH = 0.95

export interface SquadCostAssessment {
  /** Wages, amortisation and agent fees. */
  squadCost: number
  /** Revenue, plus profit on player sales. */
  relevantIncome: number
  /** squadCost / relevantIncome. Infinity if the club earned nothing. */
  ratio: number
  inBreach: boolean
  /** How far over the limit, in money. Zero when compliant. */
  excess: number
  /** Itemised, for the finance screen — a bare number explains nothing. */
  components: { label: string; amount: number; income: boolean }[]
}

/**
 * Assess a completed season's books.
 *
 * Uses the closed ledger rather than live figures, because a rule assessed on
 * a moving number is a rule nobody can plan against.
 */
export function assessSquadCost(ledger: FinanceLedger): SquadCostAssessment {
  const wages = ledger.wagesPaid + ledger.staffWages
  const amortisation = ledger.amortisation
  const agents = ledger.agentFees
  const squadCost = wages + amortisation + agents

  // Player-trading profit counts as income, which is why selling well is the
  // orthodox way out of a squad-cost problem and why academies pay twice.
  const revenue = ledgerIncome(ledger) - ledger.transfersOut
  const trading = Math.max(0, ledger.playerTradingProfit)
  const relevantIncome = revenue + trading

  const ratio = relevantIncome > 0 ? squadCost / relevantIncome : Infinity
  const allowed = relevantIncome * SQUAD_COST_LIMIT

  return {
    squadCost,
    relevantIncome,
    ratio,
    inBreach: ratio > SQUAD_COST_LIMIT,
    excess: Math.max(0, Math.round(squadCost - allowed)),
    components: [
      { label: 'Player wages', amount: ledger.wagesPaid, income: false },
      { label: 'Staff wages', amount: ledger.staffWages, income: false },
      { label: 'Transfer fees written down', amount: amortisation, income: false },
      { label: 'Agent fees', amount: agents, income: false },
      { label: 'Revenue', amount: revenue, income: true },
      { label: 'Profit on player sales', amount: trading, income: true },
    ],
  }
}

/**
 * A live estimate for the current season, for the finance screen.
 *
 * Deliberately separate from the assessment: this is a projection a director
 * uses to decide whether he can afford a signing, and calling it an assessment
 * would imply a precision it does not have.
 */
export function projectedSquadCost(state: GameState, club: Club): SquadCostAssessment {
  const ledger = club.finances.season

  // The income side is built from the club's run rate rather than extrapolated
  // from the ledger so far. Revenue does not arrive evenly — matchday money
  // comes in bursts and prize money lands at the end of the season — so
  // scaling eleven weeks of receipts up to a full year said 93% for a club
  // heading for 55%, which is worse than showing nothing.
  const revenue = weeklyRevenue(state, club) * 52
  const prize = ledger.prizeMoney > 0
    ? ledger.prizeMoney
    : club.finances.lastSeason?.prizeMoney ?? 0

  const weeksGone = Math.max(1, state.date.week)
  const seasonFactor = 52 / weeksGone

  const projected: FinanceLedger = {
    ...ledger,
    wagesPaid: totalWageBill(state, club) * 52,
    staffWages: Math.round(ledger.staffWages * seasonFactor),
    amortisation: annualAmortisation(state, club),
    agentFees: Math.round(ledger.agentFees * seasonFactor),
    // Revenue is expressed as one line: the split between matchday, TV and
    // sponsorship does not change the ratio and pretending to know it
    // mid-season would be inventing precision.
    matchdayIncome: Math.round(revenue),
    tvIncome: 0,
    sponsorshipIncome: 0,
    prizeMoney: Math.round(prize),
    otherIncome: ledger.otherIncome,
  }
  return assessSquadCost(projected)
}

export const SANCTION_LABELS: Record<SanctionKind, string> = {
  warning: 'Formal warning',
  fine: 'Fine',
  pointsDeduction: 'Points deduction',
  registrationEmbargo: 'Registration embargo',
}

/** True while the club may not add anyone new to its squad list. */
export function underEmbargo(club: Club): boolean {
  return embargoedSince(club) !== null
}

/**
 * The season an active registration embargo was imposed, if there is one.
 *
 * The date is the whole rule. An embargo stops a club registering players it
 * has *acquired since* — it does not stop it naming the squad it already had.
 * Reading it as "nobody new on the list" instead of "nobody signed since"
 * emptied squad lists down to four players and turned a sanction into a
 * demolition.
 */
export function embargoedSince(club: Club): number | null {
  let season: number | null = null
  // The regulation record is created by the v4 migration, and the v2 step runs
  // before it — v2 rebuilds squad lists through `autoRegister`, which asks
  // whether the club is under an embargo. So on a save older than v4 this is
  // reached with no record at all, and read unguarded it threw, which meant a
  // genuinely old save could not be loaded. A club with no record has no
  // sanctions, which is the right answer as well as the safe one.
  for (const sanction of club.finances.regulation?.sanctions ?? []) {
    if (sanction.kind !== 'registrationEmbargo' || sanction.seasonsRemaining <= 0) continue
    if (season === null || sanction.season < season) season = sanction.season
  }
  return season
}

/** Whether an embargoed club may name this player. */
export function embargoAllows(club: Club, joinedSeason: number): boolean {
  const since = embargoedSince(club)
  return since === null || joinedSeason <= since
}

export interface RegulationOutcome {
  assessment: SquadCostAssessment
  imposed: RegulationSanction[]
}

/**
 * Judge a club on the season it has just completed.
 *
 * Escalation is deliberately slow at the start and hard afterwards. A single
 * bad year gets a warning, because clubs have bad years and a rule that
 * punishes one is a rule that punishes bad luck. Persisting gets an embargo,
 * which bites through the squad-registration list rather than through a
 * message: you may still buy, you may not register what you bought. Only a
 * club that keeps going gets points docked.
 */
export function assessClub(
  state: GameState,
  club: Club,
  ledger: FinanceLedger,
  ids: IdFactory,
): RegulationOutcome {
  const record = club.finances.regulation
  const assessment = assessSquadCost(ledger)
  const season = state.date.season
  const imposed: RegulationSanction[] = []

  // The first season of a save is assessed but not punished beyond a warning.
  //
  // A new world is generated without reference to this rule, so it opens with
  // roughly a quarter of clubs already outside it — sanctioned in their first
  // year for a squad the director inherited and had no hand in assembling.
  // Real regulations arrived the same way and came with the same grace: you
  // are told where you stand, and you have a year to put it right. From the
  // second season the world has adjusted and the breach rate settles around
  // one club in eight, which is where it should be.
  const firstAssessment = record.lastRatio === null
    && record.breachSeasons === 0
    && record.sanctions.length === 0

  // Sanctions already running tick down before anything new is added, so a
  // one-season embargo is one season and not two.
  for (const sanction of record.sanctions) {
    if (sanction.seasonsRemaining > 0) sanction.seasonsRemaining -= 1
  }
  record.sanctions = record.sanctions.filter(
    (s) => s.seasonsRemaining > 0 || s.season >= season - 3,
  )

  record.lastRatio = Number.isFinite(assessment.ratio) ? assessment.ratio : null

  if (!assessment.inBreach) {
    record.breachSeasons = 0
    return { assessment, imposed }
  }

  record.breachSeasons += 1
  const severe = assessment.ratio > SEVERE_BREACH
  const beyondDeviation = assessment.ratio > SANCTION_THRESHOLD
  const percent = Math.round(assessment.ratio * 100)

  const add = (kind: SanctionKind, amount: number, reason: string, seasons = 0) => {
    const sanction: RegulationSanction = {
      id: ids.next(ID_PREFIX.sanction),
      season,
      kind,
      amount,
      reason,
      seasonsRemaining: seasons,
    }
    record.sanctions.unshift(sanction)
    imposed.push(sanction)
  }

  const reason = `Squad costs were ${percent}% of relevant income against a limit of ${Math.round(SQUAD_COST_LIMIT * 100)}%.`

  if (firstAssessment) {
    // The baseline year does not count against the club either: escalation
    // starts from the first season it was in a position to do anything about.
    record.breachSeasons = 0
    add('warning', 0, `${reason} No sanction applies in the first year of assessment.`)
    return { assessment, imposed }
  }

  // Inside the acceptable deviation, or a first year over: the club is told
  // where it stands and monitored. This is where most breaches end.
  if (!beyondDeviation) {
    add('warning', 0, `${reason} Within the margin the authorities will accept, for now.`)
    return { assessment, imposed }
  }
  if (record.breachSeasons === 1 && !severe) {
    add('warning', 0, reason)
    return { assessment, imposed }
  }

  // A fine proportionate to the overspend, capped so it cannot itself be the
  // thing that finishes the club off.
  const fine = Math.round(
    clamp(assessment.excess * 0.18, 0, Math.max(0, club.finances.balance) * 0.4 + assessment.excess * 0.05),
  )
  if (fine > 0) {
    club.finances.balance -= fine
    club.finances.season.otherCosts += fine
    add('fine', fine, reason)
  }

  if (record.breachSeasons >= 3 || severe) {
    add('registrationEmbargo', 0, reason, 1)
  }

  if (record.breachSeasons >= 4 || (severe && record.breachSeasons >= 2)) {
    // Scaled by how far over, so a club a fraction outside is not treated the
    // same as one at double the limit.
    const points = clamp(Math.round(3 + (assessment.ratio - SQUAD_COST_LIMIT) * 12), 3, 12)
    record.pointsDeducted += points
    add('pointsDeduction', points, reason)
  }

  return { assessment, imposed }
}

/**
 * Apply any pending points deduction to the new season's table.
 *
 * Applied to the table rather than held as a separate column, so every screen
 * that reads the table — the league, the board's expectations, the run-in —
 * sees the same truth without knowing regulation exists.
 */
export function applyPointsDeductions(state: GameState): { club: Club; points: number }[] {
  const applied: { club: Club; points: number }[] = []
  for (const club of Object.values(state.clubs)) {
    const pending = club.finances.regulation.pointsDeducted
    if (pending <= 0) continue
    const table = state.tables[club.leagueId]
    const row = table?.find((r) => r.clubId === club.id)
    if (!row) continue
    row.points -= pending
    applied.push({ club, points: pending })
    club.finances.regulation.pointsDeducted = 0
  }
  return applied
}
