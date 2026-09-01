import { describe, expect, it, beforeEach } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { Rng } from '../src/engine/rng'
import { IdFactory } from '../src/engine/ids'
import { executeTransfer, moveAppeal } from '../src/engine/systems/transfers'
import { buildReport, starsForLeague } from '../src/engine/systems/scouting'
import { evaluateRenewal, suggestRenewal } from '../src/engine/systems/contracts'
import { awardXp, CAREER_LEVELS, canTakeJobAt, levelFor, levelProgress } from '../src/engine/systems/career'
import {
  assessFanMood, availableStaff, dismissStaff, hireStaff, updateFanMood,
} from '../src/engine/systems/board'
import {
  contractTermsFor, negotiateContract, payDirectorSalary, signContract,
} from '../src/engine/systems/directorContract'
import { costOfLivingIndex, operatingCosts, weeklyRevenue } from '../src/engine/systems/finance'
import {
  availableRequests, makeRequest, weeksUntilNextRequest,
} from '../src/engine/systems/boardRequests'
import { expectedWage } from '../src/engine/world/staffGen'
import { issueBriefing, checkForExposure } from '../src/engine/systems/media'
import { computeValue, formatMoney, totalWageBill } from '../src/engine/systems/valuation'
import {
  awardContract, baseCost, decayStadium, inviteTenders, progressStadiumWork, revenuePerHead,
  usableCapacity,
} from '../src/engine/systems/stadium'
import { clearRatingCache } from '../src/engine/world/attributes'
import { compress, decompress, MemoryAdapter } from '../src/storage/adapter'
import { loadGame, saveGame, setStorageAdapter } from '../src/storage/saves'
import {
  accrueTrainingYear, isHomegrownFor, isRegisteredFor, NON_HOMEGROWN_LIMIT,
  reconcileRegistration, registerOrDisplace, registerPlayer, registrablePool, squadRegistration,
  SQUAD_LIMIT, U21_AGE, unregisterPlayer,
} from '../src/engine/systems/registration'
import { selectTeam } from '../src/engine/sim/selection'
import {
  EMERGENCY_SQUAD, PATIENCE_WEEKS, processAiRenewals, promoteFromAcademy, runAiSquadManagement,
  seniorSquad,
} from '../src/engine/systems/aiSquad'
import { prepareNewGame, startCareerAt } from '../src/engine/newGame'
import { advanceWeek } from '../src/engine/tick'
import { retirementProbability } from '../src/engine/season'
import {
  achievement, ACHIEVEMENTS, earnedAchievements,
} from '../src/engine/systems/achievements'
import {
  achievements as achievementService, capabilities, purchases, resetReportedAchievements,
} from '../src/platform/services'
import {
  assessClub, assessSquadCost, underEmbargo,
} from '../src/engine/systems/regulation'
import { accrueAmortisation, processFinances } from '../src/engine/systems/finance'
import {
  createOwner, debtTolerance, impatienceFactor, lossCoverage, OWNER_LABELS, reserveRelease,
  wageBudgetShare,
} from '../src/engine/systems/ownership'
import {
  completeTakeover, pitchFit, resolveOwnerPitch, takeoverAppeal,
} from '../src/engine/systems/takeovers'
import { processBoard } from '../src/engine/systems/board'
import {
  deadlineDiscount, generateOpportunities, hoursRemaining, isDeadlineWeek,
  SUMMER_DEADLINE_WEEK, WINTER_DEADLINE_WEEK,
} from '../src/engine/systems/deadlineDay'
import { isTransferWindowOpen } from '../src/engine/sim/schedule'
import { churnCandidatesForTest } from '../src/engine/systems/transfers'
import {
  adjustRelationship, agentFee, agentWillingness, decayRelationships, introductions,
  RELATIONSHIP_EVENTS, STANDING_LABELS, STANDING_NOTES, standingFor,
} from '../src/engine/systems/agents'
import { linkLabel, SCREEN_LABELS } from '../src/ui/screens'
import { simulatedWorld } from './support/simulated'
import type { FinanceLedger } from '../src/engine/types'
import type { GameState } from '../src/engine/types'

function freshWorld(seed = 'SYSTEMS'): GameState {
  // Ids restart at zero for every generated world, so the positional-rating
  // memo would otherwise hand one test's ratings to the next one's players.
  // The app clears it on every attach; the tests have to do the same.
  clearRatingCache()
  const state = generateWorld({
    seed, season: 2025, size: 'compact', homeNationId: 'eng',
    directorName: 'Test Director', background: 'analyst',
  })
  state.playerClubId = Object.values(state.clubs).find((c) => c.reputation < 30)!.id
  return state
}

describe('transfers', () => {
  let state: GameState

  beforeEach(() => {
    state = freshWorld()
  })

  it('moves the player and balances both clubs\' books', () => {
    const clubs = Object.values(state.clubs)
    const seller = clubs[0]
    const buyer = clubs[1]
    const player = state.players[seller.squad.find((id) => !state.players[id].isAcademy)!]

    const fee = 500_000
    const sellerBalanceBefore = seller.finances.balance
    const buyerBalanceBefore = buyer.finances.balance

    executeTransfer(state, { rng: new Rng('t'), ids: new IdFactory(9000) }, {
      player, buyer, seller, fee, kind: 'permanent',
      contract: {
        wage: 5000, expiresSeason: 2029, signingBonus: 0, releaseClause: null,
        appearanceFee: 0, goalBonus: 0, loyaltyBonus: 0,
        inNegotiation: false, weeksSinceRenewalRequest: 0,
      },
      agentFee: 0, sellOnPercentage: 0, wageContribution: 0, loanUntilSeason: null,
    })

    expect(player.clubId).toBe(buyer.id)
    expect(buyer.squad).toContain(player.id)
    expect(seller.squad).not.toContain(player.id)
    expect(seller.finances.balance).toBe(sellerBalanceBefore + fee)
    expect(buyer.finances.balance).toBe(buyerBalanceBefore - fee)
    expect(state.completedTransfers[0].playerId).toBe(player.id)
  })

  it('honours a sell-on clause owed to a previous club', () => {
    const clubs = Object.values(state.clubs)
    const [original, seller, buyer] = clubs
    const player = state.players[seller.squad.find((id) => !state.players[id].isAcademy)!]
    player.sellOnClauseOwed = [{ clubId: original.id, percentage: 0.2 }]

    const fee = 1_000_000
    const originalBefore = original.finances.balance
    const sellerBefore = seller.finances.balance

    executeTransfer(state, { rng: new Rng('t'), ids: new IdFactory(9000) }, {
      player, buyer, seller, fee, kind: 'permanent',
      contract: {
        wage: 5000, expiresSeason: 2029, signingBonus: 0, releaseClause: null,
        appearanceFee: 0, goalBonus: 0, loyaltyBonus: 0,
        inNegotiation: false, weeksSinceRenewalRequest: 0,
      },
      agentFee: 0, sellOnPercentage: 0, wageContribution: 0, loanUntilSeason: null,
    })

    expect(original.finances.balance).toBe(originalBefore + 200_000)
    expect(seller.finances.balance).toBe(sellerBefore + 800_000)
  })

  it('makes a step up more attractive, holding everything else equal', () => {
    // Comparing two different clubs would confound reputation with squad
    // competition — a player is rightly unenthusiastic about joining a giant
    // as fourth choice. Mutating one club's standing isolates the variable.
    const clubs = Object.values(state.clubs)
    const buyer = clubs[0]
    const original = buyer.reputation

    // Appeal is clamped at zero, and a player who would be sixth choice in his
    // position is pinned to the floor whatever the club's standing. Comparing
    // two clamped values proves nothing, so the subject is the first player
    // for whom the unattractive case is still above the floor.
    const subject = clubs
      .slice(3, 12)
      .flatMap((c) => c.squad.map((id) => state.players[id]))
      .filter((p) => p && !p.isAcademy)
      .find((p) => {
        buyer.reputation = 20
        return moveAppeal(state, p, buyer) > 0
      })
    buyer.reputation = original
    expect(subject, 'no unclamped subject in this world').toBeTruthy()

    buyer.reputation = 20
    const lowly = moveAppeal(state, subject!, buyer)
    buyer.reputation = 90
    const prestigious = moveAppeal(state, subject!, buyer)
    buyer.reputation = original

    expect(prestigious).toBeGreaterThan(lowly)
  })

  it('makes a club in financial crisis less attractive', () => {
    const clubs = Object.values(state.clubs)
    const buyer = clubs[0]
    const player = state.players[clubs[5].squad.find((id) => !state.players[id].isAcademy)!]

    const healthy = moveAppeal(state, player, buyer)
    buyer.finances.inCrisis = true
    const troubled = moveAppeal(state, player, buyer)
    buyer.finances.inCrisis = false

    expect(troubled).toBeLessThan(healthy)
  })
})

describe('scouting', () => {
  it('narrows its estimate as knowledge grows', () => {
    const state = freshWorld('SCOUT')
    const club = state.clubs[state.playerClubId!]
    const scout = Object.values(state.staff).find((s) => s.role === 'scout')!
    const target = Object.values(state.players).find(
      (p) => p.clubId && p.clubId !== club.id && !p.isAcademy,
    )!
    const ctx = { rng: new Rng('report'), week: 10, season: 2025 }

    const early = buildReport(state, club, scout, target, 5, ctx, 10)
    const late = buildReport(state, club, scout, target, 100, ctx, 10)

    const earlyWidth = early.abilityRange[1] - early.abilityRange[0]
    const lateWidth = late.abilityRange[1] - late.abilityRange[0]
    expect(lateWidth).toBeLessThan(earlyWidth)
    // Even complete knowledge stays a range: certainty would remove the risk
    // that makes recruitment a decision.
    expect(lateWidth).toBeGreaterThan(0)
  })

  it('brackets the truth once knowledge is complete', () => {
    const state = freshWorld('SCOUT2')
    const club = state.clubs[state.playerClubId!]
    const scout = Object.values(state.staff).find((s) => s.role === 'scout')!
    scout.attributes.judgingAbility = 95
    const ctx = { rng: new Rng('bracket'), week: 10, season: 2025 }

    const candidates = Object.values(state.players)
      .filter((p) => p.clubId && p.clubId !== club.id && !p.isAcademy)
      .slice(0, 120)

    let bracketed = 0
    for (const target of candidates) {
      const report = buildReport(state, club, scout, target, 100, ctx, 20)
      if (
        target.currentAbility >= report.abilityRange[0]
        && target.currentAbility <= report.abilityRange[1]
      ) bracketed++
    }
    // A good scout with full knowledge should be right about the great
    // majority of players, and wrong about a few. Both matter.
    expect(bracketed / candidates.length).toBeGreaterThan(0.75)
  })

  it('rates the same ability differently by division', () => {
    // 130 is a star in the fifth tier and a squad player in the first; a star
    // rating that ignored context would be actively misleading.
    expect(starsForLeague(130, 20)).toBeGreaterThan(starsForLeague(130, 82))
  })

  it('gives a worse scout a wider range', () => {
    const state = freshWorld('SCOUT3')
    const club = state.clubs[state.playerClubId!]
    const scouts = Object.values(state.staff).filter((s) => s.role === 'scout')
    const good = { ...scouts[0], attributes: { ...scouts[0].attributes, judgingAbility: 95 } }
    const poor = { ...scouts[0], attributes: { ...scouts[0].attributes, judgingAbility: 15 } }
    const target = Object.values(state.players).find((p) => p.clubId !== club.id && !p.isAcademy)!
    const ctx = { rng: new Rng('quality'), week: 1, season: 2025 }

    const goodReport = buildReport(state, club, good, target, 60, ctx, 10)
    const poorReport = buildReport(state, club, poor, target, 60, ctx, 10)
    expect(goodReport.abilityRange[1] - goodReport.abilityRange[0])
      .toBeLessThan(poorReport.abilityRange[1] - poorReport.abilityRange[0])
  })
})

