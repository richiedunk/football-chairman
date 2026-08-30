import { clamp, Rng } from '../rng'
import { totalWageBill } from './valuation'
import { emptyLedger } from '../world/worldGen'
import { revenuePerHead } from './stadium'
import type { Club, FinanceLedger, GameState, League, Player } from '../types'

/**
 * Club finances.
 *
 * Money arrives lumpily — matchday on the day, TV in instalments, prize money
 * once a year — and leaves every single week as wages. That mismatch is the
 * whole problem: a club can be profitable across a season and still run out of
 * cash in February, which is when a director of football has to sell someone.
 */

/** Weekly financial pass for one club. Returns notable events for the inbox. */
export function processFinances(
  state: GameState,
  club: Club,
  rng: Rng,
  playedHomeThisWeek: { attendance: number } | null,
): string[] {
  const notes: string[] = []
  const ledger = club.finances.season
  const league = state.leagues[club.leagueId]

  // --- Income ---------------------------------------------------------------
  if (playedHomeThisWeek) {
    // Matchday income is per head, and what a head is worth depends on what
    // they are sitting in: a covered seat outsells a terrace, and executive
    // boxes outsell everything. That is what makes an upgrade adding twenty
    // boxes potentially worth more than an expansion adding five thousand
    // seats.
    const gate = Math.round(playedHomeThisWeek.attendance * revenuePerHead(club.facilities.stadium))
    club.finances.balance += gate
    ledger.matchdayIncome += gate
  }

  // TV and central distributions, paid in weekly instalments across the season.
  if (league) {
    const weekly = Math.round(league.tvRevenue / 46)
    club.finances.balance += weekly
    ledger.tvIncome += weekly
  }

  // Sponsorship, likewise spread across the year.
  const sponsorWeekly = Math.round(
    (club.finances.sponsorship.shirtValuePerSeason + club.finances.sponsorship.kitValuePerSeason) / 52,
  )
  club.finances.balance += sponsorWeekly
  ledger.sponsorshipIncome += sponsorWeekly

  // --- Outgoings ------------------------------------------------------------
  let playerWages = 0
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player?.contract) continue
    // Out on loan: the parent pays only the share it agreed to keep.
    playerWages += player.loanClubId
      ? player.contract.wage * player.loanWageShare
      : player.contract.wage
  }
  // Borrowed players: this club pays whatever the parent did not.
  for (const id of club.loanedIn) {
    const player = state.players[id]
    if (!player?.contract) continue
    playerWages += player.contract.wage * (1 - player.loanWageShare)
  }
  let staffWages = 0
  for (const id of club.staff) {
    const member = state.staff[id]
    if (member?.contract) staffWages += member.contract.wage
  }

  club.finances.balance -= playerWages + staffWages
  ledger.wagesPaid += playerWages
  ledger.staffWages += staffWages

  // Running costs: the stadium, the training ground, the scouting network and
  // the academy all cost money every week whether you use them or not.
  const upkeep = facilityUpkeep(state, club)
  club.finances.balance -= upkeep
  ledger.otherCosts += upkeep

  // Construction in progress.
  for (const project of club.facilities.projects) {
    club.finances.balance -= project.weeklyCost
    ledger.facilitiesSpend += project.weeklyCost
  }

  // Debt servicing.
  if (club.finances.debt > 0) {
    const interest = Math.round(club.finances.debt * club.finances.weeklyInterestRate)
    club.finances.balance -= interest
    ledger.interestPaid += interest

    // Repay out of whatever is spare above a working-capital buffer.
    //
    // The old rule only repaid once the balance exceeded 30% of the debt,
    // which is exactly backwards: the larger the debt, the more unreachable
    // the condition, so a club that fell far enough behind could never begin
    // repaying at all. Traced over four seasons, clubs were sitting on debts
    // of a quarter to two thirds of a billion that did not move by a penny
    // while they ran a healthy weekly surplus, because they would have needed
    // £180m in the bank before the first repayment was allowed.
    const buffer = weeklyRevenue(state, club) * DEBT_BUFFER_WEEKS
    if (club.finances.balance > buffer) {
      const spare = club.finances.balance - buffer
      const repayment = Math.round(Math.min(club.finances.debt, spare * 0.25))
      club.finances.debt -= repayment
      club.finances.balance -= repayment
    }
  }

  // --- Amortisation ---------------------------------------------------------
  // Accrued weekly into the ledger, and never touched against the balance:
  // writing a fee down is a cost, not a payment. The cash left when the player
  // was signed.
  accrueAmortisation(state, club)

  // --- Crisis handling ------------------------------------------------------
  const wasInCrisis = club.finances.inCrisis
  if (club.finances.balance < 0) {
    // An overdraft becomes debt, at a worse rate than planned borrowing.
    const shortfall = -club.finances.balance
    club.finances.debt += Math.round(shortfall * 1.05)
    club.finances.balance = 0
    // Roughly nine months of revenue. Clubs carry debt routinely; crisis is
    // for debt that cannot plausibly be serviced.
    club.finances.inCrisis = club.finances.debt > weeklyRevenue(state, club) * 40
  } else if (club.finances.debt < weeklyRevenue(state, club) * 20) {
    club.finances.inCrisis = false
  }

  if (club.finances.inCrisis && !wasInCrisis) {
    notes.push(
      'The club can no longer cover its outgoings. The board has imposed a transfer embargo until the books balance.',
    )
  }
  if (!club.finances.inCrisis && wasInCrisis) {
    notes.push('The club is out of immediate financial danger. The embargo has been lifted.')
  }

  // Occasional windfalls and unexpected costs keep the ledger from being
  // perfectly predictable.
  if (rng.chance(0.02)) {
    const amount = Math.round(weeklyRevenue(state, club) * rng.float(0.3, 1.4))
    if (rng.chance(0.55)) {
      club.finances.balance += amount
      ledger.otherIncome += amount
      notes.push(`Unexpected income of ${amount.toLocaleString()} from commercial activity.`)
    } else {
      club.finances.balance = Math.max(0, club.finances.balance - amount)
      ledger.otherCosts += amount
      notes.push(`Unbudgeted costs of ${amount.toLocaleString()} — maintenance and compliance.`)
    }
  }

  return notes
}

