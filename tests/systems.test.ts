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
import { compress, decompress, MemoryAdapter } from '../src/storage/adapter'
import { loadGame, saveGame, setStorageAdapter } from '../src/storage/saves'
import type { GameState } from '../src/engine/types'

function freshWorld(seed = 'SYSTEMS'): GameState {
  const state = generateWorld({
    seed, season: 2025, size: 'compact', homeNationId: 'eng',
    directorName: 'Test Director', background: 'analyst',
  })
  state.playerClubId = Object.values(state.clubs).find((c) => c.reputation < 30)!.id
  state.clubs[state.playerClubId].isPlayerClub = true
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
    const player = state.players[clubs[5].squad.find((id) => !state.players[id].isAcademy)!]
    const original = buyer.reputation

    buyer.reputation = 20
    const lowly = moveAppeal(state, player, buyer)
    buyer.reputation = 90
    const prestigious = moveAppeal(state, player, buyer)
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    expect(loaded!.clubs[loaded!.playerClubId].name).toBe(state.clubs[state.playerClubId].name)
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
    for (const role of ['headCoach', 'scout', 'physio', 'analyst'] as const) {
      expect(
        availableStaff(state, club, role).length,
        `no ${role} available to ${club.name} (reputation ${club.reputation})`,
      ).toBeGreaterThan(0)
    }
  })

  it('hires a scout and adds him to the wage bill', () => {
    const state = freshWorld('HIRING3')
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
    const { target } = assessFanMood(state, club)

    club.fanMood = target
    for (let week = 0; week < 60; week++) updateFanMood(state, club)
    expect(Math.abs(club.fanMood - target)).toBeLessThan(1)
  })

  it('converges on the assessed target from either direction', () => {
    const state = freshWorld('CONVERGE')
    const club = state.clubs[state.playerClubId]
    const { target } = assessFanMood(state, club)

    for (const start of [1, 100]) {
      club.fanMood = start
      for (let week = 0; week < 80; week++) updateFanMood(state, club)
      expect(Math.abs(club.fanMood - target)).toBeLessThan(1.5)
    }
  })

  it('explains itself', () => {
    const state = freshWorld('EXPLAIN')
    const club = state.clubs[state.playerClubId]
    club.finances.inCrisis = true
    const { factors } = assessFanMood(state, club)
    expect(factors.some((f) => f.label.includes('crisis'))).toBe(true)
    club.finances.inCrisis = false
  })
})

describe('operating costs', () => {
  it('itemises every cost and the parts sum to the total', () => {
    const state = freshWorld('COSTS')
    const club = state.clubs[state.playerClubId]
    const costs = operatingCosts(state, club)

    const parts =
      costs.stadiumMaintenance + costs.groundRent + costs.trainingGround
      + costs.youthSetup + costs.medical + costs.dataDepartment
      + costs.scoutingNetwork + costs.supportStaff
    // Rounding of each line can differ from rounding the sum by a pound or two.
    expect(Math.abs(parts - costs.total)).toBeLessThanOrEqual(8)
    expect(costs.supportHeadcount).toBeGreaterThanOrEqual(2)
  })

  it('charges training and medical per player', () => {
    const state = freshWorld('PERPLAYER')
    const club = state.clubs[state.playerClubId]
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
    expect(bigRatio).toBeLessThan(0.35)
    expect(smallRatio).toBeLessThan(0.65)
  })
})

describe('board requests', () => {
  it('offers every request with a reason when it is unavailable', () => {
    const state = freshWorld('REQUESTS')
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
    state.date.week = 20
    club.board.confidence = 95

    makeRequest(state, club, 'transferFunds', new Rng('a'), 1000)
    expect(weeksUntilNextRequest(state, club)).toBeGreaterThan(0)

    const second = makeRequest(state, club, 'transferFunds', new Rng('b'), 1000)
    expect(second.outcome).toBe('refused')
    expect(second.message).toContain('not entertain')
  })

  it('grants more readily to a board that trusts you', () => {
    const trusting = freshWorld('TRUST')
    const wary = freshWorld('TRUST')

    let granted = 0
    let refused = 0
    for (let i = 0; i < 60; i++) {
      const club = trusting.clubs[trusting.playerClubId]
      club.board.confidence = 95
      club.board.lastRequestWeek = -99
      club.board.requestsThisSeason = 0
      club.finances.balance = 5_000_000
      if (makeRequest(trusting, club, 'transferFunds', new Rng(`t${i}`), 100_000).outcome !== 'refused') {
        granted++
      }

      const cold = wary.clubs[wary.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
    club.facilities.stadium.owned = true
    const owned = operatingCosts(state, club).groundRent
    club.facilities.stadium.owned = false
    const rented = operatingCosts(state, club).groundRent
    expect(rented).toBeGreaterThan(owned)
  })

  it('lets a club borrow for work it could never pay for in cash', () => {
    const state = freshWorld('BORROW')
    const club = state.clubs[state.playerClubId]
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
    const club = state.clubs[state.playerClubId]
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