describe('contracts', () => {
  it('accepts a fair offer and rejects a derisory one', () => {
    const state = freshWorld('CONTRACT')
    const club = state.clubs[state.playerClubId!]
    const player = state.players[club.squad.find((id) => !state.players[id].isAcademy)!]
    const rng = new Rng('renewal')

    const fair = suggestRenewal(state, club, player)
    fair.wage = Math.round(player.wageDemand * 1.4)
    expect(evaluateRenewal(state, club, player, fair, rng).accepted).toBe(true)

    const insulting = { ...fair, wage: Math.round(player.wageDemand * 0.3) }
    const response = evaluateRenewal(state, club, player, insulting, rng)
    expect(response.accepted).toBe(false)
    expect(response.counter).toBeDefined()
  })

  it('collapses a player\'s value as his contract runs down', () => {
    const state = freshWorld('EXPIRY')
    const club = state.clubs[state.playerClubId!]
    const league = state.leagues[club.leagueId]
    const nation = state.nations[club.nationId]
    const player = state.players[club.squad.find((id) => !state.players[id].isAcademy)!]

    player.contract!.expiresSeason = 2029
    const longDeal = computeValue(player, league, nation, 2025)
    player.contract!.expiresSeason = 2026
    const oneYearLeft = computeValue(player, league, nation, 2025)
    player.contract!.expiresSeason = 2025
    const expiring = computeValue(player, league, nation, 2025)

    expect(oneYearLeft).toBeLessThan(longDeal)
    expect(expiring).toBeLessThan(oneYearLeft)
  })
})

describe('career progression', () => {
  it('gates clubs by level', () => {
    const state = freshWorld('CAREER')
    const bigClub = Object.values(state.clubs).sort((a, b) => b.reputation - a.reputation)[0]
    expect(canTakeJobAt(state.director, bigClub)).toBe(false)

    state.director.xp = CAREER_LEVELS[CAREER_LEVELS.length - 1].xpRequired
    state.director.level = levelFor(state.director.xp).level
    expect(canTakeJobAt(state.director, bigClub)).toBe(true)
  })

  it('advances level as XP accumulates', () => {
    const state = freshWorld('XP')
    expect(levelFor(state.director.xp).level).toBe(1)
    awardXp(state.director, CAREER_LEVELS[1].xpRequired, 'test', 'results', 2025, 1)
    expect(state.director.level).toBe(2)
    expect(levelProgress(state.director.xp)).toBeGreaterThanOrEqual(0)
    expect(levelProgress(state.director.xp)).toBeLessThanOrEqual(1)
  })

  it('applies the XP multiplier that a purchasable boost would set', () => {
    const state = freshWorld('BOOST')
    state.director.xpMultiplier = 2
    awardXp(state.director, 100, 'test', 'results', 2025, 1)
    expect(state.director.xp).toBe(200)
  })

  it('records an itemised log for the season review', () => {
    const state = freshWorld('LOG')
    awardXp(state.director, 50, 'Finished above expectation', 'results', 2025, 40)
    awardXp(state.director, 30, 'Academy graduate established', 'youth', 2025, 40)
    expect(state.director.xpLog).toHaveLength(2)
    expect(state.director.xpThisSeason).toBe(80)
  })
})

