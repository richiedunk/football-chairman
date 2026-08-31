<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import PlayerRow from '../components/PlayerRow.vue'
import MeterBar from '../components/MeterBar.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { auditSquadDepth } from '../../engine/sim/selection'
import { ELEVEN, fieldable } from '../../engine/systems/matchday'
import type { Player, Position } from '../../engine/types'
import Chevron from '../components/Chevron.vue'

const store = useGameStore()
const router = useRouter()

type SortKey = 'position' | 'ability' | 'age' | 'value' | 'wage' | 'form' | 'morale' | 'contract' | 'apps'
const sort = ref<SortKey>('position')
const showDepth = ref(false)

// Goalkeepers, defenders, midfield, forwards — the order a teamsheet is read
// in — and the best man first within each. Ranking a whole squad by ability
// alone puts your third-choice keeper between two centre halves.
const POSITION_ORDER: Position[] = ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST']
const positionRank = (p: Player) => {
  const i = POSITION_ORDER.indexOf(p.position)
  return i < 0 ? POSITION_ORDER.length : i
}

const sorters: Record<SortKey, (a: Player, b: Player) => number> = {
  position: (a, b) =>
    positionRank(a) - positionRank(b) || b.currentAbility - a.currentAbility,
  ability: (a, b) => b.currentAbility - a.currentAbility,
  age: (a, b) => a.age - b.age,
  value: (a, b) => b.value - a.value,
  wage: (a, b) => (b.contract?.wage ?? 0) - (a.contract?.wage ?? 0),
  form: (a, b) => b.form - a.form,
  morale: (a, b) => a.morale - b.morale,
  contract: (a, b) => (a.contract?.expiresSeason ?? 9999) - (b.contract?.expiresSeason ?? 9999),
  apps: (a, b) => b.stats.appearances - a.stats.appearances,
}

const trailFor: Record<SortKey, 'value' | 'wage' | 'ability' | 'stats'> = {
  position: 'ability',
  ability: 'ability', age: 'ability', value: 'value', wage: 'wage',
  form: 'value', morale: 'value', contract: 'wage', apps: 'stats',
}

const sorted = computed(() => store.squad.slice().sort(sorters[sort.value]))

const avgAge = computed(() => {
  const s = store.squad
  return s.length ? (s.reduce((sum, p) => sum + p.age, 0) / s.length).toFixed(1) : '—'
})

const squadValue = computed(() => store.squad.reduce((sum, p) => sum + p.value, 0))

const depth = computed(() => {
  const s = store.game
  const c = store.club
  if (!s || !c) return []
  return auditSquadDepth(s, c)
})

const shortages = computed(() => depth.value.filter((d) => d.shortage))

const registration = computed(() => store.registration)

/**
 * Can we field a side at all?
 *
 * The one thing on this screen that is not advice. Everything else here is a
 * judgement about depth; this is a fact about whether there is a team, and it
 * is the only failure the board dismisses a director for outright.
 */
const fieldableNow = computed(() => {
  const s = store.game
  const c = store.club
  if (!s || !c) return null
  return fieldable(s, c, s.date.week).length
})
</script>

