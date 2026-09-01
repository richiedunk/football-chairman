import { computed, shallowRef, triggerRef, ref } from 'vue'
import { defineStore } from 'pinia'
import { IdFactory } from '../engine/ids'
import { NameGenerator } from '../engine/names/generator'
import { Rng } from '../engine/rng'
import { advanceWeek } from '../engine/tick'
import { clearRatingCache } from '../engine/world/attributes'
import { sortTable } from '../engine/systems/board'
import { levelFor, levelProgress, nextLevel } from '../engine/systems/career'
import { blockingItems, pendingDecisionCount, unreadCount } from '../engine/systems/inbox'
import { resolveDecision } from '../engine/systems/decisions'
import { computeWageDemand, totalWageBill } from '../engine/systems/valuation'
import { isTransferWindowOpen, PHASE_LABELS, windowLabel } from '../engine/sim/schedule'
import {
  applyRenewal, evaluateRenewal, releasePlayer, type RenewalOffer, type RenewalResponse,
} from '../engine/systems/contracts'
import { demoteToAcademy, promoteToSenior } from '../engine/systems/academy'
import { openNegotiation } from '../engine/systems/transfers'
import { loanedIn, loanedOut, proposeLoanIn, proposeLoanOut, recallLoan } from '../engine/systems/loans'
import {
  autoRegister, isHomegrownFor, isRegistrationOpen, registerPlayer, squadRegistration,
  unregisterPlayer, type RegistrationResult,
} from '../engine/systems/registration'
import { AUTOSAVE_SLOT, loadGame, saveGame } from '../storage/saves'
import { playerClub } from '../engine/playerClub'
import { exerciseBuyBack } from '../engine/systems/buyBack'
import {
  canChangePhilosophy, philosophyById, setPhilosophy, type PhilosophyId,
} from '../engine/systems/recruitment'
import { SEARCH_STRIDE_WEEKS, advanceSearch } from '../engine/systems/jobSearch'
import { addNews } from '../engine/systems/inbox'
import { retrainPosition } from '../engine/systems/development'
import { agentsInvolvedWith, clientsOf, introductions } from '../engine/systems/agents'
import {
  generateOpportunities, isDeadlineWeek, type DeadlineOpportunity,
} from '../engine/systems/deadlineDay'
import { executeTransfer } from '../engine/systems/transfers'
import { canAfford } from '../engine/systems/finance'
import { haptic } from '../platform/native'
import { achievements } from '../platform/services'
import {
  achievement, ACHIEVEMENTS, earnedAchievements, type Achievement,
} from '../engine/systems/achievements'
import type {
  Club, Fixture, GameState, ID, InboxItem, League, MatchResult, Player, Position, Staff,
} from '../engine/types'

/**
 * The game store.
 *
 * GameState is held in a `shallowRef`, not a `reactive`. Vue's deep reactivity
 * would install proxies over ~18,000 players, ~500 clubs and every nested
 * object inside them — the conversion alone takes seconds, and every
 * simulation write then pays proxy overhead in the hot loop of the weekly
 * tick. The simulation is deliberately plain JavaScript and stays that way.
 *
 * Instead the store mutates the raw state and calls `commit()`, which bumps a
 * revision counter that every derived value depends on. Coarse, explicit, and
 * fast: one notification per user action rather than tens of thousands.
 */