/**
 * Cost of living where the club is based.
 *
 * Wages and rent are not the same everywhere. A groundsman in London costs
 * more than a groundsman in Carlisle, and a training complex outside Milan
 * costs more to run than one outside Bydgoszcz. Combining the nation's economy
 * with the size of the club's own city gives a single multiplier that applies
 * to every people-and-property cost.
 */
export function costOfLivingIndex(state: GameState, club: Club): number {
  const nation = state.nations[club.nationId]
  const city = nation?.cities.find((c) => c.name === club.city)
  const citySize = city?.size ?? 45
  // Nation economy carries most of it; the city adds a local premium, so a
  // capital-city club pays noticeably more than a small-town one in the same
  // country.
  return (nation?.economyFactor ?? 1) * (0.68 + (citySize / 100) * 0.62)
}

/**
 * Itemised weekly operating costs.
 *
 * Kept as a breakdown rather than a single figure for two reasons. It is the
 * only way a player can act on the number — "your wage bill is fine, your
 * ground is eating you alive" is actionable where a lump sum is not — and it
 * forces each cost to be modelled on something real rather than on a level
 * number multiplied by a constant.
 */
export interface OperatingCosts {
  /** Upkeep of the stands, pitch and floodlights. Scales with seats. */
  stadiumMaintenance: number
  /** Rent and rates on the ground, scaled by local property costs. */
  groundRent: number
  /** Running the training ground — charged per player who uses it. */
  trainingGround: number
  /** Running the academy — charged per academy player. */
  youthSetup: number
  /** Medical and rehabilitation, charged per registered player. */
  medical: number
  /** Analysts' tooling, data feeds and subscriptions. */
  dataDepartment: number
  /** Scouts' travel and the network's fixed costs. */
  scoutingNetwork: number
  /** Groundstaff, kit, catering, admin — the people who are not on the list. */
  supportStaff: number
  /** Implied headcount behind that support staff figure, for the UI. */
  supportHeadcount: number
  /**
   * Everything else it takes to run a football club: staging matches, travel,
   * insurance, policing and stewarding, commercial and ticketing operations,
   * professional fees and tax.
   *
   * A proportion of turnover rather than an itemised list, because that is
   * what it is — the costs scale with the size of the operation and none of
   * them is a decision the director of football makes. Without it clubs banked
   * 15-28% of everything they earned and the balances climbed for ever;
   * football clubs run at or about break-even, and a world where they do not
   * is one where money has nowhere to go.
   */
  generalOverheads: number
  total: number
}

