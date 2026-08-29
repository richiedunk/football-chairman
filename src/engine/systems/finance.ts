import { clamp, Rng } from '../rng'
import { totalWageBill } from './valuation'
import { emptyLedger } from '../world/worldGen'
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
    // Matchday: tickets plus per-head spend on everything else, scaled by how
    // good the ground is.
    const perHead = club.facilities.stadium.ticketPrice
      * (1 + (club.facilities.stadium.quality / 100) * 0.55)
    const gate = Math.round(playedHomeThisWeek.attendance * perHead)
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
    // A player out on loan may be having part of his wage covered elsewhere.
    playerWages += player.loanClubId ? player.contract.wage * 0.5 : player.contract.wage
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
  const upkeep = facilityUpkeep(club)
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
    // Clubs repay debt when they can afford to.
    if (club.finances.balance > club.finances.debt * 0.3) {
      const repayment = Math.round(Math.min(club.finances.debt, club.finances.balance * 0.04))
      club.finances.debt -= repayment
      club.finances.balance -= repayment
    }
  }

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
 * Weekly cost of simply having the facilities the club has.
 *
 * The per-level cost scales with the club's standing, because a level-4
 * training ground at a non-league club is a portakabin and a level-4 training
 * ground at a Premier club is not. A flat rate made upkeep 58% of revenue at
 * the bottom of the pyramid and 2% at the top: every lower-league club bled
 * slowly into a transfer embargo within a season, which blocked the entire
 * recruitment loop from about week ten.
 */
export function facilityUpkeep(club: Club): number {
  const f = club.facilities
  const stadiumCost = f.stadium.capacity * 0.35 * (0.6 + f.stadium.quality / 160)
  const levels =
    f.trainingGround + f.youthFacilities + f.medicalCentre + f.dataDepartment + f.scoutingNetwork
  const costPerLevel = 60 + club.reputation * 11
  return Math.round(stadiumCost + levels * costPerLevel)
}

/** Rough weekly revenue, used for sizing budgets and judging debt. */
export function weeklyRevenue(state: GameState, club: Club): number {
  const league = state.leagues[club.leagueId]
  const tv = league ? league.tvRevenue / 46 : 0
  const sponsor =
    (club.finances.sponsorship.shirtValuePerSeason + club.finances.sponsorship.kitValuePerSeason) / 52
  // Matchday averaged over the season: roughly every other week is at home.
  const matchday =
    (club.facilities.stadium.capacity * (0.4 + club.fanbase / 220) * club.facilities.stadium.ticketPrice) / 2
  return Math.round(tv + sponsor + matchday)
}

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
  const cautionFactor = 1 - (club.board.expectation.financialImportance / 100) * 0.16
  const wageAllowance = Math.round((revenue * 0.6 * cautionFactor) / 52)
  club.finances.wageBudget = Math.max(Math.round(currentWages / 52 * 0.9), wageAllowance)

  // Transfer budget: what is left after wages, plus a slice of cash reserves.
  const projectedSurplus = revenue - currentWages - facilityUpkeep(club) * 52
  const fromReserves = Math.max(0, club.finances.balance) * 0.35
  let transferBudget = Math.round(Math.max(0, projectedSurplus * 0.55 + fromReserves))

  if (club.finances.inCrisis) transferBudget = 0
  if (club.board.mandates.includes('balanceBooks')) transferBudget = Math.round(transferBudget * 0.5)
  if (club.board.mandates.includes('reduceWageBill')) {
    club.finances.wageBudget = Math.round(club.finances.wageBudget * 0.9)
  }

  club.finances.transferBudget = transferBudget
}

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