export const useGameStore = defineStore('game', () => {
  const state = shallowRef<GameState | null>(null)
  /** Bumped after any mutation; every computed below reads it. */
  const revision = ref(0)
  const busy = ref(false)
  const busyMessage = ref('')

  /**
   * How long the loading screen stays up once it is up.
   *
   * A week tick measured 275ms at the median and 342ms at the mean before the
   * world went global, which is long enough to be worth covering and far too
   * short to read. The result was a screen that flashed — the reader
   * registered that something had happened without ever seeing what it said,
   * which is worse than no loading screen at all. So the work is floored:
   * whatever the tick costs, the screen is up long enough to read one line.
   *
   * A round second, deliberately. The line is the point of the screen and 900
   * milliseconds was cutting the longer ones fine.
   */
  const MIN_LOADING_MS = 1_000

  /**
   * ...except when a machine is reading it.
   *
   * The floor exists so a person can read one line. An end-to-end run reads
   * nothing, and paying a second per advance across a forty-five step
   * walkthrough is a minute of the suite spent waiting for an animation
   * nobody watches. The flag is set by the harness on the built bundle, so
   * production behaviour is unchanged and there is no way for it to be true
   * in a real browser session unless somebody sets it themselves.
   */
  function loadingFloorMs(): number {
    const w = globalThis as { __dofNoLoadingFloor?: boolean }
    return w.__dofNoLoadingFloor ? 0 : MIN_LOADING_MS
  }

  /**
   * Run blocking work behind the loading screen.
   *
   * Two things have to be true and neither happens by itself. The screen must
   * paint *before* the thread blocks — hence the frame yield, since the tick is
   * one synchronous call and Vue would otherwise flush the DOM update after it
   * had already finished. And it must still be up long enough to read.
   */
  async function withLoading<T>(message: string, work: () => T | Promise<T>): Promise<T> {
    busy.value = true
    busyMessage.value = message
    const shownAt = Date.now()
    try {
      // `await` rather than `return work()`: a bare return hands the promise
      // back before `finally` runs, so an asynchronous save would take the
      // screen down while it was still writing.
      await nextFrame()
      return await work()
    } finally {
      const floor = loadingFloorMs()
      const showing = Date.now() - shownAt
      if (showing < floor) await wait(floor - showing)
      busy.value = false
      busyMessage.value = ''
    }
  }

  let ids = new IdFactory(1)
  let names = new NameGenerator(new Rng('names'))

  /**
   * Signal that the state has changed and derived values must recompute.
   *
   * Bumping the revision counter is not enough on its own. Since Vue 3.4 a
   * computed stops propagating when it re-evaluates to the same value, and
   * `game` and `club` always return the *same object reference* — so a view
   * computed derived from either of them would never re-run, however many
   * times the revision changed. The symptom is a screen that shows stale data
   * until you navigate away and back, which is exactly how this was found:
   * awarding a stadium contract updated the state but not the page.
   *
   * Refreshing the identity of the two roots everything hangs off fixes it
   * everywhere at once, rather than requiring every view to remember to touch
   * the revision counter. Nested objects are shared, not copied, so existing
   * references to a club's finances or squad stay valid — only a stale
   * reference to a *top-level* club or state field would be missed, and the
   * engine always re-reads those from the tables.
   */
  function commit(): void {
    const current = state.value
    if (current) {
      const clubId = current.playerClubId
      const club = clubId ? current.clubs[clubId] : null
      if (clubId && club) current.clubs[clubId] = { ...club }
      state.value = { ...current }
    }
    revision.value++
    triggerRef(state)
  }

  function attach(next: GameState): void {
    clearRatingCache()
    // Loading a save must not announce every milestone the career ever
    // reached. Everything already earned is treated as already seen.
    announced.clear()
    for (const id of earnedAchievements(next)) announced.add(id)
    state.value = next
    ids = new IdFactory(next.nextId)
    names = new NameGenerator(new Rng(`${next.seed}:names`))
    names.registerExisting(
      Object.values(next.players).map((p) => `${p.firstName} ${p.lastName}`),
    )
    commit()
  }

  function attachWithFactories(
    next: GameState,
    factory: IdFactory,
    generator: NameGenerator,
  ): void {
    clearRatingCache()
    announced.clear()
    for (const id of earnedAchievements(next)) announced.add(id)
    state.value = next
    ids = factory
    names = generator
    commit()
  }

  // --- Core selectors -------------------------------------------------------

  const loaded = computed(() => {
    void revision.value
    return state.value !== null
  })

  const game = computed(() => {
    void revision.value
    return state.value
  })

  const club = computed<Club | null>(() => {
    void revision.value
    const s = state.value
    return s ? playerClub(s) : null
  })

  const league = computed<League | null>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? s.leagues[c.leagueId] ?? null : null
  })

  const nation = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? s.nations[c.nationId] ?? null : null
  })

  const currency = computed(() => {
    void revision.value
    return state.value?.settings.currency ?? 'GBP'
  })

  const dateLabel = computed(() => {
    void revision.value
    const s = state.value
    if (!s) return ''
    const shortNext = String((s.date.season + 1) % 100).padStart(2, '0')
    return `${s.date.season}/${shortNext} · Week ${s.date.week}`
  })

  const phaseLabel = computed(() => {
    void revision.value
    const s = state.value
    return s ? PHASE_LABELS[s.phase] ?? '' : ''
  })

  const transferWindow = computed(() => {
    void revision.value
    const s = state.value
    if (!s) return { open: false, label: '' }
    return { open: isTransferWindowOpen(s.date.week), label: windowLabel(s.date.week) }
  })

  /** Senior squad, ordered by ability. Academy players are listed separately. */
  /**
   * The senior squad, including players out on loan and those borrowed. Both
   * belong on the squad screen: one is an asset you still own and pay for, the
   * other is someone the coach can pick this Saturday.
   */
  const squad = computed<Player[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return [...c.squad, ...c.loanedIn]
      .map((id) => s.players[id])
      .filter((p): p is Player => Boolean(p) && !p.isAcademy)
      .sort((a, b) => b.currentAbility - a.currentAbility)
  })

  const academy = computed<Player[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return c.squad
      .map((id) => s.players[id])
      .filter((p): p is Player => Boolean(p) && p.isAcademy)
      .sort((a, b) => b.potentialAbility - a.potentialAbility)
  })

  const staff = computed<Staff[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return c.staff.map((id) => s.staff[id]).filter((m): m is Staff => Boolean(m))
  })

  const headCoach = computed<Staff | null>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c?.headCoachId ? s.staff[c.headCoachId] ?? null : null
  })

  const table = computed(() => {
    void revision.value
    const s = state.value
    const l = league.value
    if (!s || !l) return []
    return sortTable(s.tables[l.id] ?? [])
  })

  const leaguePosition = computed(() => {
    void revision.value
    const c = club.value
    if (!c) return 0
    return table.value.findIndex((row) => row.clubId === c.id) + 1
  })

  const inbox = computed<InboxItem[]>(() => {
    void revision.value
    return state.value?.inbox ?? []
  })

  const unread = computed(() => {
    void revision.value
    return state.value ? unreadCount(state.value) : 0
  })

  const pendingDecisions = computed(() => {
    void revision.value
    return state.value ? pendingDecisionCount(state.value) : 0
  })

  /** Urgent, undecided items block the week from advancing. */
  const blockers = computed<InboxItem[]>(() => {
    void revision.value
    return state.value ? blockingItems(state.value) : []
  })

  const wageBill = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? totalWageBill(s, c) : 0
  })

  /** True once the career has ended, whether by the calendar or by choice. */
  const retired = computed(() => {
    void revision.value
    return state.value?.director.retiredAtSeason !== undefined
  })

  /**
   * Stand down early. "Sixty-five at the latest" means the last day is fixed;
   * it does not mean you have to use all of it.
   */
  function retire(): void {
    const s = state.value
    if (!s || s.director.retiredAtSeason !== undefined) return
    s.director.retiredAtSeason = s.date.season
    s.director.retiredBecause = 'choice'
    s.director.jobOffers = []
    commit()
  }

  const career = computed(() => {
    void revision.value
    const s = state.value
    if (!s) return null
    return {
      level: levelFor(s.director.xp),
      next: nextLevel(s.director.xp),
      progress: levelProgress(s.director.xp),
      xp: s.director.xp,
      xpThisSeason: s.director.xpThisSeason,
    }
  })

  /** Remaining fixtures for the player's club, soonest first. */
  const upcomingFixtures = computed<Fixture[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return s.fixtures
      .filter(
        (f) =>
          (f.homeClubId === c.id || f.awayClubId === c.id)
          && f.season === s.date.season
          && !f.result,
      )
      .sort((a, b) => a.week - b.week)
  })

  const nextFixture = computed<Fixture | null>(() => upcomingFixtures.value[0] ?? null)

  const recentResults = computed<{ fixture: Fixture; result: MatchResult }[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return s.fixtures
      .filter(
        (f) =>
          (f.homeClubId === c.id || f.awayClubId === c.id)
          && f.season === s.date.season
          && f.result,
      )
      .sort((a, b) => b.week - a.week)
      .slice(0, 8)
      .map((f) => ({ fixture: f, result: f.result as MatchResult }))
  })

  // --- Out of work ----------------------------------------------------------

  /** True while the director has no club: sacked, and looking. */
  const betweenJobs = computed(() => {
    void revision.value
    const s = state.value
    return Boolean(s) && s!.playerClubId === null && s!.director.retiredAtSeason === undefined
  })

  /** The posts open right now. Sparse, and they change month to month. */
  const vacancies = computed(() => {
    void revision.value
    return state.value?.director.jobOffers ?? []
  })

  /**
   * Let a month go by. Some posts get filled by other people, one or two open
   * up, and the world plays four weeks of football without you.
   */
  async function checkBackNextMonth(): Promise<{ filled: string[]; opened: string[] }> {
    const s = state.value
    if (!s || s.playerClubId !== null) return { filled: [], opened: [] }
    return withLoading('A month goes by…', () => {
      for (let week = 0; week < SEARCH_STRIDE_WEEKS; week++) {
        lastTick.value = advanceWeek(s, { ids, names })
        if (s.director.retiredAtSeason !== undefined) break
      }
      const rng = new Rng(`${s.seed}:search:${s.date.season}:${s.date.week}`)
      const change = advanceSearch(s, idFactory(), rng)
      commit()
      return change
    })
  }

  /**
   * State a recruitment policy, and take what it costs.
   *
   * The cost is board confidence, applied here rather than in the view so the
   * rule holds however the call arrives — a policy you can change for nothing
   * by going the long way round is not a policy.
   */
  function statePhilosophy(to: PhilosophyId): { ok: boolean; message: string } {
    const s = state.value
    const c = playerClub(s!)
    if (!s || !c) return { ok: false, message: 'No club.' }

    const verdict = canChangePhilosophy(s, c, to)
    if (!verdict.ok) return { ok: false, message: verdict.reason }

    setPhilosophy(s, c, to)
    if (verdict.confidenceCost > 0) {
      c.board.confidence = Math.max(0, c.board.confidence - verdict.confidenceCost)
    }
    addNews(s, ids, 'board',
      `${c.name} state their recruitment policy: ${philosophyById(to).name.toLowerCase()}.`,
      { view: 'recruitment' }, c.id)
    commit()
    return {
      ok: true,
      message: verdict.confidenceCost > 0
        ? `Policy stated. The board have taken ${verdict.confidenceCost} off your confidence for it.`
        : 'Policy stated. Everyone now knows what kind of club this is.',
    }
  }

  /**
   * Bring back a player you sold, at the price agreed when you sold him.
   *
   * A contractual right rather than a negotiation — the club holding him has
   * no say, which is the whole point of having one. What it does not override
   * is the money or the squad place, so it goes through the same transfer
   * machinery as any other signing rather than teleporting him back.
   */
  function exerciseClause(playerId: ID): { ok: boolean; message: string } {
    const s = state.value
    const club = s ? playerClub(s) : null
    if (!s || !club) return { ok: false, message: 'No club.' }
    const player = s.players[playerId]
    if (!player) return { ok: false, message: 'That player is no longer in the game.' }

    const verdict = exerciseBuyBack(s, player, club)
    if (!verdict.ok) return verdict

    const clause = player.buyBack!
    const seller = player.clubId ? s.clubs[player.clubId] : null
    const league = s.leagues[club.leagueId]
    const nation = s.nations[club.nationId]

    executeTransfer(s, { ids, rng: new Rng(`${s.seed}:buyback:${playerId}`) }, {
      player,
      buyer: club,
      seller,
      fee: clause.price,
      kind: 'permanent',
      contract: {
        wage: Math.round(computeWageDemand(player, league, nation)),
        expiresSeason: s.date.season + 4,
        signingBonus: 0,
        releaseClause: null,
        appearanceFee: 0,
        goalBonus: 0,
        loyaltyBonus: 0,
        inNegotiation: false,
        weeksSinceRenewalRequest: 0,
      },
      agentFee: 0,
      sellOnPercentage: 0,
      buyBackPrice: 0,
      wageContribution: 0,
      loanUntilSeason: null,
    })
    // Exercised is spent: the right does not survive being used.
    player.buyBack = null
    addNews(s, ids, 'transfer',
      `${club.name} have exercised their buy-back on ${player.knownAs}.`,
      { view: 'player', id: player.id }, club.id)
    commit()
    return { ok: true, message: `${player.knownAs} is back.` }
  }

  // --- Match reports --------------------------------------------------------

  /**
   * Matches played this tick that the player has not read yet.
   *
   * Held as a queue rather than a single fixture because a cup replay and a
   * league game can land in the same week, and showing one while silently
   * dropping the other would lose a result the player is entitled to see.
   */
  const matchQueue = ref<ID[]>([])

  function queueMatchReports(fixtureIds: ID[]): void {
    matchQueue.value = [...fixtureIds]
  }

  /** Mark a report read. Returns the next one to show, or null when done. */
  function dismissMatchReport(fixtureId: ID): ID | null {
    matchQueue.value = matchQueue.value.filter((id) => id !== fixtureId)
    return matchQueue.value[0] ?? null
  }

  function fixtureById(id: ID): Fixture | null {
    void revision.value
    return state.value?.fixtures.find((f) => f.id === id) ?? null
  }

  // --- Lookups --------------------------------------------------------------

  function player(id: ID): Player | null {
    return state.value?.players[id] ?? null
  }
  function clubById(id: ID): Club | null {
    return state.value?.clubs[id] ?? null
  }
  function leagueById(id: ID): League | null {
    return state.value?.leagues[id] ?? null
  }
  function staffById(id: ID): Staff | null {
    return state.value?.staff[id] ?? null
  }

  // --- Actions --------------------------------------------------------------

  const lastTick = ref<ReturnType<typeof advanceWeek> | null>(null)

  /**
   * Advance one week. Refuses while urgent decisions are outstanding — that
   * refusal is what stops the game being played by mashing one button.
   */
  async function nextWeek(): Promise<{ ok: boolean; reason?: string }> {
    const s = state.value
    if (!s) return { ok: false, reason: 'No game loaded.' }
    // A finished career is finished. Sixty-five is a hard stop, and the one
    // way a rule like that loses its force is if the button still works.
    if (s.director.retiredAtSeason !== undefined) {
      return { ok: false, reason: 'Your career is over. There are no more weeks to play.' }
    }
    if (blockers.value.length > 0) {
      if (s.settings.hapticsEnabled) void haptic('warning')
      return {
        ok: false,
        reason: `${blockers.value.length} matter${blockers.value.length === 1 ? '' : 's'} need${blockers.value.length === 1 ? 's' : ''} your decision first.`,
      }
    }

    return withLoading('Advancing…', () => {
      lastTick.value = advanceWeek(s, { ids, names })
      commit()

      // Milestones are derived from the state that now exists, then handed to
      // the platform seam, which decides whether anyone is listening. They
      // land in the news feed rather than as a toast, because a toast would
      // be competing with the match result for the same two seconds.
      newAchievements.value = syncAchievements(s)
      for (const milestone of newAchievements.value) {
        addNews(s, ids, 'board', `Milestone reached — ${milestone.name}. ${milestone.description}`,
          { view: 'achievements' })
      }
      if (newAchievements.value.length > 0) commit()

      if (s.settings.hapticsEnabled) {
        // Weight the feedback by what actually happened: being sacked should
        // not feel the same as a quiet week.
        if (lastTick.value.sacked) void haptic('error')
        else if (lastTick.value.seasonEnded) void haptic('success')
        else if (lastTick.value.playerFixtures.length) void haptic('medium')
        else void haptic('light')
      }

      if (s.settings.autosave) {
        void autosave()
      }
      return { ok: true }
    })
  }

  /** Advance repeatedly until a fixture, a blocking decision, or `weeks`. */
  async function advanceUntilNextMatch(maxWeeks = 6): Promise<void> {
    for (let i = 0; i < maxWeeks; i++) {
      const result = await nextWeek()
      if (!result.ok) break
      if (lastTick.value?.playerFixtures.length) break
      if (lastTick.value?.seasonEnded || lastTick.value?.sacked) break
      if (blockers.value.length > 0) break
    }
  }

  async function autosave(): Promise<void> {
    const s = state.value
    if (!s) return
    try {
      s.nextId = ids.value
      await saveGame(s, AUTOSAVE_SLOT)
    } catch (error) {
      // A failed autosave must never interrupt play; the manual save screen
      // reports the real error.
      console.warn('Autosave failed', error)
    }
  }

  async function save(slotId: string, name?: string): Promise<void> {
    const s = state.value
    if (!s) throw new Error('No game to save.')
    s.nextId = ids.value
    await withLoading('Saving…', () => saveGame(s, slotId, name))
  }

  async function load(slotId: string): Promise<boolean> {
    return withLoading('Loading…', async () => {
      const next = await loadGame(slotId)
      if (!next) return false
      attach(next)
      return true
    })
  }

  /** Answer an inbox decision. */
  function decide(itemId: ID, optionId: string): string {
    const s = state.value
    if (!s) return ''
    const item = s.inbox.find((i) => i.id === itemId)
    if (!item?.decision || item.decision.chosenId !== null) return ''
    const outcome = resolveDecision(s, item, optionId, {
      rng: new Rng(`${s.seed}:decision:${itemId}:${optionId}`),
      ids,
    })
    commit()
    return outcome
  }

  function markRead(itemId: ID): void {
    const s = state.value
    if (!s) return
    const item = s.inbox.find((i) => i.id === itemId)
    if (item && !item.read) {
      item.read = true
      commit()
    }
  }

  function markAllRead(): void {
    const s = state.value
    if (!s) return
    for (const item of s.inbox) item.read = true
    commit()
  }

  // --- Player actions -------------------------------------------------------

  function toggleShortlist(playerId: ID): boolean {
    const s = state.value
    if (!s) return false
    const index = s.shortlist.indexOf(playerId)
    if (index >= 0) s.shortlist.splice(index, 1)
    else s.shortlist.push(playerId)
    commit()
    return s.shortlist.includes(playerId)
  }

  function isShortlisted(playerId: ID): boolean {
    void revision.value
    return state.value?.shortlist.includes(playerId) ?? false
  }

  function setTransferListed(playerId: ID, listed: boolean): void {
    const p = state.value?.players[playerId]
    if (!p) return
    p.listedForTransfer = listed
    if (listed) p.squadStatus = 'surplus'
    commit()
  }

  function setLoanListed(playerId: ID, listed: boolean): void {
    const p = state.value?.players[playerId]
    if (!p) return
    p.listedForLoan = listed
    commit()
  }

  function setSquadStatus(playerId: ID, status: Player['desiredStatus']): void {
    const p = state.value?.players[playerId]
    if (!p) return
    // Promising a player a role is a commitment the morale system holds you to.
    p.desiredStatus = status
    p.squadStatus = status
    commit()
  }

  function renew(playerId: ID, offer: RenewalOffer): RenewalResponse {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    if (!s || !c || !p) {
      return { accepted: false, message: 'That player is not available.' }
    }
    const rng = new Rng(`${s.seed}:renew:${playerId}:${s.date.week}:${offer.wage}`)
    const response = evaluateRenewal(s, c, p, offer, rng)
    if (response.accepted) applyRenewal(s, c, p, offer)
    commit()
    return response
  }

  function release(playerId: ID): { ok: boolean; message: string } {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    if (!s || !c || !p) return { ok: false, message: 'That player is not available.' }
    const result = releasePlayer(s, c, p)
    commit()
    return result.ok
      ? { ok: true, message: `${p.knownAs} released. Settlement cost ${result.cost.toLocaleString()}.` }
      : { ok: false, message: result.error }
  }

  function promote(playerId: ID): { ok: boolean; message: string } {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    if (!s || !c || !p) return { ok: false, message: 'That player is not available.' }
    const result = promoteToSenior(s, c, p)
    commit()
    return result.ok
      ? { ok: true, message: `${p.knownAs} promoted to the senior squad.` }
      : { ok: false, message: result.error }
  }

  /**
   * Send a young player back to the academy.
   *
   * The reason a director does this is the squad list: an academy player does
   * not take a registration place, so demoting a boy who is not going to play
   * frees a place for somebody who is. It costs him the senior environment,
   * which is the trade.
   */
  function demote(playerId: ID): { ok: boolean; message: string } {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    if (!s || !c || !p) return { ok: false, message: 'That player is not available.' }
    const result = demoteToAcademy(c, p)
    commit()
    return result.ok
      ? { ok: true, message: `${p.knownAs} has gone back to the academy and given up his squad place.` }
      : { ok: false, message: result.error }
  }

  /**
   * Retrain a player in a new position.
   *
   * Permanent, and it costs him: his attributes are rebuilt for the new role
   * at a little under what he was worth in the old one, and the old position
   * stays on his card as one he can still fill. The seed is fixed on the
   * player, the position and the week, so the same decision made twice from
   * the same save produces the same footballer.
   *
   * A goalkeeper is a different sport and the conversion is refused both ways.
   */
  function retrain(playerId: ID, position: Position): { ok: boolean; message: string } {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    if (!s || !c || !p) return { ok: false, message: 'That player is not available.' }
    if (p.clubId !== c.id) return { ok: false, message: 'He is not ours to retrain.' }
    if (p.isAcademy) return { ok: false, message: 'Promote him first — the academy picks its own roles.' }
    if (p.position === position) return { ok: false, message: `${p.knownAs} already plays there.` }
    if ((p.position === 'GK') !== (position === 'GK')) {
      return { ok: false, message: 'Nobody retrains into or out of goal. It is a different job.' }
    }
    if (p.injury && p.injury.weeksRemaining > 0) {
      return { ok: false, message: `${p.knownAs} is injured. This is work for a fit player.` }
    }
    const was = p.position
    const before = p.currentAbility
    retrainPosition(new Rng(`${s.seed}:retrain:${playerId}:${position}:${s.date.week}`), p, position)
    commit()
    return {
      ok: true,
      message: `${p.knownAs} is a ${position} now, and still covers ${was}. `
        + `Ability ${before} to ${p.currentAbility} — the coaches will get some of that back.`,
    }
  }

  function bid(
    playerId: ID,
    fee: number,
    kind: 'permanent' | 'loan' = 'permanent',
  ): { ok: boolean; message: string } {
    const s = state.value
    if (!s) return { ok: false, message: 'No game loaded.' }
    const rng = new Rng(`${s.seed}:bid:${playerId}:${s.date.week}`)
    if (!s.playerClubId) return { ok: false, message: 'You have no club.' }
    const result = openNegotiation(s, { rng, ids }, playerId, s.playerClubId, kind, fee)
    commit()
    if ('error' in result) return { ok: false, message: result.error }
    const p = s.players[playerId]
    return { ok: true, message: `Enquiry made for ${p?.knownAs ?? 'the player'}.` }
  }

  // --- Loans ----------------------------------------------------------------

  function loanOut(
    playerId: ID,
    toClubId: ID,
    wageShare: number,
    seasons = 1,
  ): { ok: boolean; message: string } {
    const s = state.value
    if (!s) return { ok: false, message: 'No game loaded.' }
    const result = proposeLoanOut(
      s, { rng: new Rng(`${s.seed}:loanout:${playerId}:${s.date.week}`), ids },
      playerId, toClubId, wageShare, seasons,
    )
    commit()
    return result
  }

  function loanIn(playerId: ID, wageShare: number): { ok: boolean; message: string } {
    const s = state.value
    if (!s) return { ok: false, message: 'No game loaded.' }
    const result = proposeLoanIn(
      s, { rng: new Rng(`${s.seed}:loanin:${playerId}:${s.date.week}`), ids },
      playerId, wageShare,
    )
    commit()
    return result
  }

  function recall(playerId: ID): { ok: boolean; message: string } {
    const s = state.value
    if (!s) return { ok: false, message: 'No game loaded.' }
    const result = recallLoan(s, playerId)
    commit()
    return result
  }

  const loansOut = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? loanedOut(s, c) : []
  })

  const loansIn = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? loanedIn(s, c) : []
  })

  // --- Achievements ---------------------------------------------------------

  /** Earned since the last tick, for the UI to announce. */
  const newAchievements = ref<Achievement[]>([])

  /** Milestones already shown to the player, so none is announced twice. */
  const announced = new Set<string>()

  /**
   * Report every milestone this save has reached.
   *
   * The seam is idempotent, so this hands over the whole set each time rather
   * than trying to work out a delta — that bookkeeping belongs on the platform
   * side, where it differs between Play Games and Game Center.
   */
  function syncAchievements(s: GameState): Achievement[] {
    const earned = earnedAchievements(s)
    const fresh: Achievement[] = []
    for (const id of earned) {
      if (announced.has(id)) continue
      announced.add(id)
      const found = achievement(id)
      if (found) fresh.push(found)
    }
    void achievements.report([...earned])
    return fresh
  }

  const achievementProgress = computed(() => {
    void revision.value
    const s = state.value
    const earned = s ? earnedAchievements(s) : new Set<string>()
    return ACHIEVEMENTS.map((entry) => ({ ...entry, earned: earned.has(entry.id) }))
  })

  // --- Deadline day ---------------------------------------------------------

  const isDeadline = computed(() => {
    void revision.value
    const s = state.value
    return s ? isDeadlineWeek(s.date.week) : false
  })

  /**
   * What is on the desk in the last hours.
   *
   * Held rather than recomputed, because the whole point is that the offers
   * are a fixed set with a clock on them: regenerating on every render would
   * mean the one you were reading vanished as you reached for it.
   */
  const deadlineOffers = ref<DeadlineOpportunity[]>([])
  const deadlineTaken = ref<Set<ID>>(new Set())

  function refreshDeadline(): void {
    const s = state.value
    const c = club.value
    if (!s || !c || !isDeadlineWeek(s.date.week)) {
      deadlineOffers.value = []
      deadlineTaken.value = new Set()
      return
    }
    const seed = `${s.seed}:deadline:${s.date.season}:${s.date.week}`
    deadlineOffers.value = generateOpportunities(s, c, new Rng(seed))
  }

  /** Take a deadline offer at the price on it. No haggling; that is the point. */
  function takeDeadlineOffer(offer: DeadlineOpportunity): { ok: boolean; message: string } {
    const s = state.value
    const c = club.value
    if (!s || !c) return { ok: false, message: 'No game loaded.' }
    if (deadlineTaken.value.has(offer.playerId)) {
      return { ok: false, message: 'That one has already gone.' }
    }
    const player = s.players[offer.playerId]
    if (!player) return { ok: false, message: 'He has signed elsewhere.' }

    const affordable = canAfford(s, c, offer.fee, offer.wage)
    if (!affordable.ok) return { ok: false, message: affordable.reason ?? 'The club cannot do it.' }

    executeTransfer(s, { rng: new Rng(`${s.seed}:deadlinedeal:${offer.playerId}`), ids }, {
      player,
      buyer: c,
      seller: offer.clubId ? s.clubs[offer.clubId] ?? null : null,
      fee: offer.fee,
      kind: offer.clubId ? 'permanent' : 'free',
      contract: {
        wage: offer.wage,
        expiresSeason: s.date.season + (player.age <= 24 ? 4 : 3),
        signingBonus: 0,
        releaseClause: null,
        appearanceFee: 0,
        goalBonus: 0,
        loyaltyBonus: 0,
        inNegotiation: false,
        weeksSinceRenewalRequest: 0,
      },
      agentFee: Math.round(offer.wage * 52 * 0.08),
      sellOnPercentage: 0,
      wageContribution: 0,
      loanUntilSeason: null,
    })
    deadlineTaken.value = new Set([...deadlineTaken.value, offer.playerId])
    commit()
    return { ok: true, message: `${offer.playerName} signs. ${
      offer.kind === 'hijack' ? 'He was minutes from signing somewhere else.' : ''
    }`.trim() }
  }

  // --- Ownership ------------------------------------------------------------

  const owner = computed(() => {
    void revision.value
    return club.value?.board.owner ?? null
  })

  /** A takeover of your club, if one is under way. */
  const takeover = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return null
    return s.takeovers.find((t) => t.clubId === c.id) ?? null
  })

  /** Takeovers elsewhere that the press know about. */
  const worldTakeovers = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return s.takeovers.filter((t) => t.public && t.clubId !== c.id).slice(0, 8)
  })

  // --- Agents ---------------------------------------------------------------

  const agents = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? agentsInvolvedWith(s, c) : []
  })

  const agentIntroductions = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? introductions(s, c) : []
  })

  function agentClients(agentId: ID) {
    void revision.value
    const s = state.value
    const agent = s?.agents[agentId]
    return s && agent ? clientsOf(s, agent) : []
  }

  // --- Squad registration ---------------------------------------------------

  const registration = computed(() => {
    void revision.value
    const s = state.value
    const c = club.value
    return s && c ? squadRegistration(s, c) : null
  })

  const registrationOpen = computed(() => {
    void revision.value
    const s = state.value
    return s ? isRegistrationOpen(s.date.week) : false
  })

  function register(playerId: ID): RegistrationResult {
    const s = state.value
    const c = club.value
    if (!s || !c) return { ok: false, message: 'No game loaded.' }
    const p = s.players[playerId]
    if (!p) return { ok: false, message: 'No such player.' }
    const result = registerPlayer(s, c, p)
    commit()
    return result
  }

  function unregister(playerId: ID): RegistrationResult {
    const s = state.value
    const c = club.value
    if (!s || !c) return { ok: false, message: 'No game loaded.' }
    const p = s.players[playerId]
    if (!p) return { ok: false, message: 'No such player.' }
    const result = unregisterPlayer(s, c, p)
    commit()
    return result
  }

  /** Hand the form to the club secretary and take whatever list he produces. */
  function autoPickSquad(): void {
    const s = state.value
    const c = club.value
    if (!s || !c || !isRegistrationOpen(s.date.week)) return
    autoRegister(s, c)
    commit()
  }

  function isHomegrown(playerId: ID): boolean {
    const s = state.value
    const c = club.value
    const p = s?.players[playerId]
    return Boolean(s && c && p && isHomegrownFor(p, c))
  }

  function idFactory(): IdFactory {
    return ids
  }

  function nameGenerator(): NameGenerator {
    return names
  }

  function reset(): void {
    state.value = null
    lastTick.value = null
    clearRatingCache()
    commit()
  }

  return {
    // state
    state, revision, busy, busyMessage, lastTick,
    // selectors
    loaded, game, club, league, nation, currency, dateLabel, phaseLabel, transferWindow,
    squad, academy, staff, headCoach, table, leaguePosition,
    inbox, unread, pendingDecisions, blockers, wageBill, career, retired, retire,
    matchQueue, queueMatchReports, dismissMatchReport, fixtureById,
    betweenJobs, vacancies, checkBackNextMonth,
    upcomingFixtures, nextFixture, recentResults,
    // lookups
    player, clubById, leagueById, staffById,
    // actions
    attach, attachWithFactories, commit, nextWeek, advanceUntilNextMatch,
    save, load, autosave, markRead, markAllRead, decide,
    toggleShortlist, isShortlisted, setTransferListed, setLoanListed, setSquadStatus,
    renew, release, promote, demote, retrain, bid,
    loanOut, loanIn, recall, loansOut, loansIn,
    registration, registrationOpen, register, unregister, autoPickSquad, isHomegrown,
    achievementProgress, newAchievements,
    agents, agentIntroductions, agentClients,
    owner, takeover, worldTakeovers,
    isDeadline, deadlineOffers, deadlineTaken, refreshDeadline, takeDeadlineOffer,
    statePhilosophy, exerciseClause,
    idFactory, nameGenerator, reset,
  }
})

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
