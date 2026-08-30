<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { MANDATE_LABELS } from '../../engine/systems/board'
import { facilityGrade } from '../../engine/systems/facilities'
import { seniorSquad } from '../../engine/systems/aiSquad'
import { squadRegistration } from '../../engine/systems/registration'
import { levelFor } from '../../engine/systems/career'

/**
 * The first thing you see on taking a job.
 *
 * Arriving straight on the home screen made a new club feel like a reskin of
 * the last one. This is the handover: what you have taken on, what they expect,
 * what they are paying you, and what state they have left the place in.
 */
const store = useGameStore()
const router = useRouter()

const club = computed(() => store.club)
const league = computed(() => store.league)
const squad = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? seniorSquad(s, c) : []
})

const avgAge = computed(() => {
  const list = squad.value
  return list.length ? (list.reduce((sum, p) => sum + p.age, 0) / list.length).toFixed(1) : '—'
})

const bestPlayer = computed(() =>
  squad.value.slice().sort((a, b) => b.currentAbility - a.currentAbility)[0] ?? null)

const expiring = computed(() => {
  const s = store.game
  if (!s) return 0
  return squad.value.filter((p) => p.contract && p.contract.expiresSeason <= s.date.season).length
})

const registration = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? squadRegistration(s, c) : null
})

const contract = computed(() => store.game?.director.contract ?? null)
const level = computed(() => levelFor(store.game?.director.xp ?? 0))

const founded = computed(() => club.value?.founded ?? null)
const stadium = computed(() => club.value?.facilities.stadium ?? null)

/** The things a new director would want flagged on day one. */
const concerns = computed(() => {
  const c = club.value
  const list: string[] = []
  if (!c) return list
  if (c.finances.inCrisis) list.push('The club is in financial crisis and under a transfer embargo.')
  if (c.finances.debt > 0) list.push(`There is ${formatMoney(c.finances.debt, store.currency)} of debt on the books.`)
  if (expiring.value > 0) {
    list.push(`${expiring.value} contract${expiring.value === 1 ? '' : 's'} expire${expiring.value === 1 ? 's' : ''} at the end of this season.`)
  }
  if (squad.value.length < 20) list.push(`Only ${squad.value.length} senior players are on the books.`)
  if (registration.value && registration.value.unregistered.length > 0) {
    list.push(`${registration.value.unregistered.length} senior players are not on the squad list and cannot be picked.`)
  }
  if (!c.headCoachId) list.push('There is no head coach. That appointment is yours to make.')
  if (stadium.value && !stadium.value.owned) list.push('The club does not own its ground and pays rent on it.')
  if (c.fanMood < 35) list.push('The supporters have lost patience with the club.')
  return list
})
</script>

<template>
  <div v-if="club">
    <div class="card" :style="{ borderTop: `3px solid ${club.colors.primary}` }">
      <div class="card__body" style="text-align: center; padding: 20px 14px">
        <div class="tiny faint" style="text-transform: uppercase; letter-spacing: 0.1em">
          Welcome to
        </div>
        <div class="bold" style="font-size: 1.5rem; margin: 5px 0 2px">{{ club.name }}</div>
        <div class="small muted">
          {{ club.nickname }} · {{ club.city }}<span v-if="founded"> · founded {{ founded }}</span>
        </div>
        <div class="small" style="margin-top: 8px">{{ league?.name }}</div>
      </div>
    </div>

    <div class="card">
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Squad</div>
          <div class="stat__value">{{ squad.length }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Avg age</div>
          <div class="stat__value">{{ avgAge }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Balance</div>
          <div class="stat__value stat__value--sm">
            {{ formatMoney(club.finances.balance, store.currency) }}
          </div>
        </div>
      </div>
      <div class="card__body">
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Ground</span>
          <span class="num">{{ stadium?.name }} · {{ (stadium?.capacity ?? 0).toLocaleString() }}</span>
        </div>
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Training ground</span>
          <span class="num">{{ facilityGrade(club.facilities.trainingGround) }}</span>
        </div>
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Academy</span>
          <span class="num">{{ facilityGrade(club.facilities.youthFacilities) }}</span>
        </div>
        <div v-if="bestPlayer" class="row row--between small">
          <span class="muted">Best player</span>
          <span class="num">{{ bestPlayer.knownAs }} ({{ bestPlayer.position }}, {{ bestPlayer.age }})</span>
        </div>
      </div>
    </div>

    <div class="section-title">What the board expect</div>
    <div class="card">
      <div class="card__body">
        <p class="small" style="margin: 0 0 8px">{{ club.board.expectation.description }}</p>
        <div class="row row--between small" style="margin-bottom: 5px">
          <span class="muted">Target finish</span>
          <span class="bold num">{{ club.board.expectation.leaguePosition }}</span>
        </div>
        <div class="row row--between small" style="margin-bottom: 5px">
          <span class="muted">Board confidence</span>
          <span class="num">{{ Math.round(club.board.confidence) }}/100</span>
        </div>
        <MeterBar :value="club.board.confidence" :max="100" />
      </div>
      <div v-if="club.board.mandates.length" class="list">
        <div v-for="m in club.board.mandates" :key="m" class="list__row list__row--static">
          <div class="pos" style="width: 26px">▸</div>
          <div class="list__main">
            <div class="list__primary">{{ MANDATE_LABELS[m] }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="concerns.length" class="section-title">In your in-tray</div>
    <div v-if="concerns.length" class="card">
      <div class="list">
        <div v-for="(note, i) in concerns" :key="i" class="list__row list__row--static">
          <div class="pos" style="width: 26px; color: var(--warn)">!</div>
          <div class="list__main">
            <div class="list__secondary" style="white-space: normal">{{ note }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="contract" class="section-title">Your terms</div>
    <div v-if="contract" class="card">
      <div class="card__body">
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Salary</span>
          <span class="num">{{ formatWage(contract.salary, store.currency) }}/wk</span>
        </div>
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Contract to</span>
          <span class="num">{{ contract.expiresSeason }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Your standing</span>
          <span class="num">{{ level.title }}</span>
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button class="btn btn--primary btn--block" @click="router.replace('/home')">
        Get to work
      </button>
    </div>
  </div>
  <div v-else class="empty">No club.</div>
</template>