describe('media', () => {
  it('charges credibility for fabricating, and more when exposed', () => {
    const state = freshWorld('MEDIA')
    const outlet = Object.values(state.outlets)[0]
    outlet.sensationalism = 99
    outlet.credibility = 90
    const target = Object.values(state.players).find(
      (p) => p.clubId && p.clubId !== state.playerClubId,
    )!
    const ctx = { rng: new Rng('media'), ids: new IdFactory(9000) }

    const before = state.mediaStanding.credibility
    state.mediaStanding.lastBriefingWeek = -10
    issueBriefing(state, ctx, {
      kind: 'transferLink', targetPlayerId: target.id, outletId: outlet.id,
      truth: 'fabricated', intensity: 90,
    })
    expect(state.mediaStanding.credibility).toBeLessThan(before)
    expect(state.mediaStanding.fabricationsPlanted).toBe(1)

    // Exposure is probabilistic; force it by running many weeks of checks.
    const afterPlanting = state.mediaStanding.credibility
    for (let i = 0; i < 200 && state.mediaStanding.fabricationsExposed === 0; i++) {
      checkForExposure(state, { rng: new Rng(`expose${i}`), ids: ctx.ids })
    }
    if (state.mediaStanding.fabricationsExposed > 0) {
      expect(state.mediaStanding.credibility).toBeLessThan(afterPlanting)
    }
  })

  it('rate-limits briefings so spin cannot be spammed', () => {
    const state = freshWorld('SPAM')
    const outlet = Object.values(state.outlets)[0]
    const ctx = { rng: new Rng('spam'), ids: new IdFactory(9000) }
    state.date.week = 10
    state.mediaStanding.lastBriefingWeek = 10

    const result = issueBriefing(state, ctx, {
      kind: 'boardBacking', outletId: outlet.id, truth: 'true', intensity: 50,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too recently')
  })
})

describe('persistence', () => {
  beforeEach(() => {
    setStorageAdapter(new MemoryAdapter())
  })

  it('compresses and restores a save byte for byte', async () => {
    const state = freshWorld('SAVE')
    const json = JSON.stringify(state)
    const packed = await compress(json)
    expect(packed.length).toBeLessThan(json.length)
    expect(await decompress(packed)).toBe(json)
  })

  it('round-trips a game through storage', async () => {
    const state = freshWorld('ROUNDTRIP')
    await saveGame(state, 'slot1', 'Test save')
    const loaded = await loadGame('slot1')

    expect(loaded).not.toBeNull()
    expect(loaded!.seed).toBe(state.seed)
    expect(loaded!.playerClubId).toBe(state.playerClubId)
    expect(Object.keys(loaded!.players).length).toBe(Object.keys(state.players).length)
    expect(loaded!.clubs[loaded!.playerClubId!].name).toBe(state.clubs[state.playerClubId!].name)
  })

  it('refuses a save written by a newer build rather than corrupting it', async () => {
    const state = freshWorld('VERSION')
    state.version = 999
    await saveGame(state, 'future')
    await expect(loadGame('future')).rejects.toThrow(/newer version/)
  })
})

describe('formatting', () => {
  it('formats money the way a phone screen needs', () => {
    expect(formatMoney(0)).toBe('£0')
    expect(formatMoney(999)).toBe('£999')
    expect(formatMoney(12_500)).toBe('£13k')
    expect(formatMoney(1_500_000)).toBe('£1.5m')
    expect(formatMoney(45_000_000)).toBe('£45m')
    expect(formatMoney(-2_000_000)).toBe('-£2.0m')
    expect(formatMoney(1_000_000, 'EUR')).toBe('€1.0m')
  })

  it('sums a wage bill across players and staff', () => {
    const state = freshWorld('WAGES')
    const club = state.clubs[state.playerClubId!]
    const total = totalWageBill(state, club)
    const players = club.squad.reduce(
      (sum, id) => sum + (state.players[id]?.contract?.wage ?? 0), 0,
    )
    expect(total).toBeGreaterThanOrEqual(players)
  })
})

describe('staff hiring', () => {
  it('generates a pool of unattached staff to hire from', () => {
    const state = freshWorld('HIRING')
    const unemployed = Object.values(state.staff).filter((s) => s.clubId === null)
    // Without this pool every hiring screen in the game is empty, and the
    // scouting screen's advice to hire a scout is impossible to follow.
    expect(unemployed.length).toBeGreaterThan(50)
    const roles = new Set(unemployed.map((s) => s.role))
    expect(roles.has('headCoach')).toBe(true)
    expect(roles.has('scout')).toBe(true)
    expect(roles.has('physio')).toBe(true)
  })

  it('offers every club at least one candidate for each role', () => {
    const state = freshWorld('HIRING2')
    const club = state.clubs[state.playerClubId!]
    for (const role of ['headCoach', 'scout', 'physio', 'analyst'] as const) {
      expect(
        availableStaff(state, club, role).length,
        `no ${role} available to ${club.name} (reputation ${club.reputation})`,
      ).toBeGreaterThan(0)
    }
  })

  it('hires a scout and adds him to the wage bill', () => {
    const state = freshWorld('HIRING3')
    const club = state.clubs[state.playerClubId!]
    const before = totalWageBill(state, club)
    const candidate = availableStaff(state, club, 'scout')[0]

    const result = hireStaff(state, club, candidate, expectedWage(candidate), 2)
    expect(result.ok).toBe(true)
    expect(candidate.clubId).toBe(club.id)
    expect(club.staff).toContain(candidate.id)
    expect(totalWageBill(state, club)).toBeGreaterThan(before)
  })

  it('refuses a lowball offer and a club that is too small', () => {
    const state = freshWorld('HIRING4')
    const club = state.clubs[state.playerClubId!]
    const candidate = availableStaff(state, club, 'scout')[0]

    const lowball = hireStaff(state, club, candidate, 1, 2)
    expect(lowball.ok).toBe(false)

    const elite = Object.values(state.staff).find(
      (s) => s.clubId === null && s.role === 'scout' && s.reputation > club.reputation + 30,
    )
    if (elite) expect(hireStaff(state, club, elite, expectedWage(elite), 2).ok).toBe(false)
  })

  it('dismisses a staff member and pays up their contract', () => {
    const state = freshWorld('HIRING5')
    const club = state.clubs[state.playerClubId!]
    club.finances.balance = 5_000_000
    const scout = club.staff.map((id) => state.staff[id]).find((s) => s.role === 'scout')!

    const before = club.finances.balance
    const result = dismissStaff(state, club, scout)
    expect(result.ok).toBe(true)
    expect(scout.clubId).toBeNull()
    expect(club.staff).not.toContain(scout.id)
    expect(club.finances.balance).toBeLessThan(before)
  })

  it('will not let the head coach be dismissed without a replacement', () => {
    const state = freshWorld('HIRING6')
    const club = state.clubs[state.playerClubId!]
    const coach = state.staff[club.headCoachId!]
    const result = dismissStaff(state, club, coach)
    expect(result.ok).toBe(false)
  })
})

describe('director contract and earnings', () => {
  it('scales what a club will pay by its size and your record', () => {
    const state = freshWorld('SALARY')
    const clubs = Object.values(state.clubs).sort((a, b) => b.reputation - a.reputation)
    const big = clubs[0]
    const small = clubs[clubs.length - 1]

    const bigTerms = contractTermsFor(state, big, state.director)
    const smallTerms = contractTermsFor(state, small, state.director)
    expect(bigTerms.ceiling.salary).toBeGreaterThan(smallTerms.ceiling.salary * 5)

    // A better record commands more at the same club.
    const unproven = contractTermsFor(state, big, state.director).ceiling.salary
    state.director.xp = CAREER_LEVELS[CAREER_LEVELS.length - 1].xpRequired
    const proven = contractTermsFor(state, big, state.director).ceiling.salary
    expect(proven).toBeGreaterThan(unproven)
  })

  it('refuses a package with every term at the ceiling', () => {
    const state = freshWorld('GREEDY')
    const club = state.clubs[state.playerClubId!]
    const { ceiling } = contractTermsFor(state, club, state.director)
    const result = negotiateContract(state, club, state.director, {
      ...ceiling, seasons: 5,
    }, new Rng('greedy'))
    expect(result.accepted).toBe(false)
    expect(result.counter).toBeDefined()
  })

  it('always makes a counter it will actually accept', () => {
    // A counter that would itself be refused traps the player in a loop with
    // no route to agreement. Checked across clubs, levels and rolls because
    // the tolerance carries noise.
    const state = freshWorld('COUNTER')
    let tested = 0

    for (const club of Object.values(state.clubs).slice(0, 25)) {
      for (const level of [1, 5, 10]) {
        state.director.xp = CAREER_LEVELS[level - 1].xpRequired
        const { ceiling } = contractTermsFor(state, club, state.director)
        const greedy = {
          salary: ceiling.salary * 2,
          seasons: 5,
          signingBonus: ceiling.signingBonus * 2,
          promotionBonus: ceiling.promotionBonus * 2,
          trophyBonus: ceiling.trophyBonus * 2,
          targetBonus: ceiling.targetBonus * 2,
          severanceWeeks: 52,
        }
        const refused = negotiateContract(state, club, state.director, greedy, new Rng('g'))
        expect(refused.accepted).toBe(false)

        for (let roll = 0; roll < 5; roll++) {
          tested++
          const outcome = negotiateContract(
            state, club, state.director, refused.counter!, new Rng(`c${club.id}${level}${roll}`),
          )
          expect(outcome.accepted, `counter refused at ${club.name}, level ${level}`).toBe(true)
        }
      }
    }
    expect(tested).toBeGreaterThan(300)
  })

  it('pays salary from the club and adds it to career earnings', () => {
    const state = freshWorld('PAY')
    const club = state.clubs[state.playerClubId!]
    signContract(state, club, contractTermsFor(state, club, state.director).opening)

    const clubBefore = club.finances.balance
    const earningsBefore = state.director.careerEarnings
    payDirectorSalary(state, club)

    const salary = state.director.contract!.salary
    expect(club.finances.balance).toBe(clubBefore - salary)
    expect(state.director.careerEarnings).toBe(earningsBefore + salary)
    // The director is part of the wage bill he is asked to control.
    expect(club.finances.season.staffWages).toBeGreaterThanOrEqual(salary)
  })
})

describe('fan mood', () => {
  it('settles rather than decaying when nothing changes', () => {
    // The previous model nudged mood on every result with nothing anchoring
    // it, so every club in the world sank over a season.
    const state = freshWorld('MOOD')
    const club = state.clubs[state.playerClubId!]
    const { target } = assessFanMood(state, club)

    club.fanMood = target
    for (let week = 0; week < 60; week++) updateFanMood(state, club)
    expect(Math.abs(club.fanMood - target)).toBeLessThan(1)
  })

  it('converges on the assessed target from either direction', () => {
    const state = freshWorld('CONVERGE')
    const club = state.clubs[state.playerClubId!]
    const { target } = assessFanMood(state, club)

    for (const start of [1, 100]) {
      club.fanMood = start
      for (let week = 0; week < 80; week++) updateFanMood(state, club)
      expect(Math.abs(club.fanMood - target)).toBeLessThan(1.5)
    }
  })

  it('explains itself', () => {
    const state = freshWorld('EXPLAIN')
    const club = state.clubs[state.playerClubId!]
    club.finances.inCrisis = true
    const { factors } = assessFanMood(state, club)
    expect(factors.some((f) => f.label.includes('crisis'))).toBe(true)
    club.finances.inCrisis = false
  })
})

describe('operating costs', () => {
  it('itemises every cost and the parts sum to the total', () => {
    const state = freshWorld('COSTS')
    const club = state.clubs[state.playerClubId!]
    const costs = operatingCosts(state, club)

    const parts =
      costs.stadiumMaintenance + costs.groundRent + costs.trainingGround
      + costs.youthSetup + costs.medical + costs.dataDepartment
      + costs.scoutingNetwork + costs.supportStaff + costs.generalOverheads
    // Rounding of each line can differ from rounding the sum by a pound or two.
    expect(Math.abs(parts - costs.total)).toBeLessThanOrEqual(8)
    expect(costs.supportHeadcount).toBeGreaterThanOrEqual(2)
  })

  it('charges training and medical per player', () => {
    const state = freshWorld('PERPLAYER')
    const club = state.clubs[state.playerClubId!]
    const before = operatingCosts(state, club)

    // Remove five players and the per-head costs must fall.
    const removed = club.squad.slice(0, 5)
    club.squad = club.squad.filter((id) => !removed.includes(id))
    const after = operatingCosts(state, club)

    expect(after.trainingGround + after.medical)
      .toBeLessThan(before.trainingGround + before.medical)
  })

  it('charges more where the cost of living is higher', () => {
    const state = freshWorld('COL')
    const clubs = Object.values(state.clubs)
    const indices = clubs.map((c) => costOfLivingIndex(state, c))
    expect(Math.max(...indices)).toBeGreaterThan(Math.min(...indices) * 1.2)

    // Same club, relocated to a bigger city, costs more to run.
    const club = clubs[0]
    const nation = state.nations[club.nationId]
    const smallCity = nation.cities.slice().sort((a, b) => a.size - b.size)[0]
    const bigCity = nation.cities.slice().sort((a, b) => b.size - a.size)[0]

    const original = club.city
    club.city = smallCity.name
    const cheap = operatingCosts(state, club).groundRent
    club.city = bigCity.name
    const dear = operatingCosts(state, club).groundRent
    club.city = original

    expect(dear).toBeGreaterThan(cheap)
  })

  it('keeps the cost ratio worse for small clubs and larger in absolute terms for big ones', () => {
    const state = freshWorld('RATIO')
    const clubs = Object.values(state.clubs).sort((a, b) => b.reputation - a.reputation)
    const big = clubs[0]
    const small = clubs[clubs.length - 1]

    const bigCosts = operatingCosts(state, big).total
    const smallCosts = operatingCosts(state, small).total
    expect(bigCosts).toBeGreaterThan(smallCosts)

    const bigRatio = bigCosts / weeklyRevenue(state, big)
    const smallRatio = smallCosts / weeklyRevenue(state, small)
    expect(smallRatio).toBeGreaterThan(bigRatio)
    // And neither end is absurd.
    expect(bigRatio).toBeLessThan(0.42)
    expect(smallRatio).toBeLessThan(0.75)
  })
})

describe('board requests', () => {
  it('offers every request with a reason when it is unavailable', () => {
    const state = freshWorld('REQUESTS')
    const club = state.clubs[state.playerClubId!]
    const options = availableRequests(state, club)

    expect(options.length).toBeGreaterThan(5)
    for (const option of options) {
      // An unavailable option must say why. Hiding it would make the board
      // screen look like it changes at random.
      if (!option.available) expect(option.unavailableReason).toBeTruthy()
    }
  })

  it('rate-limits requests so asking is a decision', () => {
    const state = freshWorld('COOLDOWN')
    const club = state.clubs[state.playerClubId!]
    state.date.week = 20
    club.board.confidence = 95

    // Which requests a board will even hear depends on the club, so the test
    // asks for the first thing this one is willing to discuss. Asking for
    // something unavailable is refused without starting a cooldown, which
    // would make this test about the wrong thing.
    const kind = availableRequests(state, club).find((o) => o.available)?.kind
    expect(kind, 'this board will not discuss anything at all').toBeTruthy()

    makeRequest(state, club, kind!, new Rng('a'), 1000)
    expect(weeksUntilNextRequest(state, club)).toBeGreaterThan(0)

    const second = makeRequest(state, club, kind!, new Rng('b'), 1000)
    expect(second.outcome).toBe('refused')
    expect(second.message).toContain('not entertain')
  })

  it('grants more readily to a board that trusts you', () => {
    const trusting = freshWorld('TRUST')
    const wary = freshWorld('TRUST')

    let granted = 0
    let refused = 0
    for (let i = 0; i < 60; i++) {
      const club = trusting.clubs[trusting.playerClubId!]
      club.board.confidence = 95
      club.board.lastRequestWeek = -99
      club.board.requestsThisSeason = 0
      club.finances.balance = 5_000_000
      if (makeRequest(trusting, club, 'transferFunds', new Rng(`t${i}`), 100_000).outcome !== 'refused') {
        granted++
      }

      const cold = wary.clubs[wary.playerClubId!]
      cold.board.confidence = 12
      cold.board.lastRequestWeek = -99
      cold.board.requestsThisSeason = 0
      cold.finances.balance = 5_000_000
      if (makeRequest(wary, cold, 'transferFunds', new Rng(`w${i}`), 100_000).outcome === 'refused') {
        refused++
      }
    }
    expect(granted).toBeGreaterThan(30)
    expect(refused).toBeGreaterThan(30)
  })

  it('costs confidence when refused', () => {
    const state = freshWorld('COST')
    const club = state.clubs[state.playerClubId!]
    club.board.confidence = 5
    club.board.lastRequestWeek = -99
    const before = club.board.confidence

    // Pick something the board will actually hear, or the request is turned
    // away before it costs anything and the test proves nothing.
    const option = availableRequests(state, club).find((o) => o.available && o.risk === 'high')
    expect(option, 'no high-risk request was available to test with').toBeTruthy()

    const response = makeRequest(state, club, option!.kind, new Rng('refuse'))
    if (response.outcome === 'refused') {
      expect(club.board.confidence).toBeLessThan(before)
      expect(response.confidenceChange).toBeLessThan(0)
    }
  })

  it('actually moves the thing it granted', () => {
    const state = freshWorld('GRANT')
    const club = state.clubs[state.playerClubId!]
    club.board.confidence = 100
    club.finances.balance = 10_000_000
    club.finances.inCrisis = false

    // Try until one lands; each attempt resets the cooldown.
    let granted = false
    const budgetBefore = club.finances.transferBudget
    for (let i = 0; i < 40 && !granted; i++) {
      club.board.lastRequestWeek = -99
      club.board.requestsThisSeason = 0
      const response = makeRequest(state, club, 'transferFunds', new Rng(`g${i}`), 200_000)
      if (response.outcome !== 'refused') {
        granted = true
        expect(response.amount).toBeGreaterThan(0)
        expect(club.finances.transferBudget).toBeGreaterThan(budgetBefore)
      }
    }
    expect(granted, 'a board on full confidence never granted anything').toBe(true)
  })

  it('will not lower an expectation that is already survival', () => {
    const state = freshWorld('SURVIVAL')
    const club = state.clubs[state.playerClubId!]
    const clubCount = state.leagues[club.leagueId].clubIds.length
    club.board.expectation.leaguePosition = clubCount
    club.board.lastRequestWeek = -99

    const option = availableRequests(state, club).find((o) => o.kind === 'lowerExpectation')!
    expect(option.available).toBe(false)
  })
})

describe('stadium', () => {
  it('builds grounds stand by stand, with condition following age', () => {
    const state = freshWorld('STANDS')
    for (const club of Object.values(state.clubs)) {
      const stadium = club.facilities.stadium
      expect(stadium.stands.length).toBe(4)

      const built = stadium.stands.reduce((sum, s) => sum + s.capacity, 0)
      expect(built).toBeGreaterThan(0)
      // The cached capacity must agree with the stands it is derived from.
      expect(stadium.capacity).toBe(usableCapacity(stadium, club.facilities.stadiumProject))

      for (const stand of stadium.stands) {
        expect(stand.builtYear).toBeLessThan(state.date.season)
        expect(stand.condition).toBeGreaterThan(0)
        expect(stand.closedSeats).toBe(0)
      }
    }

    // Across the world, newer stands should be in better condition than old
    // ones — otherwise a stand built five years ago can generate derelict.
    const all = Object.values(state.clubs).flatMap((c) => c.facilities.stadium.stands)
    const recent = all.filter((s) => state.date.season - s.builtYear < 12)
    const ancient = all.filter((s) => state.date.season - s.builtYear > 55)
    const mean = (list: typeof all) => list.reduce((sum, s) => sum + s.condition, 0) / list.length
    expect(mean(recent)).toBeGreaterThan(mean(ancient) + 10)
  })

  it('values a covered seat above a terrace place, and a box above both', () => {
    const state = freshWorld('PERHEAD')
    const club = state.clubs[state.playerClubId!]
    const stadium = club.facilities.stadium

    for (const stand of stadium.stands) {
      stand.type = 'terrace'
      stand.hospitalityBoxes = 0
      stand.condition = 70
    }
    const terraced = revenuePerHead(stadium)

    for (const stand of stadium.stands) stand.type = 'coveredSeated'
    const covered = revenuePerHead(stadium)
    expect(covered).toBeGreaterThan(terraced)

    stadium.stands[0].hospitalityBoxes = 40
    expect(revenuePerHead(stadium)).toBeGreaterThan(covered)
  })

  it('closes places when a stand is left to rot, and reopens them on repair', () => {
    const state = freshWorld('SAFETY')
    const club = state.clubs[state.playerClubId!]
    const stand = club.facilities.stadium.stands[0]
    stand.condition = 12

    // The safety officer acts probabilistically; run enough weeks to be sure.
    let closed = 0
    for (let week = 0; week < 400 && closed === 0; week++) {
      decayStadium(state, club, new Rng(`safety${week}`))
      closed = stand.closedSeats
    }
    expect(closed, 'a condemned stand was never closed').toBeGreaterThan(0)
    expect(club.facilities.stadium.capacity).toBeLessThan(
      club.facilities.stadium.stands.reduce((sum, s) => sum + s.capacity, 0),
    )
  })

  it('prices repairs sensibly relative to the club', () => {
    const state = freshWorld('PRICING')
    for (const club of Object.values(state.clubs).slice(0, 40)) {
      const stand = club.facilities.stadium.stands[0]
      stand.condition = 35
      const cost = baseCost(state, club, { kind: 'repair', standId: stand.id })
      const annualRevenue = weeklyRevenue(state, club) * 52
      // Repairing one stand should be a real expense but never more than a
      // club's entire yearly income — an earlier version quoted £208,000 to
      // repair an 850-place non-league terrace.
      expect(cost).toBeGreaterThan(0)
      expect(cost, `${club.name} repair cost`).toBeLessThan(annualRevenue)
    }
  })

  it('gives every club firms willing to quote for repairs', () => {
    const state = freshWorld('PANEL')
    for (const club of Object.values(state.clubs).slice(0, 30)) {
      const stand = club.facilities.stadium.stands[0]
      const bids = inviteTenders(state, club, { kind: 'repair', standId: stand.id })
      const willing = bids.filter((b) => b.available)
      expect(
        willing.length,
        `nobody would quote for repairs at ${club.name} (reputation ${club.reputation})`,
      ).toBeGreaterThan(0)
    }
  })

  it('produces a spread of quotes rather than one rounded figure', () => {
    const state = freshWorld('SPREAD')
    const club = state.clubs[state.playerClubId!]
    const stand = club.facilities.stadium.stands[0]
    stand.condition = 40

    const bids = inviteTenders(state, club, { kind: 'repair', standId: stand.id })
      .filter((b) => b.available)
    const distinctCosts = new Set(bids.map((b) => b.cost))
    const distinctWeeks = new Set(bids.map((b) => b.weeks))
    // A flat rounding step once made every cheap firm quote exactly the same,
    // which removed the point of comparing them.
    expect(distinctCosts.size).toBeGreaterThan(3)
    expect(distinctWeeks.size).toBeGreaterThan(2)
  })

  it('completes a repair, restoring condition and reopening closed places', () => {
    const state = freshWorld('REPAIR')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = true
    club.finances.balance = 50_000_000
    const stand = club.facilities.stadium.stands[0]
    stand.condition = 30
    stand.closedSeats = 200

    const spec = { kind: 'repair' as const, standId: stand.id }
    const bid = inviteTenders(state, club, spec).find((b) => b.available)!
    const award = awardContract(state, club, new IdFactory(90_000), spec, bid.architectId)
    expect(award.ok, award.message).toBe(true)
    expect(club.facilities.stadiumProject).toBeTruthy()

    for (let week = 0; week < 200 && club.facilities.stadiumProject; week++) {
      progressStadiumWork(state, club, new Rng(`build${week}`))
    }
    expect(club.facilities.stadiumProject).toBeNull()
    expect(stand.condition).toBeGreaterThan(80)
    expect(stand.closedSeats).toBe(0)
  })

  it('refuses a second project while one is running', () => {
    const state = freshWorld('ONEATATIME')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = true
    club.finances.balance = 50_000_000
    const spec = { kind: 'repair' as const, standId: club.facilities.stadium.stands[0].id }
    const bids = inviteTenders(state, club, spec).filter((b) => b.available)

    expect(awardContract(state, club, new IdFactory(91_000), spec, bids[0].architectId).ok).toBe(true)
    const second = awardContract(state, club, new IdFactory(92_000), spec, bids[1].architectId)
    expect(second.ok).toBe(false)
    expect(second.message).toContain('already')
  })

  it('lets a tenant maintain its ground but not alter it', () => {
    const state = freshWorld('TENANT')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = false
    club.finances.balance = 50_000_000
    const standId = club.facilities.stadium.stands[0].id

    // Repairs are always allowed: a landlord permits maintenance, and
    // forbidding it created a dead end where safety closures piled up with no
    // remedy short of a move the club could never afford.
    const repairSpec = { kind: 'repair' as const, standId }
    const repairBid = inviteTenders(state, club, repairSpec).find((b) => b.available)!
    expect(awardContract(state, club, new IdFactory(93_000), repairSpec, repairBid.architectId).ok)
      .toBe(true)
    club.facilities.stadiumProject = null

    // Altering somebody else's property is not.
    const expandSpec = { kind: 'expand' as const, standId, capacity: 2000 }
    const expandBid = inviteTenders(state, club, expandSpec).find((b) => b.available)!
    const expand = awardContract(state, club, new IdFactory(93_500), expandSpec, expandBid.architectId)
    expect(expand.ok).toBe(false)
    expect(expand.message).toContain('does not own')
  })

  it('charges a tenant more in ground rent than an owner', () => {
    const state = freshWorld('RENT')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = true
    const owned = operatingCosts(state, club).groundRent
    club.facilities.stadium.owned = false
    const rented = operatingCosts(state, club).groundRent
    expect(rented).toBeGreaterThan(owned)
  })

  it('lets a club borrow for work it could never pay for in cash', () => {
    const state = freshWorld('BORROW')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = true
    club.finances.balance = 1000
    const spec = { kind: 'repair' as const, standId: club.facilities.stadium.stands[0].id }
    const bid = inviteTenders(state, club, spec).find((b) => b.available)!

    const cash = awardContract(state, club, new IdFactory(94_000), spec, bid.architectId, 'cash')
    expect(cash.ok).toBe(false)

    const debtBefore = club.finances.debt
    const borrowed = awardContract(state, club, new IdFactory(95_000), spec, bid.architectId, 'borrow')
    expect(borrowed.ok, borrowed.message).toBe(true)
    expect(club.finances.debt).toBe(debtBefore + bid.cost)
    expect(club.finances.balance).toBeGreaterThan(1000)
  })

  it('marks the architect busy for the duration of the job', () => {
    const state = freshWorld('BUSY')
    const club = state.clubs[state.playerClubId!]
    club.facilities.stadium.owned = true
    club.finances.balance = 50_000_000
    const spec = { kind: 'repair' as const, standId: club.facilities.stadium.stands[0].id }
    const bid = inviteTenders(state, club, spec).find((b) => b.available)!

    awardContract(state, club, new IdFactory(96_000), spec, bid.architectId)
    const architect = state.architects[bid.architectId]
    expect(architect.busyUntil).toBeTruthy()

    // And a different club cannot engage them meanwhile.
    const other = Object.values(state.clubs).find((c) => c.id !== club.id)!
    const otherBids = inviteTenders(state, other, {
      kind: 'repair', standId: other.facilities.stadium.stands[0].id,
    })
    const sameFirm = otherBids.find((b) => b.architectId === bid.architectId)!
    expect(sameFirm.available).toBe(false)
  })
})

describe('squad registration', () => {
  it('gives every club a legal list at world creation', () => {
    const state = freshWorld('REG-A')
    for (const club of Object.values(state.clubs)) {
      const view = squadRegistration(state, club)
      expect(view.illegal, `${club.name} has an illegal squad list`).toBe(false)
      expect(view.placesUsed).toBeLessThanOrEqual(SQUAD_LIMIT)
      expect(view.nonHomegrown).toBeLessThanOrEqual(NON_HOMEGROWN_LIMIT)
    }
  })

  it('leaves under-21s off the list and eligible anyway', () => {
    const state = freshWorld('REG-B')
    const club = state.clubs[state.playerClubId!]
    const view = squadRegistration(state, club)
    for (const kid of view.exempt) {
      expect(kid.age).toBeLessThan(U21_AGE)
      expect(club.registeredIds).not.toContain(kid.id)
      expect(isRegisteredFor(club, kid)).toBe(true)
    }
  })

  it('refuses an eighteenth foreign-trained player but still takes a homegrown one', () => {
    const state = freshWorld('REG-C')
    const club = state.clubs[state.playerClubId!]
    state.date.week = 1 // window open

    // Fill the list with players trained abroad, and nothing else.
    club.registeredIds = []
    const seniors = club.squad
      .map((id) => state.players[id]!)
      .filter((p) => p.age >= U21_AGE)
    for (const p of seniors) p.trainingYears = { elsewhere: 5 }
    for (const p of seniors.slice(0, NON_HOMEGROWN_LIMIT)) {
      expect(registerPlayer(state, club, p).ok).toBe(true)
    }

    const nextForeign = seniors[NON_HOMEGROWN_LIMIT]
    expect(nextForeign, 'squad too small for this test').toBeTruthy()
    const blocked = registerPlayer(state, club, nextForeign)
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toBe('noHomegrownPlaces')

    // The same player, trained in the country, walks straight in — which is
    // what makes the limit a limit on foreigners rather than on squad size.
    nextForeign.trainingYears = { [club.nationId]: 4 }
    expect(isHomegrownFor(nextForeign, club)).toBe(true)
    expect(registerPlayer(state, club, nextForeign).ok).toBe(true)
    expect(squadRegistration(state, club).placesUsed).toBe(NON_HOMEGROWN_LIMIT + 1)
  })

  it('locks the list when the window is shut', () => {
    const state = freshWorld('REG-D')
    const club = state.clubs[state.playerClubId!]
    state.date.week = 15 // mid-season, window closed
    const [named] = club.registeredIds
    const player = state.players[named]!
    expect(unregisterPlayer(state, club, player).error).toBe('closed')
    expect(club.registeredIds).toContain(named)
  })

  it('bars an unregistered senior from selection', () => {
    const state = freshWorld('REG-E')
    const club = state.clubs[state.playerClubId!]
    const dropped = squadRegistration(state, club).registered
      .slice()
      .sort((a, b) => b.currentAbility - a.currentAbility)[0]!
    club.registeredIds = club.registeredIds.filter((id) => id !== dropped.id)

    const team = selectTeam(state, club, new Rng('sel'))
    expect(team.starters.some((s) => s.playerId === dropped.id)).toBe(false)
    expect(team.bench).not.toContain(dropped.id)
  })

  it('makes a new signing at an AI club displace someone rather than vanish', () => {
    const state = freshWorld('REG-F')
    const buyer = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId && c.reputation > 60,
    )!

    // Everyone homegrown, so only the 25-place limit can bite, and the list
    // filled to the brim so it must bite.
    for (const p of registrablePool(state, buyer)) p.trainingYears = { [buyer.nationId]: 4 }
    const seniors = registrablePool(state, buyer)
      .filter((p) => p.age >= U21_AGE)
      .sort((a, b) => b.currentAbility - a.currentAbility)
    while (seniors.length < SQUAD_LIMIT) {
      // Age a youngster up rather than inventing a player, so everything else
      // about him stays internally consistent.
      const kid = registrablePool(state, buyer).find((p) => p.age < U21_AGE)
      if (!kid) break
      kid.age = 22
      seniors.push(kid)
    }
    expect(seniors.length).toBeGreaterThanOrEqual(SQUAD_LIMIT)
    buyer.registeredIds = seniors.slice(0, SQUAD_LIMIT).map((p) => p.id)
    expect(squadRegistration(state, buyer).placesFree).toBe(0)

    const weakestNamed = seniors.slice(0, SQUAD_LIMIT)
      .sort((a, b) => a.currentAbility - b.currentAbility)[0]!

    const arrival = Object.values(state.players).find(
      (p) => p.clubId && p.clubId !== buyer.id && p.age >= 24 && p.currentAbility > 150,
    )!
    arrival.clubId = buyer.id
    arrival.trainingYears = { [buyer.nationId]: 4 }
    buyer.squad.push(arrival.id)

    const outcome = registerOrDisplace(state, buyer, arrival)
    expect(outcome.registered).toBe(true)
    expect(outcome.displaced?.id).toBe(weakestNamed.id)
    expect(buyer.registeredIds).toContain(arrival.id)
    expect(buyer.registeredIds).not.toContain(weakestNamed.id)
    expect(squadRegistration(state, buyer).illegal).toBe(false)
  })

  it('credits a training year only to players under 21', () => {
    const state = freshWorld('REG-G')
    const club = state.clubs[state.playerClubId!]
    const kid = club.squad.map((id) => state.players[id]!).find((p) => p.age < U21_AGE)!
    const adult = club.squad.map((id) => state.players[id]!).find((p) => p.age > 25)!
    const kidBefore = kid.trainingYears[club.nationId] ?? 0
    const adultBefore = adult.trainingYears[club.nationId] ?? 0

    accrueTrainingYear(state, kid)
    accrueTrainingYear(state, adult)

    expect(kid.trainingYears[club.nationId]).toBe(kidBefore + 1)
    expect(adult.trainingYears[club.nationId] ?? 0).toBe(adultBefore)
  })

  it('keeps the human directors choices when the list is reconciled', () => {
    const state = freshWorld('REG-H')
    const club = state.clubs[state.playerClubId!]
    state.date.week = 1
    club.registeredIds = []
    const weakest = registrablePool(state, club)
      .filter((p) => p.age >= U21_AGE)
      .sort((a, b) => a.currentAbility - b.currentAbility)[0]!
    registerPlayer(state, club, weakest)

    reconcileRegistration(state, club)
    expect(club.registeredIds, 'a deliberate pick was thrown away').toContain(weakest.id)
    expect(squadRegistration(state, club).illegal).toBe(false)
  })
})

describe('AI squad management', () => {
  it('renews the players a club wants and lets the rest go', () => {
    const state = freshWorld('AI-RENEW')
    const club = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId && c.reputation > 50,
    )!
    // Everyone out of contract at the end of this season.
    const seniors = seniorSquad(state, club)
    for (const p of seniors) {
      if (p.contract) p.contract.expiresSeason = state.date.season
    }

    const renewed = processAiRenewals(state, club)
    expect(renewed).toBeGreaterThan(8)

    const kept = seniors.filter((p) => p.contract && p.contract.expiresSeason > state.date.season)
    const released = seniors.filter((p) => p.contract && p.contract.expiresSeason <= state.date.season)
    expect(kept.length).toBeGreaterThan(0)
    expect(released.length, 'a club that renews everyone has no free market').toBeGreaterThan(0)

    // The players kept are better than the players let go. Without this the
    // renewal rule is doing nothing useful.
    const avg = (list: typeof kept) =>
      list.reduce((sum, p) => sum + p.currentAbility, 0) / Math.max(1, list.length)
    expect(avg(kept)).toBeGreaterThan(avg(released))
  })

  it('will not keep a thirty-four-year-old who is not a first-teamer', () => {
    const state = freshWorld('AI-AGE')
    const club = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId && c.reputation > 70,
    )!
    const seniors = seniorSquad(state, club)
      .slice()
      .sort((a, b) => b.currentAbility - a.currentAbility)
    // A fringe player, aged out.
    const veteran = seniors[seniors.length - 3]!
    veteran.age = 34
    if (veteran.contract) veteran.contract.expiresSeason = state.date.season

    processAiRenewals(state, club)
    expect(veteran.contract!.expiresSeason).toBe(state.date.season)
  })

  it('signs free agents when short, outside the window', () => {
    const state = freshWorld('AI-FREE')
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    state.date.week = 15 // window firmly shut

    // Strip the squad back to a side that cannot be fielded.
    const seniors = seniorSquad(state, club)
    for (const p of seniors.slice(10)) {
      club.squad = club.squad.filter((id) => id !== p.id)
      p.clubId = null
      p.contract = null
      p.weeksUnattached = 30
    }
    expect(seniorSquad(state, club).length).toBe(10)

    const ctx = { rng: new Rng('recruit'), ids: new IdFactory(state.nextId) }
    for (let week = 0; week < 6; week++) runAiSquadManagement(state, ctx)

    expect(
      seniorSquad(state, club).length,
      'a club short of a side did not sign anyone',
    ).toBeGreaterThanOrEqual(EMERGENCY_SQUAD)
  })

  it('promotes from the academy rather than leaving the squad short', () => {
    const state = freshWorld('AI-YOUTH')
    const club = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId
        && c.squad.some((id) => state.players[id]?.isAcademy),
    )!
    for (const p of seniorSquad(state, club).slice(14)) {
      club.squad = club.squad.filter((id) => id !== p.id)
      p.clubId = null
    }
    const academyBefore = club.squad.filter((id) => state.players[id]?.isAcademy).length
    expect(academyBefore).toBeGreaterThan(0)

    let promoted = null
    for (let i = 0; i < 20 && !promoted; i++) {
      promoted = promoteFromAcademy(state, club, new Rng(`youth:${i}`))
    }
    expect(promoted, 'no academy player was ever promoted').toBeTruthy()
    expect(promoted!.isAcademy).toBe(false)
  })

  it('stops a player nobody has called in two seasons, at any age', () => {
    const state = freshWorld('AI-RETIRE')
    const club = state.clubs[state.playerClubId!]
    const player = seniorSquad(state, club)[0]!
    player.age = 24 // young enough that age alone would never end a career

    expect(retirementProbability(player), 'a 24-year-old under contract').toBe(0)

    player.clubId = null
    player.contract = null
    player.weeksUnattached = PATIENCE_WEEKS
    expect(retirementProbability(player)).toBeGreaterThan(0.5)
  })

  it('lets a career end for reasons other than age', () => {
    const state = freshWorld('AI-EARLY')
    const club = state.clubs[state.playerClubId!]
    const player = seniorSquad(state, club).find((p) => p.age >= 28 && p.age < 31)
      ?? seniorSquad(state, club)[0]!
    player.age = 29
    player.stats.appearances = 30
    player.injuryProneness = 20
    const settled = retirementProbability(player)

    // Coaching badges, a job at the club, a studio, a body that never came
    // right: a small hazard, but not zero.
    expect(settled).toBeGreaterThan(0)
    expect(settled).toBeLessThan(0.05)

    // A player who is not getting a game has less to turn down.
    player.stats.appearances = 2
    expect(retirementProbability(player)).toBeGreaterThan(settled)
  })

  it('keeps squads playable across six seasons', () => {
    // The defect this whole system exists to fix: squads fell from 26 players
    // to 12.2 by season four and 2.6 by season six, while thousands of free
    // agents waited to be asked. Slow, and the only test that would have
    // caught it — nothing shorter than a multi-season run shows the drain.
    // Six seasons is 138 seconds, and it was most of the suite's total. The
    // result is a pure function of the engine and the seed, so it is cached
    // against a hash of every file under src/engine: change the engine and
    // this simulates for real, change anything else and it loads a world it
    // has already paid for. The assertions below run either way.
    clearRatingCache()
    const state = simulatedWorld('decay-six-seasons', () => {
      const setup = prepareNewGame({
        seed: 'DECAY', directorName: 'T', background: 'scout',
        worldSize: 'compact', homeNationId: 'eng', startingSeason: 2025,
      })
      const world = startCareerAt(setup, setup.candidates[0].id)

      for (let season = 0; season < 6; season++) {
        for (let w = 0; w < 52; w++) advanceWeek(world, { ids: setup.ids, names: setup.names })
      }

      // Measured mid-season, when a thin squad would actually cost points.
      for (let w = 0; w < 14; w++) advanceWeek(world, { ids: setup.ids, names: setup.names })
      return world
    })

    const ai = Object.values(state.clubs).filter((c) => c.id !== state.playerClubId)
    const sizes = ai.map((c) => seniorSquad(state, c).length)
    const average = sizes.reduce((a, b) => a + b, 0) / sizes.length

    expect(average, `squads averaged ${average.toFixed(1)} after six seasons`).toBeGreaterThan(20)
    expect(Math.min(...sizes), 'a club cannot field a side').toBeGreaterThanOrEqual(14)
  }, 600_000)
})

