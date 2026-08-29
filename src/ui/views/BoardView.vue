<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { confidenceLabel, MANDATE_LABELS } from '../../engine/systems/board'
import { ordinal } from '../../engine/systems/career'
import { formatMoney } from '../../engine/systems/valuation'

const store = useGameStore()
const club = computed(() => store.club)

const gap = computed(() => {
  const c = club.value
  const pos = store.leaguePosition
  if (!c || !pos) return 0
  return c.board.expectation.leaguePosition - pos
})
</script>

<template>
  <div v-if="club">
    <h1 class="mb">The board</h1>

    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Confidence in you</span>
          <span class="bold">{{ confidenceLabel(club.board.confidence) }}</span>
        </div>
        <MeterBar :value="club.board.confidence" />
        <div v-if="club.board.warnings > 0" class="chip chip--danger mt">
          {{ club.board.warnings }} of 3 formal warnings issued
        </div>
        <div class="row row--between small mt">
          <span class="muted">In post</span>
          <span class="num">{{ club.board.tenureSeasons }} season{{ club.board.tenureSeasons === 1 ? '' : 's' }}</span>
        </div>
      </div>
    </div>

    <div class="section-title">What they expect</div>
    <div class="card">
      <div class="card__body">
        <div class="bold mb">{{ club.board.expectation.description }}</div>
        <div class="row row--between small">
          <span class="muted">Target position</span>
          <span class="num">
            {{ club.board.expectation.leaguePosition }}{{ ordinal(club.board.expectation.leaguePosition) }}
          </span>
        </div>
        <div class="row row--between small">
          <span class="muted">Currently</span>
          <span class="num" :class="gap >= 0 ? 'pos-val' : 'neg-val'">
            {{ store.leaguePosition || '—' }}{{ store.leaguePosition ? ordinal(store.leaguePosition) : '' }}
            <template v-if="store.leaguePosition">
              ({{ gap > 0 ? `${gap} above` : gap < 0 ? `${-gap} below` : 'on target' }})
            </template>
          </span>
        </div>

        <div class="divider" />
        <div class="tiny faint bold mb" style="text-transform: uppercase; letter-spacing: 0.05em">
          What else they weigh
        </div>
        <div class="stack">
          <div>
            <div class="row row--between"><span class="small muted">Cup runs</span><span class="tiny num">{{ club.board.expectation.cupImportance }}</span></div>
            <MeterBar :value="club.board.expectation.cupImportance" :semantic="false" />
          </div>
          <div>
            <div class="row row--between"><span class="small muted">Financial health</span><span class="tiny num">{{ club.board.expectation.financialImportance }}</span></div>
            <MeterBar :value="club.board.expectation.financialImportance" :semantic="false" />
          </div>
          <div>
            <div class="row row--between"><span class="small muted">Bringing youth through</span><span class="tiny num">{{ club.board.expectation.youthImportance }}</span></div>
            <MeterBar :value="club.board.expectation.youthImportance" :semantic="false" />
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">Your remit</div>
    <div class="card">
      <div class="list">
        <div v-for="m in club.board.mandates" :key="m" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ MANDATE_LABELS[m] }}</div>
          </div>
        </div>
        <div v-if="!club.board.mandates.length" class="empty">
          No standing instructions. Just results.
        </div>
      </div>
    </div>

    <div class="section-title">Supporters</div>
    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Mood</span>
          <span class="bold">
            {{ club.fanMood >= 70 ? 'Delighted' : club.fanMood >= 55 ? 'Content' : club.fanMood >= 40 ? 'Restless' : club.fanMood >= 25 ? 'Angry' : 'In revolt' }}
          </span>
        </div>
        <MeterBar :value="club.fanMood" />
        <p class="tiny faint mt">
          Attendance, and therefore matchday income, follows this. A mutinous crowd costs real money
          before it costs you your job.
        </p>
      </div>
    </div>

    <div class="section-title">Budgets they have set</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Transfer budget</span>
          <span class="bold num">{{ formatMoney(club.finances.transferBudget, store.currency) }}</span>
        </div>
        <div class="row row--between">
          <span class="small muted">Wage budget</span>
          <span class="bold num">{{ formatMoney(club.finances.wageBudget, store.currency) }}/wk</span>
        </div>
        <p class="tiny faint">
          Both are recalculated each summer from projected revenue and how much the board trusts you
          with money.
        </p>
      </div>
    </div>
  </div>
</template>