/**
 * Per-seat costs scale with the club's standing as well as its size.
 *
 * A 60,000-seat all-seater with undersoil heating, hospitality and a safety
 * certificate is not simply twenty of a 3,000-capacity non-league ground: it
 * costs more per seat, not the same. Without the standing term the model gave
 * the top flight operating costs of 6% of revenue and the fifth tier 67%,
 * which is backwards — big clubs spend more in absolute terms, small clubs
 * have the worse *ratio*, and both need to be true at once.
 */
function stadiumCostPerSeat(reputation: number): number {
  return 0.22 + Math.pow(reputation / 100, 1.6) * 1.9
}

function groundRentPerSeat(reputation: number): number {
  return 0.12 + Math.pow(reputation / 100, 1.4) * 0.85
}

/** Weekly cost of one support-staff head, driven by local wage levels. */
function supportStaffCost(reputation: number): number {
  return 50 + Math.pow(reputation / 100, 1.8) * 3000
}

/**
 * Share of turnover that goes on running the club, beyond the itemised lines.
 *
 * Rises gently with the size of the operation, and gently is the point. The
 * itemised lines above carry the economies of scale — a ground, a training
 * pitch and a physiotherapist cost roughly what they cost whoever owns them,
 * which is why they eat a quarter of a non-league club's income and a twelfth
 * of a big club's. Staging matches, travelling, insuring and administering do
 * scale with the operation, so the share climbs, but only enough to put more
 * drag on the clubs with money to spare without cancelling the gradient: a
 * steeper version cancelled it exactly and left every division paying the same
 * 35-39% of revenue to run itself.
 */
function generalOverheadShare(reputation: number): number {
  return 0.15 + (reputation / 100) * 0.08
}