describe('achievements', () => {
  it('awards nothing that has not happened', () => {
    const state = freshWorld('ACH-A')
    state.director.careerHistory = []
    const earned = earnedAchievements(state)
    expect(earned.has('first-job')).toBe(false)
    expect(earned.has('trophy')).toBe(false)
    expect(earned.has('ten-years')).toBe(false)
  })

  it('reads milestones off the career record', () => {
    const state = freshWorld('ACH-B')
    const club = state.clubs[state.playerClubId!]
    state.director.careerHistory = [{
      clubId: club.id,
      clubName: club.name,
      fromSeason: state.date.season - 6,
      toSeason: null,
      outcome: 'In post',
      bestFinish: 1,
      trophies: ['A Cup 2026', 'A Cup 2027'],
      netSpend: 0,
      xpEarned: 0,
    }]

    const earned = earnedAchievements(state)
    expect(earned.has('first-job')).toBe(true)
    expect(earned.has('first-season')).toBe(true)
    expect(earned.has('trophy')).toBe(true)
    expect(earned.has('league-title')).toBe(true)
    expect(earned.has('five-years')).toBe(true)
    expect(earned.has('trophy-five'), 'two trophies is not five').toBe(false)
    expect(earned.has('ten-years'), 'six seasons is not ten').toBe(false)
  })

  it('recognises promotion from the club record, not the director record', () => {
    const state = freshWorld('ACH-C')
    const club = state.clubs[state.playerClubId!]
    const tiers = Object.values(state.leagues)
      .filter((l) => l.nationId === club.nationId)
      .sort((a, b) => b.tier - a.tier)
    expect(tiers.length).toBeGreaterThan(2)

    state.director.careerHistory = [{
      clubId: club.id, clubName: club.name, fromSeason: state.date.season - 3,
      toSeason: null, outcome: 'In post', bestFinish: 1, trophies: [],
      netSpend: 0, xpEarned: 0,
    }]
    // Climbing two divisions in consecutive seasons.
    club.history = [0, 1, 2].map((i) => ({
      season: state.date.season - 3 + i,
      leagueId: tiers[i].id,
      leagueName: tiers[i].name,
      position: 1, played: 46, points: 90, goalsFor: 80, goalsAgainst: 30,
      cupResult: '—', continentalResult: '—', netSpend: 0, finalBalance: 0,
      headCoachName: 'A Coach',
    }))

    const earned = earnedAchievements(state)
    expect(earned.has('promotion')).toBe(true)
    expect(earned.has('promotion-double')).toBe(true)
  })

  it('takes the whole earned set on every report', async () => {
    // The caller hands over everything the save has earned and the seam works
    // out what is new, because tracking deltas differs between Play Games and
    // Game Center and does not belong in the game.
    resetReportedAchievements()
    await achievementService.report(['trophy', 'promotion'])
    await achievementService.report(['trophy', 'promotion', 'league-title'])
    expect(await achievementService.show()).toBe(false)
  })

  it('describes every milestone it can award', () => {
    for (const id of ACHIEVEMENTS.map((a) => a.id)) {
      const found = achievement(id)
      expect(found, `${id} has no catalogue entry`).toBeTruthy()
      expect(found!.description.length).toBeGreaterThan(10)
    }
    expect(achievement('nonsense')).toBeNull()
  })

  it('offers no platform capabilities until one is wired in', () => {
    const caps = capabilities()
    expect(caps.achievements).toBe(false)
    expect(caps.purchases).toBe(false)
    expect(caps.signIn).toBe(false)
  })

  it('refuses a purchase rather than pretending to take one', async () => {
    expect(await purchases.products()).toEqual([])
    expect(await purchases.buy('xp-boost-small')).toEqual({ status: 'unavailable' })
    expect(await purchases.restore()).toEqual([])
  })
})