<template>
  <div>
    <div class="card">
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Squad</div>
          <div class="stat__value">{{ store.squad.length }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Avg age</div>
          <div class="stat__value">{{ avgAge }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Value</div>
          <div class="stat__value stat__value--sm">{{ formatMoney(squadValue, store.currency) }}</div>
        </div>
      </div>
      <div class="card__body">
        <div class="row row--between" style="margin-bottom: 5px">
          <span class="small muted">Wage bill</span>
          <span class="small num">
            {{ formatWage(store.wageBill, store.currency) }} / {{ formatWage(store.club?.finances.wageBudget ?? 0, store.currency) }}
          </span>
        </div>
        <MeterBar :value="store.wageBill" :max="store.club?.finances.wageBudget ?? 1" invert />
      </div>
    </div>

    <button
      v-if="registration"
      class="card"
      :style="{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        borderColor: registration.unregistered.length ? 'var(--danger)' : undefined,
        background: registration.unregistered.length ? 'var(--danger-wash)' : undefined,
      }"
      @click="router.push('/registration')"
    >
      <div class="card__body">
        <div class="row row--between">
          <div class="grow">
            <div class="bold small" :style="registration.unregistered.length ? 'color: var(--danger)' : ''">
              Squad list — {{ registration.placesUsed }}/25 named
            </div>
            <div class="tiny muted">
              <template v-if="registration.unregistered.length">
                {{ registration.unregistered.length }} senior player{{ registration.unregistered.length === 1 ? '' : 's' }}
                left out and unavailable
              </template>
              <template v-else>
                {{ registration.nonHomegrown }}/17 trained abroad · {{ registration.exempt.length }} under-21s exempt
              </template>
            </div>
          </div>
          <Chevron />
        </div>
      </div>
    </button>

    <div
      v-if="fieldableNow !== null && fieldableNow < ELEVEN"
      class="card card--boxed"
      style="border-color: var(--danger)"
    >
      <div class="card__body">
        <div class="bold" style="color: var(--danger)">
          We cannot field a side — {{ ELEVEN - fieldableNow }} short
        </div>
        <div class="small muted mt">
          {{ fieldableNow }} player{{ fieldableNow === 1 ? '' : 's' }} available and eleven needed.
          Promote from the academy, sign somebody, or get players registered. If a match comes
          round with the squad in this state the board will dismiss you for it.
        </div>
      </div>
    </div>

    <button
      v-if="shortages.length"
      class="card"
      style="width: 100%; text-align: left; background: var(--warn-wash); cursor: pointer"
      @click="showDepth = !showDepth"
    >
      <div class="card__body">
        <div class="row row--between">
          <div class="grow">
            <div class="bold small" style="color: var(--warn)">
              {{ shortages.length }} position{{ shortages.length === 1 ? '' : 's' }} without cover
            </div>
            <div class="tiny muted">
              {{ shortages.map((s) => s.position).join(', ') }} — an injury here and the coach has no options
            </div>
          </div>
          <span class="faint">{{ showDepth ? '▾' : '▸' }}</span>
        </div>
      </div>
    </button>

    <div v-if="showDepth" class="card">
      <div class="card__head"><span class="card__title">Depth by position</span></div>
      <div class="list">
        <div v-for="d in depth" :key="d.position" class="list__row list__row--static">
          <span class="pos">{{ d.position }}</span>
          <div class="list__main">
            <div class="list__primary">
              {{ d.count }} option{{ d.count === 1 ? '' : 's' }}
              <span v-if="d.shortage" class="chip chip--warn">Thin</span>
            </div>
            <div class="list__secondary">Best rated {{ d.bestRating || '—' }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">Sort by</div>
    <div class="table__scroll mb">
      <div class="segmented" style="min-width: 640px">
        <button
          v-for="key in (['position','ability','age','value','wage','form','morale','contract','apps'] as SortKey[])"
          :key="key"
          class="segmented__item"
          :class="{ 'is-active': sort === key }"
          @click="sort = key"
        >{{ key === 'apps' ? 'Games' : key.charAt(0).toUpperCase() + key.slice(1) }}</button>
      </div>
    </div>

    <div class="card">
      <div class="list">
        <PlayerRow
          v-for="p in sorted"
          :key="p.id"
          :player="p"
          :trail="trailFor[sort]"
        />
        <div v-if="sorted.length === 0" class="empty">No senior players. That is a problem.</div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button class="btn btn--ghost" @click="router.push('/academy')">
        Academy ({{ store.academy.length }})
      </button>
      <button class="btn btn--ghost" @click="router.push('/transfers')">Transfers</button>
    </div>
  </div>
</template>