export function operatingCosts(state: GameState, club: Club): OperatingCosts {
  const f = club.facilities
  const col = costOfLivingIndex(state, club)

  const squad = club.squad.map((id) => state.players[id]).filter(Boolean)
  const seniorCount = squad.filter((p) => p && !p.isAcademy).length
  const academyCount = squad.length - seniorCount
  const scoutCount = club.staff
    .map((id) => state.staff[id])
    .filter((member) => member?.role === 'scout').length

  // A bigger ground costs more to maintain whether or not anyone sits in it,
  // and a poorly-maintained one costs more per seat, not less: neglect is
  // expensive.
  // Neglect is expensive: a poorly-maintained ground costs more per seat to
  // keep certified, not less.
  const stadiumMaintenance =
    f.stadium.capacity
    * stadiumCostPerSeat(club.reputation)
    * (1.25 - (f.stadium.quality / 100) * 0.45)

  // A tenant pays a commercial rent to its landlord; an owner pays rates and
  // ground charges, which are real but smaller. This is the ongoing cost of
  // not owning your own ground.
  const tenancyFactor = f.stadium.owned ? 1 : 2.4
  const groundRent =
    f.stadium.capacity * groundRentPerSeat(club.reputation) * col * tenancyFactor

  // Training and medical are charged per head, so squad size is a real cost
  // and hoarding twenty-eight professionals is a decision with a price on it.
  // The per-head figure scales with the facility's level — a level-17 training
  // complex costs far more per player to run than a rented pitch.
  const trainingGround = seniorCount * (3 + f.trainingGround * 10) * col
  const youthSetup = academyCount * (6 + f.youthFacilities * 5) * col
  const medical = squad.length * (3 + f.medicalCentre * 4) * col

  // Departments whose cost is about tooling rather than headcount.
  const dataDepartment = f.dataDepartment * (25 + f.dataDepartment * 11) * col
  // Scouting is mostly travel, so it scales with how many scouts are actually
  // out on the road as well as with the network behind them.
  const scoutingNetwork = scoutCount * 90 * col + f.scoutingNetwork * (22 + f.scoutingNetwork * 7)

  // Everyone the squad list does not show: groundstaff, kit, catering, ticket
  // office, admin. Headcount follows the size of the operation; what each one
  // costs follows local wages.
  const supportHeadcount = Math.max(
    2,
    Math.round(
      1
      + f.stadium.capacity / 3500
      + f.trainingGround * 0.5
      + f.youthFacilities * 0.4
      + f.medicalCentre * 0.35
      + f.dataDepartment * 0.3,
    ),
  )
  const supportStaff = supportHeadcount * supportStaffCost(club.reputation) * col

  const generalOverheads = weeklyRevenue(state, club) * generalOverheadShare(club.reputation)

  const total =
    stadiumMaintenance + groundRent + trainingGround + youthSetup + medical
    + dataDepartment + scoutingNetwork + supportStaff + generalOverheads

  return {
    stadiumMaintenance: Math.round(stadiumMaintenance),
    groundRent: Math.round(groundRent),
    trainingGround: Math.round(trainingGround),
    youthSetup: Math.round(youthSetup),
    medical: Math.round(medical),
    dataDepartment: Math.round(dataDepartment),
    scoutingNetwork: Math.round(scoutingNetwork),
    supportStaff: Math.round(supportStaff),
    supportHeadcount,
    generalOverheads: Math.round(generalOverheads),
    total: Math.round(total),
  }
}

/** Total weekly operating cost. Convenience wrapper over `operatingCosts`. */
export function facilityUpkeep(state: GameState, club: Club): number {
  return operatingCosts(state, club).total
}

/** Rough weekly revenue, used for sizing budgets and judging debt. */
export function weeklyRevenue(state: GameState, club: Club): number {
  const league = state.leagues[club.leagueId]
  const tv = league ? league.tvRevenue / 46 : 0
  const sponsor =
    (club.finances.sponsorship.shirtValuePerSeason + club.finances.sponsorship.kitValuePerSeason) / 52
  // Matchday averaged over the season: roughly every other week is at home.
  const matchday =
    (club.facilities.stadium.capacity * (0.4 + club.fanbase / 220)
      * revenuePerHead(club.facilities.stadium)) / 2
  return Math.round(tv + sponsor + matchday)
}

/**
 * The most of its revenue a board will ever commit to wages.
 *
 * Above this a club must sell before it can buy. Set above the squad-cost
 * limit rather than at it, because the limit is measured against income
 * including prize money and player-trading profit, which run-rate revenue
 * does not count.
 */
const WAGE_BUDGET_CEILING = 0.68

/**
 * The share of what is left after running costs that a board puts on wages.
 *
 * The remainder is what the club has to trade with and to keep in reserve, so
 * this is also the number that decides whether transfer fees can move at all.
 * It is deliberately thin. Real clubs fund transfers mostly out of player
 * sales rather than out of profit, which is exactly why they run at about
 * break-even, and a share generous enough to leave a comfortable surplus
 * produced clubs sitting on three times their annual revenue in cash.
 */
const WAGE_BUDGET_SHARE = 0.88

/**
 * Board-set budgets, recalculated at the start of each season and when the
 * club changes division. The board is not generous: it allocates from
 * projected revenue, and it holds a reserve back.
 */
