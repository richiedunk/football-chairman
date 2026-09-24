<script setup lang="ts">
import { computed, inject } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import LevelLadder from '../components/LevelLadder.vue'
import { formatMoney } from '../../engine/systems/valuation'
import {
  FACILITY_DESCRIPTIONS, FACILITY_LABELS, facilityGrade, startUpgrade, upgradeCost,
  upgradeDuration,
} from '../../engine/systems/facilities'
import type { FacilityKind } from '../../engine/types'
import Chevron from '../components/Chevron.vue'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const club = computed(() => store.club)

const kinds: FacilityKind[] = [
  'trainingGround', 'youthFacilities', 'medicalCentre', 'dataDepartment', 'scoutingNetwork',
]

function levelOf(kind: FacilityKind): number {
  return (club.value?.facilities[kind] as number) ?? 1
}

const ICON: Record<FacilityKind, string> = {
  trainingGround: 'M12 3l5 16H7zM5 19h14M9.5 11h5M8.3 15h7.4',
  youthFacilities: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5',
  medicalCentre: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  dataDepartment: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  scoutingNetwork: 'M6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 17h6M5 14l2-9h3l1 9M19 14l-2-9h-3l-1 9',
}

/** Where the rest of the division stands, per department. */
const league = computed(() => {
  const c = club.value
  const out = {} as Record<FacilityKind, { average: number; best: number }>
  if (!c) return out
  const rivals = Object.values(store.game?.clubs ?? {}).filter((o) => o.leagueId === c.leagueId && o.id !== c.id)
  for (const kind of kinds) {
    const levels = rivals.map((o) => (o.facilities[kind] as number) ?? 1)
    out[kind] = levels.length
      ? { average: levels.reduce((a, b) => a + b, 0) / levels.length, best: Math.max(...levels) }
      : { average: 0, best: 0 }
  }
  return out
})

function standing(kind: FacilityKind): string {
  const l = league.value[kind]
  if (!l || !l.best) return ''
  const mine = levelOf(kind)
  if (mine > l.best) return 'Best in the division'
  if (mine === l.best) return 'Level with the division\'s best'
  const gap = l.best - mine
  return `${gap} level${gap === 1 ? '' : 's'} behind the best`
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
  if ('error' in result) notify?.(result.error, 'error')
  else notify?.(`Work has begun on the ${FACILITY_LABELS[kind].toLowerCase()}.`, 'success')
}

</script>

<template>
  <div v-if="club">
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
        <Chevron />
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
        <span class="facility-head">
          <span class="choice__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON[kind]" /></svg>
          </span>
          <span class="card__title">{{ FACILITY_LABELS[kind] }}</span>
        </span>
        <span class="chip">{{ facilityGrade(levelOf(kind)) }} · L{{ levelOf(kind) }}</span>
      </div>
      <div class="card__body">
        <LevelLadder
          :level="levelOf(kind)"
          :average="league[kind]?.average"
          :best="league[kind]?.best"
          :building="!!inProgress(kind)"
        />
        <p v-if="standing(kind)" class="tiny faint mt">{{ standing(kind) }}</p>
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
