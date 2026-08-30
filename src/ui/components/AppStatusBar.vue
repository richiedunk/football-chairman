<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import { projectedSquadCost, SANCTION_THRESHOLD, SQUAD_COST_LIMIT } from '../../engine/systems/regulation'

/**
 * The four numbers that are true all the time.
 *
 * They used to live in a card on the home screen, which meant checking whether
 * you could afford something required navigating to find out. A strip is
 * cheaper than a card in every sense: one line, always visible, and it never
 * competes with the screen it sits above.
 */
const store = useGameStore()

/**
 * The week, and what kind of week it is.
 *
 * "W6" with every league reading "played 0" looks like a world that has
 * stopped. It has not: the season starts at week 6 and weeks 1-5 are
 * pre-season. Naming the phase costs four characters and answers the question
 * before it is asked.
 */
const week = computed(() => {
  const s = store.game
  if (!s) return ''
  if (s.phase === 'preseason') return `W${s.date.week} PRE`
  if (s.phase === 'endOfSeason') return `W${s.date.week} END`
  return `W${s.date.week}`
})

const balance = computed(() => {
  const c = store.club
  if (!c) return { text: '—', tone: '' }
  const v = c.finances.balance
  return {
    text: formatMoney(v, store.currency),
    tone: v < 0 ? 'statusbar__value--bad' : 'statusbar__value--good',
  }
})

const wageRatio = computed(() => {
  const c = store.club
  if (!c || c.finances.wageBudget <= 0) return null
  return store.wageBill / c.finances.wageBudget
})

const wage = computed(() => {
  const r = wageRatio.value
  if (r === null) return { text: '—', tone: '' }
  return {
    text: `${Math.round(r * 100)}%`,
    tone: r > 1 ? 'statusbar__value--bad' : r > 0.9 ? 'statusbar__value--warn' : '',
  }
})

// The squad-cost ratio is the rule that actually bites, so it is the one
// compliance figure worth carrying everywhere rather than filing under finance.
const ffp = computed(() => {
  const s = store.game
  const c = store.club
  if (!s || !c) return { text: '—', tone: '' }
  const { ratio } = projectedSquadCost(s, c)
  if (!Number.isFinite(ratio)) return { text: '—', tone: '' }
  if (ratio >= SANCTION_THRESHOLD) return { text: 'RISK', tone: 'statusbar__value--bad' }
  if (ratio > SQUAD_COST_LIMIT) return { text: 'OVER', tone: 'statusbar__value--warn' }
  return { text: 'OK', tone: 'statusbar__value--good' }
})
</script>

<template>
  <div v-if="store.club" class="statusbar">
    <div class="statusbar__item">{{ week }}</div>
    <div class="statusbar__item">
      <span :class="balance.tone" class="statusbar__value">{{ balance.text }}</span>
    </div>
    <div class="statusbar__item">
      WAGE <span :class="wage.tone" class="statusbar__value">{{ wage.text }}</span>
    </div>
    <div class="statusbar__item">
      FFP <span :class="ffp.tone" class="statusbar__value">{{ ffp.text }}</span>
    </div>
  </div>
</template>