export function recalculateBudgets(state: GameState, club: Club): void {
  const revenue = weeklyRevenue(state, club) * 52
  const currentWages = totalWageBill(state, club) * 52

  // Wage budget: a share of revenue that shrinks as the board's financial
  // caution rises. A board that has just watched you overspend is tighter.
  //
  // The floor used to sit at 90% of the wages already committed, which
  // guaranteed that any club whose bill had drifted above the allowance was
  // permanently over budget and could therefore never sign anybody. Measured
  // after the wage recalibration, that was 8 of 20 top-flight clubs, 11 of 24
  // in the third tier and 17 of 22 in non-league — frozen out of the market,
  // banking every penny they earned. The floor now sits slightly *above*
  // committed wages, so a club can always do some business.
  //
  // The ceiling is the other half of it. A club whose bill has run past
  // WAGE_BUDGET_CEILING of revenue gets no room at all and has to sell before
  // it can buy, which is the pressure the squad-cost rule is meant to create.
  const cautionFactor = 1 - (club.board.expectation.financialImportance / 100) * 0.16
  const weeklyWages = currentWages / 52
  // Budgeted out of what is left after the club's running costs, not as a flat
  // share of turnover. The flat share was internally inconsistent at the
  // bottom of the pyramid, where upkeep alone eats a third of income: 58% for
  // wages plus 34% upkeep plus staff came to more than the club earned, so
  // non-league sides were handed a budget they could never survive spending
  // and ten of twenty-two ended up in financial crisis.
  const runningCosts = facilityUpkeep(state, club) * 52
  const wageAllowance = Math.round(
    (Math.max(0, revenue - runningCosts) * WAGE_BUDGET_SHARE * cautionFactor) / 52,
  )
  const ceiling = Math.round((weeklyRevenue(state, club)) * WAGE_BUDGET_CEILING)
  club.finances.wageBudget = Math.max(
    Math.min(Math.max(Math.round(weeklyWages * 1.05), wageAllowance), ceiling),
    // Never below what is already committed, or the club cannot pay its own
    // players without being told it is overspending.
    Math.round(weeklyWages),
  )

  // Transfer budget: what is left after wages, plus a slice of cash reserves.
  const projectedSurplus = revenue - currentWages - facilityUpkeep(state, club) * 52
  const fromReserves = Math.max(0, club.finances.balance) * 0.35
  let transferBudget = Math.round(Math.max(0, projectedSurplus * 0.55 + fromReserves))

  if (club.finances.inCrisis) transferBudget = 0
  if (club.board.mandates.includes('balanceBooks')) transferBudget = Math.round(transferBudget * 0.5)
  if (club.board.mandates.includes('reduceWageBill')) {
    club.finances.wageBudget = Math.round(club.finances.wageBudget * 0.9)
  }

  club.finances.transferBudget = transferBudget
}

/**
 * Write down a week's share of every transfer fee the club is still carrying.
 *
 * Deliberately not a cash movement. The money left the account the day the
 * player signed; what accrues here is the accounting cost, and the difference
 * between the two is the whole reason a club can be flush with cash and still
 * fail a squad-cost test.
 */
export function accrueAmortisation(state: GameState, club: Club): void {
  let charged = 0
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.bookValue <= 0) continue
    const weekly = Math.min(player.bookValue, player.amortisationCharge / 52)
    player.bookValue -= weekly
    charged += weekly
  }
  if (charged > 0) club.finances.season.amortisation += charged
}

/**
 * Write off whatever is left of a player's fee when he leaves for nothing.
 *
 * A released, retired or expired player still carrying book value is a loss,
 * and it lands in the same season's accounts as everything else.
 */
export function writeOffBookValue(state: GameState, player: Player): void {
  if (player.bookValue <= 0) return
  const club = player.clubId ? state.clubs[player.clubId] : null
  if (club) club.finances.season.amortisation += player.bookValue
  player.bookValue = 0
  player.amortisationCharge = 0
}

/** What the club will write down across a full season, at today's squad. */
export function annualAmortisation(state: GameState, club: Club): number {
  let total = 0
  for (const id of club.squad) {
    const player = state.players[id]
    if (!player || player.bookValue <= 0) continue
    total += Math.min(player.bookValue, player.amortisationCharge)
  }
  return Math.round(total)
}

