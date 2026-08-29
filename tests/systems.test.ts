import { describe, expect, it, beforeEach } from 'vitest'
import { generateWorld } from '../src/engine/world/worldGen'
import { Rng } from '../src/engine/rng'
import { IdFactory } from '../src/engine/ids'
import { executeTransfer, moveAppeal } from '../src/engine/systems/transfers'
import { buildReport, starsForLeague } from '../src/engine/systems/scouting'
import { evaluateRenewal, suggestRenewal } from '../src/engine/systems/contracts'
import { awardXp, CAREER_LEVELS, canTakeJobAt, levelFor, levelProgress } from '../src/engine/systems/career'
import { availableStaff, dismissStaff, hireStaff } from '../src/engine/systems/board'
import { expectedWage } from '../src/engine/world/staffGen'
import { issueBriefing, checkForExposure } from '../src/engine/systems/media'
import { computeValue, formatMoney, totalWageBill } from '../src/engine/systems/valuation'
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