describe('financial regulation', () => {
  function ledgerWith(over: Partial<FinanceLedger>): FinanceLedger {
    return {
      matchdayIncome: 0, tvIncome: 0, sponsorshipIncome: 0, prizeMoney: 0,
      transfersIn: 0, wagesPaid: 0, transfersOut: 0, facilitiesSpend: 0,
      staffWages: 0, agentFees: 0, amortisation: 0, playerTradingProfit: 0,
      interestPaid: 0, otherIncome: 0, otherCosts: 0,
      ...over,
    }
  }

  it('counts wages, written-down fees and agents against revenue', () => {
    const assessment = assessSquadCost(ledgerWith({
      tvIncome: 100_000_000,
      wagesPaid: 50_000_000,
      staffWages: 10_000_000,
      amortisation: 8_000_000,
      agentFees: 2_000_000,
    }))
    expect(assessment.squadCost).toBe(70_000_000)
    expect(assessment.relevantIncome).toBe(100_000_000)
    expect(assessment.ratio).toBeCloseTo(0.7, 5)
    expect(assessment.inBreach, 'exactly at the limit is not a breach').toBe(false)
  })

  it('counts profit on player sales as income', () => {
    const base = { tvIncome: 100_000_000, wagesPaid: 80_000_000 }
    const without = assessSquadCost(ledgerWith(base))
    const with_ = assessSquadCost(ledgerWith({ ...base, playerTradingProfit: 50_000_000 }))

    expect(without.inBreach, '80% of revenue is a breach').toBe(true)
    expect(with_.inBreach, 'selling well is the orthodox way out').toBe(false)
    expect(with_.relevantIncome).toBe(150_000_000)
  })

  it('ignores the cash a transfer cost and counts the write-down', () => {
    // The distinction the whole system rests on: paying £40m in one go is not
    // a £40m cost this season, and a club can be flush with cash and still
    // fail the test.
    const cash = assessSquadCost(ledgerWith({
      tvIncome: 100_000_000, wagesPaid: 40_000_000, transfersIn: 60_000_000,
    }))
    expect(cash.inBreach, 'cash spent on fees is not a squad cost').toBe(false)

    const booked = assessSquadCost(ledgerWith({
      tvIncome: 100_000_000, wagesPaid: 40_000_000, amortisation: 35_000_000,
    }))
    expect(booked.inBreach).toBe(true)
  })

  it('punishes nothing in the first assessed season', () => {
    // A new world is generated without reference to this rule, so it opens
    // with a quarter of clubs outside it. Sanctioning a director in his first
    // year for the squad he inherited is not a rule, it is an ambush.
    const state = freshWorld('REG-GRACE')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)

    // Far outside the limit — severe enough to skip straight to hard
    // sanctions in any other season.
    const outcome = assessClub(state, club, ledgerWith({
      tvIncome: 1_000_000, wagesPaid: 1_400_000,
    }), ids)

    expect(outcome.assessment.inBreach).toBe(true)
    expect(outcome.imposed.map((s) => s.kind)).toEqual(['warning'])
    expect(underEmbargo(club)).toBe(false)
    expect(club.finances.regulation.pointsDeducted).toBe(0)
  })

  it('monitors a marginal overspend rather than punishing it', () => {
    const state = freshWorld('REG-MARGIN')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)
    // 74% — over the limit, inside what the authorities will accept.
    const marginal = () => ledgerWith({ tvIncome: 1_000_000, wagesPaid: 740_000 })

    assessClub(state, club, marginal(), ids) // grace year
    for (let season = 0; season < 5; season++) {
      state.date.season += 1
      const outcome = assessClub(state, club, marginal(), ids)
      expect(outcome.assessment.inBreach).toBe(true)
      expect(outcome.imposed.map((s) => s.kind), 'a marginal overspend was punished')
        .toEqual(['warning'])
    }
    expect(underEmbargo(club)).toBe(false)
    expect(club.finances.regulation.pointsDeducted).toBe(0)
  })

  it('escalates warning, then fine, then embargo, then points', () => {
    const state = freshWorld('REG-ESC')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)
    // Beyond the acceptable deviation, or nothing escalates at all.
    const breaching = () => ledgerWith({ tvIncome: 1_000_000, wagesPaid: 880_000 })

    // The first assessment of a save is a grace year whatever the figures,
    // so escalation is measured from the season after it.
    assessClub(state, club, breaching(), ids)
    state.date.season += 1

    const first = assessClub(state, club, breaching(), ids)
    expect(first.imposed.map((s) => s.kind)).toEqual(['warning'])
    expect(underEmbargo(club)).toBe(false)

    state.date.season += 1
    const second = assessClub(state, club, breaching(), ids)
    expect(second.imposed.some((s) => s.kind === 'fine')).toBe(true)
    expect(underEmbargo(club), 'a second year is a fine, not yet an embargo').toBe(false)

    state.date.season += 1
    const third = assessClub(state, club, breaching(), ids)
    expect(third.imposed.some((s) => s.kind === 'registrationEmbargo')).toBe(true)
    expect(underEmbargo(club)).toBe(true)

    state.date.season += 1
    const fourth = assessClub(state, club, breaching(), ids)
    const deduction = fourth.imposed.find((s) => s.kind === 'pointsDeduction')
    expect(deduction, 'persisting for four years must cost points').toBeTruthy()
    expect(deduction!.amount).toBeGreaterThanOrEqual(3)
    expect(club.finances.regulation.pointsDeducted).toBe(deduction!.amount)
  })

  it('forgives a club that comes back inside the limit', () => {
    const state = freshWorld('REG-FORGIVE')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)

    // The grace year is a baseline and does not count against the club, so a
    // real breach season has to follow it.
    assessClub(state, club, ledgerWith({ tvIncome: 1_000_000, wagesPaid: 900_000 }), ids)
    expect(club.finances.regulation.breachSeasons).toBe(0)
    state.date.season += 1
    assessClub(state, club, ledgerWith({ tvIncome: 1_000_000, wagesPaid: 900_000 }), ids)
    expect(club.finances.regulation.breachSeasons).toBe(1)
    state.date.season += 1

    const clean = assessClub(state, club, ledgerWith({ tvIncome: 1_000_000, wagesPaid: 400_000 }), ids)
    expect(clean.imposed).toEqual([])
    expect(club.finances.regulation.breachSeasons).toBe(0)
    expect(club.finances.regulation.lastRatio).toBeCloseTo(0.4, 5)
  })

  it('bars a player signed since the embargo, not the squad already there', () => {
    const state = freshWorld('REG-EMB')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)
    state.date.week = 1

    const existing = registrablePool(state, club).find((p) => p.age >= U21_AGE)!
    existing.joinedSeason = state.date.season - 2

    // Severe enough to skip a step: grace year, warning, then embargo.
    const breaching = () => ledgerWith({ tvIncome: 1_000_000, wagesPaid: 1_000_000 })
    assessClub(state, club, breaching(), ids)
    state.date.season += 1
    assessClub(state, club, breaching(), ids)
    state.date.season += 1
    assessClub(state, club, breaching(), ids)
    expect(underEmbargo(club)).toBe(true)

    const newcomer = registrablePool(state, club).find(
      (p) => p.age >= U21_AGE && p.id !== existing.id,
    )!
    newcomer.joinedSeason = state.date.season + 1

    club.registeredIds = []
    expect(registerPlayer(state, club, existing).ok, 'an existing player was barred').toBe(true)
    expect(registerPlayer(state, club, newcomer).error).toBe('embargo')
  })

  it('spreads a fee across the contract and books a profit on the sale', () => {
    const state = freshWorld('REG-AMORT')
    const buyer = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId && c.reputation > 60,
    )!
    const seller = Object.values(state.clubs).find(
      (c) => c.id !== buyer.id && c.id !== state.playerClubId,
    )!
    const player = state.players[seller.squad.find((id) => !state.players[id].isAcademy)!]
    const ctx = { rng: new Rng('amort'), ids: new IdFactory(state.nextId) }
    buyer.finances.balance = 100_000_000

    executeTransfer(state, ctx, {
      player, buyer, seller, fee: 20_000_000, kind: 'permanent',
      contract: {
        wage: 50_000, expiresSeason: state.date.season + 4, signingBonus: 0,
        releaseClause: null, appearanceFee: 0, goalBonus: 0, loyaltyBonus: 0,
        inNegotiation: false, weeksSinceRenewalRequest: 0,
      },
      agentFee: 0, sellOnPercentage: 0, wageContribution: 0, loanUntilSeason: null,
    })

    expect(player.bookValue).toBe(20_000_000)
    expect(player.amortisationCharge).toBe(5_000_000)

    // A season of write-down, accrued weekly rather than in one lump.
    for (let week = 0; week < 52; week++) accrueAmortisation(state, buyer)
    expect(player.bookValue).toBeCloseTo(15_000_000, -4)
    expect(buyer.finances.season.amortisation).toBeCloseTo(5_000_000, -4)

    // Sold above what he is carried at: the difference is profit.
    const onward = Object.values(state.clubs).find(
      (c) => c.id !== buyer.id && c.id !== seller.id && c.id !== state.playerClubId,
    )!
    onward.finances.balance = 100_000_000
    player.sellOnClauseOwed = []
    executeTransfer(state, ctx, {
      player, buyer: onward, seller: buyer, fee: 25_000_000, kind: 'permanent',
      contract: player.contract!, agentFee: 0, sellOnPercentage: 0,
      wageContribution: 0, loanUntilSeason: null,
    })
    expect(buyer.finances.season.playerTradingProfit).toBeCloseTo(10_000_000, -4)
  })

  it('makes an academy graduate pure profit', () => {
    const state = freshWorld('REG-GRAD')
    const seller = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    const buyer = Object.values(state.clubs).find(
      (c) => c.id !== seller.id && c.id !== state.playerClubId,
    )!
    const player = state.players[seller.squad.find((id) => !state.players[id].isAcademy)!]
    player.bookValue = 0 // came through the academy: nothing to write off
    player.sellOnClauseOwed = []
    buyer.finances.balance = 100_000_000

    executeTransfer(state, { rng: new Rng('grad'), ids: new IdFactory(state.nextId) }, {
      player, buyer, seller, fee: 8_000_000, kind: 'permanent',
      contract: player.contract!, agentFee: 0, sellOnPercentage: 0,
      wageContribution: 0, loanUntilSeason: null,
    })

    expect(seller.finances.season.playerTradingProfit).toBe(8_000_000)
  })
})

