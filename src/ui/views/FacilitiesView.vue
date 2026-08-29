<script setup lang="ts">
import { computed, inject } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { formatMoney } from '../../engine/systems/valuation'
import {
  FACILITY_DESCRIPTIONS, FACILITY_LABELS, facilityGrade, startUpgrade, upgradeCost,
  upgradeDuration,
} from '../../engine/systems/facilities'
import type { FacilityKind } from '../../engine/types'

const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const club = computed(() => store.club)

const kinds: FacilityKind[] = [
  'trainingGround', 'youthFacilities', 'medicalCentre', 'dataDepartment', 'scoutingNetwork',
]

function levelOf(kind: FacilityKind): number {
  return (club.value?.facilities[kind] as number) ?? 1
}

function costOf(kind: FacilityKind): number {
  const c = club.value
  return c ? upgradeCost(kind, levelOf(kind), c.reputation) : 0
}

function inProgress(kind: FacilityKind) {
  return club.value?.facilities.projects.find((p) => p.kind === kind) ?? null
}

function upgrade(kind: FacilityKind) {
  const c = club.value
  if (!c) return
  const result = startUpgrade(c, store.idFactory(), kind)
  store.commit()
  if ('error' in result) toast?.(result.error, 'error')
  else toast?.(`Work has begun on the ${FACILITY_LABELS[kind].toLowerCase()}.`, 'success')
}

</script>

<template>
  <div v-if="club">
    <h1 class="mb">Facilities</h1>
    <p class="small muted mb">
      None of this helps you this season. That is rather the point — it is the part of the job
      nobody thanks you for and every successful club has done.
    </p>

    <button
      class="card"
      style="width: 100%; text-align: left; cursor: pointer"
      @click="$router.push('/stadium')"
    >
      <div class="card__head">
        <span class="card__title">{{ club.facilities.stadium.name }}</span>
        <span class="faint">›</span>
      </div>
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">
            {{ club.facilities.stadium.capacity.toLocaleString() }} usable places
          </span>
          <span class="small">{{ facilityGrade(Math.round(club.facilities.stadium.quality / 5)) }}</span>
        </div>
        <MeterBar :value="club.facilities.stadium.quality" />
        <div v-if="club.facilities.stadiumProject" class="chip chip--info mt">
          {{ club.facilities.stadiumProject.description }} —
          {{ club.facilities.stadiumProject.weeksRemaining }} weeks left
        </div>
        <p class="tiny faint mt">
          Stands, repairs, expansion and relocation are handled on the stadium
          screen, where you appoint an architect.
        </p>
      </div>
    </button>

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

  </div>
</template>
