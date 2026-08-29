<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import AppSheet from '../components/AppSheet.vue'
import { formatMoney } from '../../engine/systems/valuation'
import {
  expansionCost, expansionDuration, FACILITY_DESCRIPTIONS, FACILITY_LABELS,
  facilityGrade, startExpansion, startUpgrade, upgradeCost, upgradeDuration,
} from '../../engine/systems/facilities'
import type { FacilityKind } from '../../engine/types'

const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const club = computed(() => store.club)
const expandOpen = ref(false)
const seats = ref(2000)

const kinds: Exclude<FacilityKind, 'stadium'>[] = [
  'trainingGround', 'youthFacilities', 'medicalCentre', 'dataDepartment', 'scoutingNetwork',
]

function levelOf(kind: Exclude<FacilityKind, 'stadium'>): number {
  return (club.value?.facilities[kind] as number) ?? 1
}

function costOf(kind: Exclude<FacilityKind, 'stadium'>): number {
  const c = club.value
  return c ? upgradeCost(kind, levelOf(kind), c.reputation) : 0
}

function inProgress(kind: FacilityKind) {
  return club.value?.facilities.projects.find((p) => p.kind === kind) ?? null
}

function upgrade(kind: Exclude<FacilityKind, 'stadium'>) {
  const c = club.value
  if (!c) return
  const result = startUpgrade(c, store.idFactory(), kind)
  store.commit()
  if ('error' in result) toast?.(result.error, 'error')
  else toast?.(`Work has begun on the ${FACILITY_LABELS[kind].toLowerCase()}.`, 'success')
}

function expand() {
  const c = club.value
  if (!c) return
  const result = startExpansion(c, store.idFactory(), seats.value)
  store.commit()
  if ('error' in result) toast?.(result.error, 'error')
  else {
    toast?.('Stadium expansion approved.', 'success')
    expandOpen.value = false
  }
}
</script>

<template>
  <div v-if="club">
    <h1 class="mb">Facilities</h1>
    <p class="small muted mb">
      None of this helps you this season. That is rather the point — it is the part of the job
      nobody thanks you for and every successful club has done.
    </p>

    <div class="card">
      <div class="card__head">
        <span class="card__title">{{ club.facilities.stadium.name }}</span>
        <span class="chip">{{ club.facilities.stadium.capacity.toLocaleString() }} seats</span>
      </div>
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Condition</span>
          <span class="small">{{ facilityGrade(Math.round(club.facilities.stadium.quality / 5)) }}</span>
        </div>
        <MeterBar :value="club.facilities.stadium.quality" />
        <div class="row row--between small mt">
          <span class="muted">Ticket price</span>
          <span class="num">{{ formatMoney(club.facilities.stadium.ticketPrice, store.currency) }}</span>
        </div>

        <div v-if="inProgress('stadium')" class="mt">
          <div class="chip chip--info">
            {{ inProgress('stadium')!.description }} — {{ inProgress('stadium')!.weeksRemaining }} weeks left
          </div>
        </div>
        <button v-else class="btn btn--ghost btn--block mt" @click="expandOpen = true">
          Expand the ground
        </button>
      </div>
    </div>

    <div class="section-title">Departments</div>
    <div v-for="kind in kinds" :key="kind" class="card">
      <div class="card__head">
        <span class="card__title">{{ FACILITY_LABELS[kind] }}</span>
        <span class="chip">{{ facilityGrade(levelOf(kind)) }} · L{{ levelOf(kind) }}</span>
      </div>
      <div class="card__body">
        <MeterBar :value="levelOf(kind)" :max="20" />
        <p class="tiny muted mt">{{ FACILITY_DESCRIPTIONS[kind] }}</p>

        <div v-if="inProgress(kind)" class="chip chip--info mt">
          Upgrading — {{ inProgress(kind)!.weeksRemaining }} weeks left
        </div>
        <button
          v-else-if="levelOf(kind) < 20"
          class="btn btn--ghost btn--block btn--sm mt"
          :disabled="costOf(kind) > club.finances.balance"
          @click="upgrade(kind)"
        >
          Upgrade to L{{ levelOf(kind) + 1 }} — {{ formatMoney(costOf(kind), store.currency) }}
          <span class="tiny faint">({{ upgradeDuration(kind, levelOf(kind)) }}w)</span>
        </button>
        <div v-else class="chip chip--accent mt">At maximum</div>
      </div>
    </div>

    <AppSheet
      v-if="expandOpen"
      title="Expand the stadium"
      :subtitle="`Currently ${club.facilities.stadium.capacity.toLocaleString()} seats`"
      @close="expandOpen = false"
    >
      <div class="field">
        <label class="field__label">Seats to add — {{ seats.toLocaleString() }}</label>
        <input v-model.number="seats" class="slider" type="range" min="500" max="20000" step="500" />
      </div>
      <div class="row row--between small">
        <span class="muted">Cost</span>
        <span class="bold num">{{ formatMoney(expansionCost(club, seats), store.currency) }}</span>
      </div>
      <div class="row row--between small">
        <span class="muted">Duration</span>
        <span class="num">{{ expansionDuration(seats) }} weeks</span>
      </div>
      <div class="row row--between small">
        <span class="muted">You have</span>
        <span class="num">{{ formatMoney(club.finances.balance, store.currency) }}</span>
      </div>
      <p class="tiny faint mt">
        Seats only pay for themselves if you can fill them. Your average gate is driven by fanbase
        and form, not by capacity.
      </p>
      <template #footer>
        <button
          class="btn btn--primary btn--block"
          :disabled="expansionCost(club, seats) > club.finances.balance"
          @click="expand"
        >Approve the work</button>
      </template>
    </AppSheet>
  </div>
</template>