describe('screen labels', () => {
  it('names the destination on every link an inbox item can carry', () => {
    // Every view the engine links to must have a human name, or the button
    // falls back to a route slug and the message reads worse than "Open".
    const linked = ['academy', 'board', 'career', 'club', 'finance', 'league',
      'media', 'player', 'squad', 'stadium', 'staff', 'transfers', 'registration',
      'achievements']
    for (const view of linked) {
      expect(SCREEN_LABELS[view], `${view} has no label`).toBeTruthy()
      expect(linkLabel(view)).toBe(`Open ${SCREEN_LABELS[view]}`)
    }
  })

  it('names the player when the link is to one', () => {
    expect(linkLabel('player', 'Danny Mills')).toBe("Open Danny Mills's profile")
    expect(linkLabel('player', null)).toBe('Open Player profile')
  })

  it('falls back rather than showing a bare route name', () => {
    expect(linkLabel('somewhere-new')).toBe('Open Somewhere-new')
  })
})

describe('agents', () => {
  it('prices its fee off the relationship', () => {
    const state = freshWorld('AGENT-FEE')
    const agent = Object.values(state.agents)[0]!
    const annualWage = 20_000 * 52

    agent.relationship = 90
    const friendly = agentFee(agent, annualWage)
    agent.relationship = 50
    const neutral = agentFee(agent, annualWage)
    agent.relationship = 5
    const hostile = agentFee(agent, annualWage)

    expect(friendly).toBeLessThan(neutral)
    expect(hostile).toBeGreaterThan(neutral)
    // The spread is worth caring about, not a rounding error.
    expect(hostile / friendly).toBeGreaterThan(1.5)
  })

  it('makes a hostile agent an obstacle without changing the terms', () => {
    const state = freshWorld('AGENT-WILL')
    const agent = Object.values(state.agents)[0]!

    agent.relationship = 95
    const willing = agentWillingness(agent)
    agent.relationship = 0
    const obstructive = agentWillingness(agent)

    expect(willing).toBeGreaterThan(1)
    expect(obstructive).toBeLessThan(1)
    expect(agentWillingness(null), 'a player without an agent is unaffected').toBe(1)
  })

  it('only remembers how the human club behaves', () => {
    const state = freshWorld('AGENT-SCOPE')
    const agent = Object.values(state.agents)[0]!
    const other = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!
    agent.relationship = 50

    expect(adjustRelationship(state, other.id, agent, 'releasedClient')).toBe(0)
    expect(agent.relationship).toBe(50)

    expect(adjustRelationship(state, state.playerClubId!, agent, 'releasedClient')).toBeLessThan(0)
    expect(agent.relationship).toBeLessThan(50)
  })

  it('charges more for the things that cost nothing at the time', () => {
    // Freezing a player out, haggling a fee down and letting a contract run
    // down are all free on the day and expensive later. That ordering is the
    // design, so it is worth pinning.
    expect(RELATIONSHIP_EVENTS.clientRanDownContract).toBeLessThan(RELATIONSHIP_EVENTS.soldClient)
    expect(RELATIONSHIP_EVENTS.hagglingRefused).toBeLessThan(RELATIONSHIP_EVENTS.hagglingAccepted)
    expect(RELATIONSHIP_EVENTS.signedClient).toBeGreaterThan(0)
    expect(RELATIONSHIP_EVENTS.releasedClient).toBeLessThan(0)
  })

  it('drifts back towards indifference, grudges more slowly than favours', () => {
    const state = freshWorld('AGENT-DECAY')
    const agents = Object.values(state.agents)
    const friend = agents[0]!
    const enemy = agents[1]!
    friend.relationship = 90
    enemy.relationship = 10

    for (let season = 0; season < 5; season++) decayRelationships(state)

    expect(friend.relationship).toBeLessThan(90)
    expect(enemy.relationship).toBeGreaterThan(10)
    // Both moved towards 50; the grudge moved less far.
    expect(90 - friend.relationship).toBeGreaterThan(enemy.relationship - 10)
  })

  it('introduces clients only to a director an agent trusts', () => {
    const state = freshWorld('AGENT-INTRO')
    const club = state.clubs[state.playerClubId!]
    for (const agent of Object.values(state.agents)) agent.relationship = 50
    expect(introductions(state, club)).toEqual([])

    // A trusted agent with an unhappy client at another club.
    const agent = Object.values(state.agents).find((a) => a.clientIds.length > 3)!
    agent.relationship = 95
    let seeded = false
    for (const id of agent.clientIds) {
      const player = state.players[id]
      if (!player || player.clubId === club.id || player.isAcademy) continue
      player.morale = 20
      player.currentAbility = Math.min(player.currentAbility, Math.round(club.reputation * 1.5))
      seeded = true
      break
    }
    expect(seeded, 'no suitable client to seed the test with').toBe(true)

    const offered = introductions(state, club)
    expect(offered.length).toBeGreaterThan(0)
    expect(offered[0].agent.id).toBe(agent.id)
  })

  it('bands the relationship into something a screen can say', () => {
    expect(standingFor(95)).toBe('trusted')
    expect(standingFor(50)).toBe('neutral')
    expect(standingFor(5)).toBe('hostile')
    for (const standing of Object.keys(STANDING_LABELS)) {
      expect(STANDING_NOTES[standing as keyof typeof STANDING_NOTES]).toBeTruthy()
    }
  })
})

