<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import PosBadge from '../components/PosBadge.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { WINDOW_CHOICES } from '../../engine/systems/deadlineClock'
import AppSheet from '../components/AppSheet.vue'
import { SUMMER_DEADLINE_WEEK, WINTER_DEADLINE_WEEK, type DeadlineOpportunity } from '../../engine/systems/deadlineDay'
import { isTransferWindowOpen, windowLabel } from '../../engine/sim/schedule'

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
 * Opening the day.
 *
 * The clock itself lives in the store, because an hour-long window has to
 * keep running while you go and look at a player's profile or the finances —
 * which is what deadline day is actually like, and which a clock owned by
 * this component could not survive.
 *
 * What is left here is the question. Even with the setting on, the day opens
 * by asking rather than by starting, because a timer that begins the moment a
 * screen loads is a timer nobody agreed to, and because the length is a real
 * choice: an hour is a commitment and the game is in no position to know who
 * has one spare.
 */
const asking = ref(false)
const declined = ref(false)

const enabled = computed(() => store.game?.settings.liveDeadline === true)
const live = computed(() => store.deadlineLive)
const frame = computed(() => store.deadlineFrame)

onMounted(() => {
  store.refreshDeadline()
  // Asked once per visit, and not at all if the day has already been opened,
  // already been declined, or there is nothing on the desk to hurry over.
  if (enabled.value && store.isDeadline && !live.value && !declined.value) {
    asking.value = store.deadlineOffers.length > 0
  }
})

function open(minutes: number): void {
  asking.value = false
  store.startDeadlineClock(minutes)
}

function playUntimed(): void {
  asking.value = false
  declined.value = true
}

function lapsed(offer: DeadlineOpportunity): boolean {
  const f = frame.value
  return !!f && f.gone.some((o) => o.playerId === offer.playerId)
}

/** Read off the frame, so every row is showing the same instant. */
function hoursOn(offer: DeadlineOpportunity): number {
  return frame.value?.remaining[offer.playerId] ?? offer.hours
}

const offers = computed(() => store.deadlineOffers)
const taken = computed(() => store.deadlineTaken)
const budget = computed(() => store.club?.finances.transferBudget ?? 0)
const busy = ref<string | null>(null)

/**
 * The season as a strip of fifty-two weeks, windows shaded and the two
 * deadline days marked, for the weeks when this screen has nothing on it.
 * "Come back later" is only useful if it says when.
 */
const week = computed(() => store.game?.date.week ?? 1)
const seasonWeeks = Array.from({ length: 52 }, (_, i) => i + 1)
const nextDeadline = computed(() => {
  const w = week.value
  const ahead = [SUMMER_DEADLINE_WEEK, WINTER_DEADLINE_WEEK]
    .map((d) => ({ week: d, away: (d - w + 52) % 52 }))
    .filter((d) => d.away > 0)
    .sort((a, b) => a.away - b.away)[0]
  return { ...ahead, label: ahead.week === WINTER_DEADLINE_WEEK ? 'Winter deadline' : 'Summer deadline' }
})
const windowNow = computed(() => (isTransferWindowOpen(week.value) ? windowLabel(week.value) : null))

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
            {{ frame?.shut ? 'The window has shut' : 'The window shuts tonight' }}
          </div>
          <!-- The clock is the loudest number on the screen when it is
               running, because the whole point of the day is that it is. -->
          <div v-if="frame" class="deadline-clock num" :class="{ 'is-out': frame.shut }">
            {{ frame.face }}
          </div>
        </div>
        <p class="small muted" style="margin: 7px 0 0">
          Everything here is take it or leave it. Nobody is negotiating and nobody is
          calling back.
        </p>
        <div v-if="frame && !frame.shut" class="deadline-track">
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

    <!-- The question that opens the day. Asked rather than assumed, and it
         carries the length choice because an hour is a real commitment. -->
    <AppSheet
      v-if="asking"
      title="Play it out?"
      subtitle="The window can run to a real clock"
      @close="playUntimed"
    >
      <p class="small muted" style="margin: 0 0 14px">
        Offers expire while you read them and nobody comes back. The clock
        keeps running while you look at players, the table or the books, and
        you can shut it early whenever you like.
      </p>
      <!-- One accent action, as everywhere else: the first choice is the
           recommendation and the rest are alternatives. Three lime buttons
           meant none of them was the primary one. -->
      <div class="col">
        <button
          v-for="(choice, i) in WINDOW_CHOICES"
          :key="choice.minutes"
          class="btn btn--block mb deadline-choice"
          :class="i === 0 ? 'btn--primary' : 'btn--ghost'"
          @click="open(choice.minutes)"
        >
          <span class="deadline-choice__label">{{ choice.label }}</span>
          <span class="deadline-choice__detail">{{ choice.detail }}</span>
        </button>
      </div>
      <template #footer>
        <button class="btn btn--ghost btn--block" @click="playUntimed">
          Not today — no clock
        </button>
      </template>
    </AppSheet>

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
      <button
        v-if="frame && !frame.shut"
        class="btn btn--ghost"
        @click="store.shutDeadlineWindow()"
      >
        Shut it now
      </button>
      <button class="btn btn--ghost" @click="router.push('/transfers')">Transfers</button>
      <button class="btn btn--ghost" @click="router.push('/inbox')">Inbox</button>
    </div>
  </div>

  <div v-else>
    <div class="card">
      <div class="card__body deadline-wait">
        <div class="deadline-clock is-out num">{{ String(nextDeadline.away).padStart(2, '0') }}</div>
        <div>
          <div class="bold">The window is not closing today</div>
          <div class="small muted">
            {{ nextDeadline.away === 1 ? 'One week' : `${nextDeadline.away} weeks` }} to the
            {{ nextDeadline.label.toLowerCase() }}, week {{ nextDeadline.week }}
          </div>
          <div class="tiny" :style="{ color: windowNow ? 'var(--win)' : 'var(--text-faint)', marginTop: '4px' }">
            {{ windowNow ? `${windowNow} is open` : 'The window is shut' }}
          </div>
        </div>
      </div>
      <div class="card__body" style="border-top: 1px solid var(--border)">
        <div class="season-strip" aria-hidden="true">
          <i
            v-for="w in seasonWeeks"
            :key="w"
            :class="{
              'is-window': isTransferWindowOpen(w),
              'is-deadline': w === SUMMER_DEADLINE_WEEK || w === WINTER_DEADLINE_WEEK,
              'is-now': w === week,
            }"
          />
        </div>
        <div class="season-strip__legend tiny faint">
          <span><i class="is-now" />This week</span>
          <span><i class="is-window" />Window open</span>
          <span><i class="is-deadline" />Deadline day</span>
        </div>
        <p class="small muted" style="margin: 12px 0 0">
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
/* A stadium clock: amber digits on a black plate, glowing, and breathing
   while the window is still open. */
