<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import PosBadge from '../components/PosBadge.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import {
  WINDOW_MINUTES, frameAt, offerHoursLeft, windowMs,
} from '../../engine/systems/deadlineClock'
import type { DeadlineOpportunity } from '../../engine/systems/deadlineDay'

/**
 * Deadline day.
 *
 * Deliberately a different screen to the transfers page rather than a mode on
 * it. Everything here is take-it-or-leave-it: there is no negotiation, no
 * counter-offer and no shortlist, because the thing being simulated is having
 * to decide now.
 */
const store = useGameStore()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

/**
 * The live clock.
 *
 * Held here rather than in the store because it is presentation and nothing
 * else: no tick runs, no state is written, and leaving the screen ends it. A
 * clock in the store would be a clock that kept running while you were in the
 * squad list, which is a different and much worse feature.
 *
 * `elapsed` is measured against a start timestamp rather than accumulated by
 * the interval, so a browser that throttles a backgrounded tab does not hand
 * back a day that ran slow while nobody was looking.
 */
const TOTAL = windowMs(WINDOW_MINUTES)
const startedAt = ref<number | null>(null)
const elapsed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

const live = computed(() => store.game?.settings.liveDeadline === true)

function stopClock(): void {
  if (ticker !== null) clearInterval(ticker)
  ticker = null
}

function startClock(): void {
  stopClock()
  startedAt.value = Date.now()
  elapsed.value = 0
  // Four times a second: enough that the minute figure moves smoothly, far
  // short of anything that would cost a frame on a phone.
  ticker = setInterval(() => {
    if (startedAt.value === null) return
    elapsed.value = Date.now() - startedAt.value
    if (elapsed.value >= TOTAL) {
      elapsed.value = TOTAL
      stopClock()
    }
  }, 250)
}

/** End it now. Never a trap: one tap settles the window at once. */
function shutNow(): void {
  stopClock()
  elapsed.value = TOTAL
}

onMounted(() => {
  store.refreshDeadline()
  if (live.value && store.isDeadline) startClock()
})

onBeforeUnmount(stopClock)

const frame = computed(() =>
  frameAt(store.deadlineOffers, live.value ? elapsed.value : 0, TOTAL))

/**
 * What is on the desk.
 *
 * With the clock off this is every offer, exactly as before. With it on, the
 * ones that have gone stay on screen greyed rather than disappearing — a row
 * that vanishes under your thumb reads as a bug, and seeing what you missed
 * is most of the point.
 */
const offers = computed(() => store.deadlineOffers)

function lapsed(offer: DeadlineOpportunity): boolean {
  return live.value && frame.value.gone.some((o) => o.playerId === offer.playerId)
}

function hoursOn(offer: DeadlineOpportunity): number {
  return live.value
    ? Math.ceil(offerHoursLeft(offer, elapsed.value, TOTAL))
    : offer.hours
}
const taken = computed(() => store.deadlineTaken)
const budget = computed(() => store.club?.finances.transferBudget ?? 0)

const busy = ref<string | null>(null)

const KIND_LABEL: Record<DeadlineOpportunity['kind'], string> = {
  hijack: 'Hijack',
  available: 'Cut price',
  approach: 'Available',
}
const KIND_CLASS: Record<DeadlineOpportunity['kind'], string> = {
  hijack: 'chip--gold',
  available: 'chip--accent',
  approach: 'chip--info',
}

function take(offer: DeadlineOpportunity) {
  if (lapsed(offer)) {
    notify?.('That one has gone.', 'error')
    return
  }
  busy.value = offer.playerId
  const result = store.takeDeadlineOffer(offer)
  busy.value = null
  notify?.(result.message, result.ok ? 'success' : 'error')
}

function player(id: string) {
  return store.player(id)
}
</script>