describe('ownership', () => {
  it('gives every club an owner whose type explains the board', () => {
    const state = freshWorld('OWN-A')
    for (const club of Object.values(state.clubs)) {
      const owner = club.board.owner
      expect(owner.name).toBeTruthy()
      expect(OWNER_LABELS[owner.kind]).toBeTruthy()
      expect(owner.sinceSeason).toBeLessThanOrEqual(state.date.season)
    }
  })

  it('separates what different owners will spend', () => {
    const rng = new Rng('owners')
    const fund = createOwner(rng, 'foreignFund', 'A Fund', 2025)
    const trust = createOwner(rng, 'fanOwned', 'A Trust', 2025)

    expect(wageBudgetShare(fund)).toBeGreaterThan(wageBudgetShare(trust))
    expect(reserveRelease(fund)).toBeGreaterThan(reserveRelease(trust))
    expect(debtTolerance(fund)).toBeGreaterThan(debtTolerance(trust))
    // A fund's board turns far faster on a bad run.
    expect(impatienceFactor(fund)).toBeGreaterThan(impatienceFactor(trust))
    // And a fund absorbs losses a trust simply cannot.
    expect(lossCoverage(fund)).toBeGreaterThan(lossCoverage(trust))
    expect(lossCoverage(trust)).toBe(0)
  })

  it('hands the club over and resets what the director had built', () => {
    const state = freshWorld('OWN-TAKE')
    const club = state.clubs[state.playerClubId!]
    const ids = new IdFactory(state.nextId)
    club.board.confidence = 90
    club.board.warnings = 2
    club.finances.debt = 5_000_000
    const before = club.board.owner.name

    const incoming = createOwner(new Rng('buyer'), 'foreignFund', 'Meridian Capital', state.date.season)
    incoming.wealth = 95
    completeTakeover(state, ids, club, {
      id: 'v1', clubId: club.id, stage: 'agreed', incoming,
      stageSince: 0, season: state.date.season, public: true,
    })

    expect(club.board.owner.name).toBe('Meridian Capital')
    expect(club.board.owner.name).not.toBe(before)
    // Goodwill does not transfer, and neither do the warnings.
    expect(club.board.confidence).toBeLessThan(90)
    expect(club.board.warnings).toBe(0)
    // A season's grace, whatever they make of you.
    expect(club.board.graceUntilSeason).toBe(state.date.season)
    // A wealthy buyer clears the debt they have just bought.
    expect(club.finances.debt).toBeLessThan(5_000_000)
  })

  it('never sacks the director in the season of a takeover', () => {
    const state = freshWorld('OWN-GRACE')
    const club = state.clubs[state.playerClubId!]
    club.board.graceUntilSeason = state.date.season
    club.board.confidence = 2
    club.board.warnings = 2
    state.date.week = 30

    for (let i = 0; i < 40; i++) {
      const result = processBoard(state, club, new Rng(`grace:${i}`))
      expect(result.sacked, 'sacked during the grace season').toBe(false)
    }
  })

  it('rewards a pitch that reads the room and punishes one that does not', () => {
    const rng = new Rng('pitch')
    const fund = createOwner(rng, 'foreignFund', 'A Fund', 2025)
    fund.ambition = 95
    fund.patience = 10
    fund.youthBelief = 15
    const trust = createOwner(rng, 'fanOwned', 'A Trust', 2025)
    trust.ambition = 30
    trust.patience = 95
    trust.youthBelief = 90

    expect(pitchFit(fund, 'push')).toBeGreaterThan(pitchFit(fund, 'youth'))
    expect(pitchFit(trust, 'youth')).toBeGreaterThan(pitchFit(trust, 'push'))
    expect(pitchFit(fund, 'youth')).toBeLessThan(0)
  })

  it('turns a good pitch into backing and a bad one into a warning shot', () => {
    const state = freshWorld('OWN-PITCH')
    const club = state.clubs[state.playerClubId!]
    club.board.owner = createOwner(new Rng('p'), 'foreignFund', 'A Fund', state.date.season)
    club.board.owner.ambition = 98
    club.board.owner.patience = 5
    club.board.owner.leverage = 90
    club.board.confidence = 50
    club.finances.transferBudget = 1_000_000

    const good = resolveOwnerPitch(club, 'push')
    expect(good).toContain('backing')
    // Board confidence, not the owner's private opinion. There used to be a
    // `faithInDirector` on the owner, and these assertions were the only thing
    // in the project that ever read it — a test checking arithmetic the game
    // itself ignored. Confidence is what the board actually acts on.
    expect(club.board.confidence, 'a good pitch was not rewarded').toBeGreaterThan(50)
    expect(club.finances.transferBudget).toBeGreaterThan(1_000_000)

    club.board.confidence = 50
    const bad = resolveOwnerPitch(club, 'youth')
    expect(club.board.confidence, 'a bad pitch cost nothing').toBeLessThan(50)
    expect(bad).toContain('wrong man')
  })

  it('only pursues clubs worth buying', () => {
    const state = freshWorld('OWN-APPEAL')
    const clubs = Object.values(state.clubs)
    // Nobody buys a club whose owner arrived last year.
    const fresh = clubs[0]
    fresh.board.owner.sinceSeason = state.date.season
    const settled = clubs[1]
    settled.board.owner.sinceSeason = state.date.season - 10
    settled.fanbase = 90
    settled.reputation = 30

    expect(takeoverAppeal(state, settled)).toBeGreaterThan(takeoverAppeal(state, fresh))
    // Distress attracts a different buyer, but it attracts one.
    const before = takeoverAppeal(state, settled)
    settled.finances.inCrisis = true
    expect(takeoverAppeal(state, settled)).toBeGreaterThan(before)
  })
})