@keyframes clock-glow {
  50% { text-shadow: 0 0 6px rgba(255, 176, 32, 0.4); }
}
.deadline-clock {
  padding: 6px 10px 5px;
  border-radius: 6px;
  background: #050607;
  border: 1px solid rgba(255, 176, 32, 0.35);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.8);
  font-family: var(--font-mono);
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
  color: var(--warn);
  text-shadow: 0 0 14px rgba(255, 176, 32, 0.7);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  animation: clock-glow 1.4s ease-in-out infinite;
}
.deadline-wait { display: flex; align-items: center; gap: 16px; }
.deadline-wait .deadline-clock { font-size: 2.2rem; }
.season-strip { display: grid; grid-template-columns: repeat(52, 1fr); gap: 1px; height: 22px; }
.season-strip i { background: rgba(255, 255, 255, 0.06); border-radius: 1px; }
.season-strip i.is-window { background: rgba(63, 214, 122, 0.35); }
.season-strip i.is-deadline { background: var(--warn); }
.season-strip i.is-now { background: #fff; box-shadow: 0 0 6px rgba(255, 255, 255, 0.7); }
.season-strip__legend { display: flex; gap: 14px; margin-top: 8px; }
.season-strip__legend span { display: inline-flex; align-items: center; gap: 5px; }
.season-strip__legend i { width: 8px; height: 8px; border-radius: 1px; }
.season-strip__legend i.is-now { background: #fff; }
.season-strip__legend i.is-window { background: rgba(63, 214, 122, 0.35); }
.season-strip__legend i.is-deadline { background: var(--warn); }
.deadline-clock.is-out {
  color: var(--text-fainter);
  border-color: var(--border);
  text-shadow: none;
  animation: none;
}

.deadline-track {
  height: 3px;
  border-radius: 2px;
  background: var(--track);
  margin-top: 12px;
  overflow: hidden;
}
/*
 * A choice in the opening sheet: a name, and the thing it costs you, stacked.
 * On one line the detail ran to two rows anyway and centred itself into a
 * shape that read as a paragraph rather than as a button.
 */
.deadline-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: var(--tap);
  padding-top: 9px;
  padding-bottom: 9px;
  text-align: left;
}
.deadline-choice__label { font-weight: 700; }
.deadline-choice__detail {
  font-size: 0.74rem;
  font-weight: 500;
  opacity: 0.72;
  white-space: normal;
  line-height: 1.35;
}

.deadline-track__fill {
  height: 100%;
  background: var(--warn);
  /* Matches the tick interval, so the bar slides rather than stepping. */
  transition: width 250ms linear;
}
</style>
