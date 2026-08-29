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
import { totalWageBill } from '../engine/systems/valuation'
import { isTransferWindowOpen, PHASE_LABELS, windowLabel } from '../engine/sim/schedule'
import {
  applyRenewal, evaluateRenewal, releasePlayer, type RenewalOffer, type RenewalResponse,
} from '../engine/systems/contracts'
import { promoteToSenior } from '../engine/systems/academy'
import { openNegotiation } from '../engine/systems/transfers'
import { AUTOSAVE_SLOT, loadGame, saveGame } from '../storage/saves'
import { haptic } from '../platform/native'
import type {
  Club, Fixture, GameState, ID, InboxItem, League, MatchResult, Player, Staff,
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

  let ids = new IdFactory(1)
  let names = new NameGenerator(new Rng('names'))

  /** Signal that the state has changed and derived values must recompute. */
  function commit(): void {
    revision.value++
    triggerRef(state)
  }

  function attach(next: GameState): void {
    clearRatingCache()
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
    return s ? s.clubs[s.playerClubId] ?? null : null
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
  const squad = computed<Player[]>(() => {
    void revision.value
    const s = state.value
    const c = club.value
    if (!s || !c) return []
    return c.squad
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
    if (blockers.value.length > 0) {
      if (s.settings.hapticsEnabled) void haptic('warning')
      return {
        ok: false,
        reason: `${blockers.value.length} matter${blockers.value.length === 1 ? '' : 's'} need${blockers.value.length === 1 ? 's' : ''} your decision first.`,
      }
    }

    busy.value = true
    busyMessage.value = 'Advancing…'
    try {
      // Yield a frame so the spinner paints before the tick blocks the thread.
      await nextFrame()
      lastTick.value = advanceWeek(s, { ids, names })
      commit()

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
    } finally {
      busy.value = false
      busyMessage.value = ''
    }
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
    busy.value = true
    busyMessage.value = 'Saving…'
    try {
      s.nextId = ids.value
      await saveGame(s, slotId, name)
    } finally {
      busy.value = false
      busyMessage.value = ''
    }
  }

  async function load(slotId: string): Promise<boolean> {
    busy.value = true
    busyMessage.value = 'Loading…'
    try {
      const next = await loadGame(slotId)
      if (!next) return false
      attach(next)
      return true
    } finally {
      busy.value = false
      busyMessage.value = ''
    }
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

  function bid(
    playerId: ID,
    fee: number,
    kind: 'permanent' | 'loan' = 'permanent',
  ): { ok: boolean; message: string } {
    const s = state.value
    if (!s) return { ok: false, message: 'No game loaded.' }
    const rng = new Rng(`${s.seed}:bid:${playerId}:${s.date.week}`)
    const result = openNegotiation(s, { rng, ids }, playerId, s.playerClubId, kind, fee)
    commit()
    if ('error' in result) return { ok: false, message: result.error }
    const p = s.players[playerId]
    return { ok: true, message: `Enquiry made for ${p?.knownAs ?? 'the player'}.` }
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
    inbox, unread, pendingDecisions, blockers, wageBill, career,
    upcomingFixtures, nextFixture, recentResults,
    // lookups
    player, clubById, leagueById, staffById,
    // actions
    attach, attachWithFactories, commit, nextWeek, advanceUntilNextMatch,
    save, load, autosave, markRead, markAllRead, decide,
    toggleShortlist, isShortlisted, setTransferListed, setLoanListed, setSquadStatus,
    renew, release, promote, bid,
    idFactory, nameGenerator, reset,
  }
})

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}
