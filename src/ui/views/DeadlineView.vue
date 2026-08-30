<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import PosBadge from '../components/PosBadge.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
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

onMounted(() => store.refreshDeadline())

const offers = computed(() => store.deadlineOffers)
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
        <div style="font-size: 1.3rem; font-weight: 700; letter-spacing: -0.025em; color: var(--warn)">
          The window shuts tonight
        </div>
        <p class="small muted" style="margin: 7px 0 0">
          Everything here is take it or leave it. Nobody is negotiating and nobody is
          calling back.
        </p>
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
          :style="taken.has(offer.playerId) ? 'opacity: 0.45' : ''"
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
            <div class="list__sub" style="color: var(--warn)">{{ offer.hours }}h</div>
            <button
              v-if="!taken.has(offer.playerId)"
              class="btn btn--primary btn--sm mt"
              :disabled="busy === offer.playerId || offer.fee > budget"
              @click="take(offer)"
            >Do it</button>
            <div v-else class="tiny faint mt">Signed</div>
          </div>
        </div>
        <div v-if="offers.length === 0" class="empty">
          Nothing has come across the desk. Some deadline days are like that.
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
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