<template>
  <div v-if="store.isDeadline">
    <div class="card" style="background: var(--warn-wash)">
      <div class="card__body">
        <div class="row row--between" style="align-items: flex-start">
          <div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.025em; color: var(--warn)">
            {{ live && frame.shut ? 'The window has shut' : 'The window shuts tonight' }}
          </div>
          <!-- The clock is the loudest number on the screen when it is
               running, because the whole point of the day is that it is. -->
          <div v-if="live" class="deadline-clock num" :class="{ 'is-out': frame.shut }">
            {{ frame.face }}
          </div>
        </div>
        <p class="small muted" style="margin: 7px 0 0">
          Everything here is take it or leave it. Nobody is negotiating and nobody is
          calling back.
        </p>
        <div v-if="live && !frame.shut" class="deadline-track">
          <div class="deadline-track__fill" :style="{ width: `${(1 - frame.progress) * 100}%` }" />
        </div>
      </div>
      <div class="divider" />
      <div class="card__body">
        <div class="row row--between small">
          <span class="muted">Transfer budget</span>
          <span class="bold num">{{ formatMoney(budget, store.currency) }}</span>
        </div>
      </div>
    </div>

    <div class="section-title">On the desk</div>
    <div class="card">
      <div class="list">
        <div
          v-for="offer in offers"
          :key="offer.playerId"
          class="list__row list__row--static"
          :style="taken.has(offer.playerId) || lapsed(offer) ? 'opacity: 0.4' : ''"
        >
          <PosBadge v-if="player(offer.playerId)" :position="player(offer.playerId)!.position" />
          <div class="list__main">
            <div class="list__primary">
              {{ offer.playerName }}
              <span class="chip" :class="KIND_CLASS[offer.kind]">{{ KIND_LABEL[offer.kind] }}</span>
            </div>
            <div class="list__secondary" style="white-space: normal">
              {{ offer.clubName }} · {{ formatMoney(offer.fee, store.currency) }} ·
              {{ formatWage(offer.wage, store.currency) }}/wk
            </div>
            <div class="tiny faint" style="white-space: normal; margin-top: 2px">
              {{ offer.note }}
            </div>
          </div>
          <div class="list__trail">
            <div
              class="list__sub"
              :style="{ color: lapsed(offer) ? 'var(--text-fainter)' : 'var(--warn)' }"
            >{{ lapsed(offer) ? 'Gone' : `${hoursOn(offer)}h` }}</div>
            <button
              v-if="!taken.has(offer.playerId) && !lapsed(offer)"
              class="btn btn--primary btn--sm mt"
              :disabled="busy === offer.playerId || offer.fee > budget"
              @click="take(offer)"
            >Do it</button>
            <!-- Nothing for a lapsed offer: the hours slot beside it already
                 says "Gone", and saying it twice in one row is noise. -->
            <div v-else-if="taken.has(offer.playerId)" class="tiny faint mt">Signed</div>
          </div>
        </div>
        <div v-if="offers.length === 0" class="empty">
          Nothing has come across the desk. Some deadline days are like that.
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <!-- The escape hatch, and the reason a clock on this screen is not a
           trap: it can always be ended, and ending it settles at once. -->
      <button v-if="live && !frame.shut" class="btn btn--ghost" @click="shutNow">
        Shut it now
      </button>
      <button class="btn btn--ghost" @click="router.push('/transfers')">Transfers</button>
      <button class="btn btn--ghost" @click="router.push('/inbox')">Inbox</button>
    </div>
  </div>

  <div v-else>
    <div class="card">
      <div class="card__body" style="text-align: center">
        <div class="bold">The window is not closing today</div>
        <p class="small muted" style="margin: 8px 0 0">
          Deadline day is the last week of each window. Come back then, when everybody
          else has run out of time too.
        </p>
      </div>
    </div>
    <div class="btn-row mt">
      <button class="btn btn--ghost btn--block" @click="router.push('/transfers')">
        Back to transfers
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * The clock, and the bar under it.
 *
 * Tabular figures, because a proportional face jitters sideways every time a
 * digit changes and a countdown that wobbles reads as broken rather than as
 * urgent.
 */
.deadline-clock {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--warn);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.deadline-clock.is-out { color: var(--text-fainter); }

.deadline-track {
  height: 3px;
  border-radius: 2px;
  background: var(--track);
  margin-top: 12px;
  overflow: hidden;
}
.deadline-track__fill {
  height: 100%;
  background: var(--warn);
  /* Matches the tick interval, so the bar slides rather than stepping. */
  transition: width 250ms linear;
}
</style>