/**
 * Weeks of turnover a club keeps in hand before paying down debt.
 *
 * Everything above it goes against the borrowing, which is both what a club
 * with a bank covenant actually does and the thing that stops cash piling up
 * with nowhere to go.
 */
const DEBT_BUFFER_WEEKS = 8

/** Prize money and central payments awarded at the end of a season. */
export function awardSeasonPrizeMoney(
  club: Club,
  league: League,
  position: number,
): number {
  const clubCount = Math.max(1, league.clubIds.length)
  const share = clamp(1 - (position - 1) / clubCount, 0, 1)
  const prize = Math.round(
    league.prizeMoneyBottom + (league.prizeMoneyTop - league.prizeMoneyBottom) * share,
  )
  club.finances.balance += prize
  club.finances.season.prizeMoney += prize
  return prize
}

/** Close the season's books and open a fresh ledger. */
export function rollOverLedger(club: Club): FinanceLedger {
  const closed = club.finances.season
  club.finances.lastSeason = closed
  club.finances.season = emptyLedger()
  return closed
}

export function ledgerIncome(ledger: FinanceLedger): number {
  return (
    ledger.matchdayIncome + ledger.tvIncome + ledger.sponsorshipIncome
    + ledger.prizeMoney + ledger.transfersOut + ledger.otherIncome
  )
}

export function ledgerExpenditure(ledger: FinanceLedger): number {
  return (
    ledger.wagesPaid + ledger.staffWages + ledger.transfersIn
    + ledger.facilitiesSpend + ledger.agentFees + ledger.interestPaid + ledger.otherCosts
  )
}

export function ledgerBalance(ledger: FinanceLedger): number {
  return ledgerIncome(ledger) - ledgerExpenditure(ledger)
}

/**
 * Whether a club can afford a signing. Checks both the transfer budget and,
 * critically, the wage budget — most transfers a club cannot do are blocked by
 * wages, not by the fee.
 */
export function canAfford(
  state: GameState,
  club: Club,
  fee: number,
  weeklyWage: number,
): { ok: boolean; reason?: string } {
  if (club.finances.inCrisis) {
    return { ok: false, reason: 'The club is under a transfer embargo.' }
  }
  if (fee > club.finances.transferBudget) {
    return { ok: false, reason: 'The fee exceeds the transfer budget.' }
  }
  const projectedWages = totalWageBill(state, club) + weeklyWage
  if (projectedWages > club.finances.wageBudget) {
    return { ok: false, reason: 'The wages would take the club over its wage budget.' }
  }
  return { ok: true }
}

/** Sponsorship renewal, offered when a deal expires. Scales with standing. */
export function negotiateSponsorship(state: GameState, club: Club, rng: Rng): void {
  const league = state.leagues[club.leagueId]
  const nation = state.nations[club.nationId]
  const base = Math.pow(club.reputation / 100, 2.2) * 14_000_000 * (nation?.economyFactor ?? 1)
  const leagueFactor = league ? 0.5 + (league.reputation / 100) * 0.9 : 0.7
  const formFactor = 0.85 + (club.fanMood / 100) * 0.3

  club.finances.sponsorship.shirtValuePerSeason = Math.round(
    (base * leagueFactor * formFactor * rng.float(0.9, 1.12)) / 1000,
  ) * 1000
  club.finances.sponsorship.kitValuePerSeason = Math.round(
    (base * 0.55 * leagueFactor * rng.float(0.9, 1.12)) / 1000,
  ) * 1000
  club.finances.sponsorship.expiresSeason = state.date.season + rng.int(2, 4)
}

/** Squad wage table used by the finance screen. */
export function wageBreakdown(state: GameState, club: Club): {
  player: Player
  wage: number
  shareOfBudget: number
}[] {
  const budget = Math.max(1, club.finances.wageBudget)
  return club.squad
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && Boolean(p.contract))
    .map((p) => ({
      player: p,
      wage: p.contract!.wage,
      shareOfBudget: p.contract!.wage / budget,
    }))
    .sort((a, b) => b.wage - a.wage)
}