describe('deadline day', () => {
  it('falls on the last week of each window and nowhere else', () => {
    expect(isDeadlineWeek(SUMMER_DEADLINE_WEEK)).toBe(true)
    expect(isDeadlineWeek(WINTER_DEADLINE_WEEK)).toBe(true)
    for (const week of [1, 4, 6, 20, 29, 31, 45, 52]) {
      expect(isDeadlineWeek(week), `week ${week}`).toBe(false)
    }
    // And every deadline week must actually be inside a window, or the day
    // would arrive after business had already stopped.
    expect(isTransferWindowOpen(SUMMER_DEADLINE_WEEK)).toBe(true)
    expect(isTransferWindowOpen(WINTER_DEADLINE_WEEK)).toBe(true)
    expect(isTransferWindowOpen(SUMMER_DEADLINE_WEEK + 1)).toBe(false)
    expect(isTransferWindowOpen(WINTER_DEADLINE_WEEK + 1)).toBe(false)
  })

  it('discounts hardest where the contract is shortest', () => {
    const state = freshWorld('DL-DISCOUNT')
    const club = state.clubs[state.playerClubId!]
    const player = seniorSquad(state, club)[0]!
    player.squadStatus = 'rotation'
    player.transferRequested = false
    player.listedForTransfer = false

    player.contract!.expiresSeason = state.date.season + 4
    const long = deadlineDiscount(state, player)
    player.contract!.expiresSeason = state.date.season + 1
    const short = deadlineDiscount(state, player)
    player.contract!.expiresSeason = state.date.season
    const expiring = deadlineDiscount(state, player)

    expect(short).toBeGreaterThan(long)
    expect(expiring).toBeGreaterThan(short)
    // A club with a year left knows what he is worth in six months.
    expect(expiring).toBeGreaterThan(0.4)
  })

  it('discounts a player his club has given up on', () => {
    const state = freshWorld('DL-SURPLUS')
    const club = state.clubs[state.playerClubId!]
    const player = seniorSquad(state, club)[0]!
    player.contract!.expiresSeason = state.date.season + 3
    player.squadStatus = 'rotation'
    const wanted = deadlineDiscount(state, player)
    player.squadStatus = 'surplus'
    expect(deadlineDiscount(state, player)).toBeGreaterThan(wanted)
  })

  it('only offers players the club could actually sign', () => {
    const state = freshWorld('DL-OFFERS')
    const club = state.clubs[state.playerClubId!]
    state.date.week = SUMMER_DEADLINE_WEEK
    club.finances.transferBudget = 8_000_000
    club.finances.wageBudget = totalWageBill(state, club) + 40_000

    const offers = generateOpportunities(state, club, new Rng('offers'))
    for (const offer of offers) {
      expect(offer.fee, `${offer.playerName} costs more than the budget`)
        .toBeLessThanOrEqual(club.finances.transferBudget)
      expect(offer.playerId).toBeTruthy()
      expect(offer.note.length).toBeGreaterThan(10)
      // Never one of our own.
      expect(offer.clubId).not.toBe(club.id)
    }
  })

  it('runs the clock down across the offers', () => {
    const state = freshWorld('DL-CLOCK')
    const club = state.clubs[state.playerClubId!]
    state.date.week = SUMMER_DEADLINE_WEEK
    club.finances.transferBudget = 50_000_000
    club.finances.wageBudget = totalWageBill(state, club) + 200_000

    const offers = generateOpportunities(state, club, new Rng('clock'))
    // The clock counts down the list, in order. Assigning it before sorting
    // made the hours jump about, which reads as noise rather than as a day
    // running out.
    for (let i = 1; i < offers.length; i++) {
      expect(offers[i].hours, `offer ${i} has more time left than offer ${i - 1}`)
        .toBeLessThanOrEqual(offers[i - 1].hours)
    }
    expect(hoursRemaining(0, 5)).toBeGreaterThan(hoursRemaining(4, 5))
    expect(hoursRemaining(4, 5)).toBeGreaterThanOrEqual(1)
  })
})

describe('transfer market volume', () => {
  it('turns a squad over rather than only adding to it', () => {
    // The market seized up at half a signing per club per season because
    // clubs only ever bought: a wage budget leaves room for one or two
    // additions and no more. Recruitment has to be churn.
    const state = freshWorld('CHURN')
    const club = Object.values(state.clubs).find(
      (c) => c.id !== state.playerClubId && c.reputation > 55,
    )!
    const squad = seniorSquad(state, club)
    expect(squad.length).toBeGreaterThan(20)

    // Nobody is surplus and the squad is at a sensible size, so there is
    // little to shed.
    for (const p of squad) {
      p.squadStatus = 'firstTeam'
      p.listedForTransfer = false
      p.transferRequested = false
    }
    const settled = churnCandidatesForTest(state, club)

    // Mark the weakest few as surplus and the club should want to move them.
    for (const p of squad.slice().sort((a, b) => a.currentAbility - b.currentAbility).slice(0, 4)) {
      p.squadStatus = 'surplus'
    }
    const unsettled = churnCandidatesForTest(state, club)
    expect(unsettled.length).toBeGreaterThanOrEqual(settled.length)
  })

  it('will not sell a squad down below a fieldable size', () => {
    const state = freshWorld('CHURN-FLOOR')
    const club = Object.values(state.clubs).find((c) => c.id !== state.playerClubId)!

    // Strip the squad to the floor and mark everyone surplus: a club with
    // nothing to spare has nothing to sell, however little it rates them.
    const squad = seniorSquad(state, club)
    for (const p of squad.slice(20)) {
      club.squad = club.squad.filter((id) => id !== p.id)
      p.clubId = null
    }
    for (const p of seniorSquad(state, club)) p.squadStatus = 'surplus'

    expect(seniorSquad(state, club).length).toBeLessThanOrEqual(21)
    expect(churnCandidatesForTest(state, club).length).toBe(0)
  })

  it('stops buying at the squad list rather than at a number', () => {
    // The limit that holds as the world gets richer is made of places, not
    // money: a 26th senior cannot be registered, so there is no point signing
    // him. Under-21s sit outside the list and outside the count.
    expect(SQUAD_LIMIT).toBe(25)
    expect(U21_AGE).toBe(21)
  })
})

describe('debt that cannot be repaid', () => {
  it('gets settled rather than carried for ever', () => {
    // A club whose borrowing has run several times past anything its revenue
    // could service, with nothing to service it from, is not going to repay
    // it. Without this, clubs sat in financial crisis for thirteen and fifteen
    // seasons — a dead club occupying a division.
    const state = freshWorld('WRITEOFF')
    const club = state.clubs[state.playerClubId!]
    const revenue = weeklyRevenue(state, club)
    const tolerated = revenue * debtTolerance(club.board.owner)

    club.finances.debt = Math.round(tolerated * 6)
    club.finances.balance = 0
    club.finances.inCrisis = true

    // Probabilistic, so run it until it lands rather than asserting on one roll.
    let settled = false
    for (let week = 0; week < 400 && !settled; week++) {
      processFinances(state, club, new Rng(`writeoff:${week}`), null)
      settled = !club.finances.inCrisis
    }

    expect(settled, 'a club never found a way out of unpayable debt').toBe(true)
    expect(club.finances.debt).toBeLessThan(tolerated)
  })

  it('leaves a serviceable debt alone', () => {
    const state = freshWorld('NO-WRITEOFF')
    const club = state.clubs[state.playerClubId!]
    const tolerated = weeklyRevenue(state, club) * debtTolerance(club.board.owner)

    // Over the line, but not by the multiple that makes it hopeless.
    club.finances.debt = Math.round(tolerated * 1.4)
    club.finances.balance = 0
    club.finances.inCrisis = true
    const before = club.finances.debt

    for (let week = 0; week < 60; week++) {
      processFinances(state, club, new Rng(`no:${week}`), null)
    }
    // It may be paid down, but it must never be written off.
    expect(club.finances.debt).toBeGreaterThan(tolerated * 0.5)
    expect(club.finances.debt).toBeLessThanOrEqual(before * 1.6)
  })
})
