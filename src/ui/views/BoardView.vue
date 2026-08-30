<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { assessFanMood, confidenceLabel, MANDATE_LABELS } from '../../engine/systems/board'
import {
  lossCoverage, OWNER_LABELS, ownerSummary, ownerTraits, wageBudgetShare,
} from '../../engine/systems/ownership'
import type { TakeoverStage } from '../../engine/types'

const TAKEOVER_STAGE: Record<TakeoverStage, string> = {
  interest: 'An approach has been made for the club',
  dueDiligence: 'Prospective buyers are examining the books',
  agreed: 'A sale has been agreed and is close to completing',
  completed: 'The sale has completed',
  collapsed: 'The sale collapsed',
}
import {
  availableRequests, makeRequest, RISK_LABELS, weeksUntilNextRequest,
  type BoardRequestKind, type BoardRequestOption,
} from '../../engine/systems/boardRequests'
import { Rng } from '../../engine/rng'
import AppSheet from '../components/AppSheet.vue'
import { ordinal } from '../../engine/systems/career'
import { formatMoney } from '../../engine/systems/valuation'
import { FACILITY_LABELS, facilityGrade, upgradeCost } from '../../engine/systems/facilities'
import type { FacilityKind } from '../../engine/types'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')
const club = computed(() => store.club)

const patienceLabel = computed(() => {
  const p = store.owner?.patience ?? 50
  if (p >= 80) return 'Very high'
  if (p >= 60) return 'High'
  if (p >= 40) return 'Average'
  if (p >= 25) return 'Low'
  return 'None at all'
})

const requests = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? availableRequests(s, c) : []
})

const cooldown = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? weeksUntilNextRequest(s, c) : 0
})

const asking = ref<BoardRequestOption | null>(null)
const askAmount = ref(0)
const lastResponse = ref<{ outcome: string; message: string } | null>(null)

const moodFactors = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? assessFanMood(s, c).factors : []
})

function openRequest(option: BoardRequestOption) {
  if (!option.available) {
    notify?.(option.unavailableReason ?? 'Not possible right now.')
    return
  }
  asking.value = option
  askAmount.value = option.suggestedAmount ?? 0
  // Default to whatever is furthest behind: the one a director would name.
  askFacility.value = weakestFacility.value
  lastResponse.value = null
}

function submit(kind: BoardRequestKind) {
  const s = store.game
  const c = club.value
  if (!s || !c) return
  const response = makeRequest(
    s, c, kind,
    new Rng(`${s.seed}:board:${kind}:${s.date.season}:${s.date.week}`),
    askAmount.value,
    kind === 'fundFacility' ? askFacility.value : undefined,
    store.idFactory(),
  )
  store.commit()
  lastResponse.value = { outcome: response.outcome, message: response.message }
  notify?.(response.message, response.outcome === 'refused' ? 'error' : 'success')
  asking.value = null
}

const gap = computed(() => {
  const c = club.value
  const pos = store.leaguePosition
  if (!c || !pos) return 0
  return c.board.expectation.leaguePosition - pos
})

/**
 * What the chip says.
 *
 * It used to read a bare "low" or "high", which invites exactly the wrong
 * reading — that a high number means a good chance. It is the opposite: the
 * bigger the ask, the less willing they are and the more it costs you when
 * they say no. So the chip names the axis and the direction.
 */
const RISK_CHIP: Record<BoardRequestOption['risk'], string> = {
  low: 'Easy ask',
  medium: 'Big ask',
  high: 'Costly if refused',
}

const askFacility = ref<FacilityKind>('trainingGround')

/** Every facility, with what the next level would cost — cheapest fix first. */
const facilityChoices = computed(() => {
  const c = club.value
  if (!c) return []
  return (Object.keys(FACILITY_LABELS) as FacilityKind[])
    .map((kind) => {
      const level = c.facilities[kind] as number
      return {
        kind,
        label: FACILITY_LABELS[kind],
        level,
        grade: facilityGrade(level),
        cost: upgradeCost(kind, level, c.reputation),
      }
    })
    .sort((a, b) => a.level - b.level)
})

/** What a director would ask about first: whatever is furthest behind. */
const weakestFacility = computed<FacilityKind>(
  () => facilityChoices.value[0]?.kind ?? 'trainingGround',
)
</script>

<template>
  <div v-if="club">

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

    <div class="section-title">Who owns the club</div>
    <div v-if="store.owner" class="card">
      <div class="card__body">
        <div class="row row--between">
          <div class="grow">
            <div class="bold">{{ store.owner.name }}</div>
            <div class="small muted">{{ OWNER_LABELS[store.owner.kind] }}</div>
          </div>
          <div class="tiny faint num">
            since {{ store.owner.sinceSeason }}<span v-if="store.owner.stake < 100"> · {{ store.owner.stake }}%</span>
          </div>
        </div>
        <p class="small" style="margin: 8px 0 0">{{ ownerSummary(store.owner) }}</p>
        <div class="mt">
          <span
            v-for="trait in ownerTraits(store.owner)"
            :key="trait"
            class="chip"
            style="margin-right: 4px"
          >{{ trait }}</span>
        </div>
      </div>
      <div class="divider" />
      <div class="card__body">
        <div class="tiny faint bold mb" style="text-transform: uppercase; letter-spacing: 0.05em">
          What that means for you
        </div>
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Willingness to spend on wages</span>
          <span class="num">{{ Math.round(wageBudgetShare(store.owner) * 100) }}%</span>
        </div>
        <div class="row row--between small" style="margin-bottom: 3px">
          <span class="muted">Patience with a bad run</span>
          <span class="num">{{ patienceLabel }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Losses they will absorb</span>
          <span class="num">{{ Math.round(lossCoverage(store.owner) * 100) }}%</span>
        </div>
      </div>
    </div>

    <div
      v-if="store.takeover"
      class="card"
      style="background: var(--warn-wash)"
    >
      <div class="card__body">
        <div class="bold small" style="color: var(--warn)">{{ TAKEOVER_STAGE[store.takeover.stage] }}</div>
        <div class="tiny muted" style="white-space: normal">
          {{ store.takeover.incoming.name }} — {{ OWNER_LABELS[store.takeover.incoming.kind] }}.
          Nobody has asked your opinion, and nobody is going to until it is done.
        </div>
      </div>
    </div>

    <template v-if="store.worldTakeovers.length">
      <div class="section-title">Elsewhere</div>
      <div class="card">
        <div class="list">
          <div v-for="t in store.worldTakeovers" :key="t.id" class="list__row list__row--static">
            <div class="list__main">
              <div class="list__primary">{{ store.clubById(t.clubId)?.name }}</div>
              <div class="list__secondary" style="white-space: normal">
                {{ TAKEOVER_STAGE[t.stage] }} — {{ OWNER_LABELS[t.incoming.kind] }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="section-title">Ask the board</div>
    <p class="tiny faint" style="margin: -2px 0 8px">
      The bigger the ask, the less likely they are to grant it and the more it
      costs you in their confidence when they refuse.
    </p>
    <div class="card">
      <div v-if="cooldown > 0" class="card__body">
        <div class="chip chip--warn">
          They will not hear another request for {{ cooldown }} week{{ cooldown === 1 ? '' : 's' }}
        </div>
      </div>
      <div class="list">
        <button
          v-for="option in requests"
          :key="option.kind"
          class="list__row"
          :style="option.available ? '' : 'opacity: 0.45'"
          @click="openRequest(option)"
        >
          <div class="list__main">
            <div class="list__primary">{{ option.label }}</div>
            <div class="list__secondary" style="white-space: normal">
              {{ option.available ? option.description : option.unavailableReason }}
            </div>
          </div>
          <span
            v-if="option.available"
            class="chip"
            :class="option.risk === 'high' ? 'chip--danger' : option.risk === 'medium' ? 'chip--warn' : ''"
            :title="RISK_LABELS[option.risk]"
          >{{ RISK_CHIP[option.risk] }}</span>
        </button>
      </div>
      <div class="card__body">
        <p class="tiny faint">
          Every request spends some of their confidence in you, whether or not it lands.
          {{ club.board.requestsThisSeason }} made this season.
        </p>
      </div>
    </div>

    <div v-if="lastResponse" class="card card--boxed" :style="lastResponse.outcome === 'refused' ? 'border-color: var(--danger)' : 'border-color: var(--accent)'">
      <div class="card__body small">{{ lastResponse.message }}</div>
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
        <div v-if="moodFactors.length" class="mt">
          <div class="tiny faint bold mb" style="text-transform: uppercase; letter-spacing: 0.05em">
            Why
          </div>
          <div v-for="(f, i) in moodFactors" :key="i" class="row row--between tiny" style="margin-bottom: 3px">
            <span class="muted" style="white-space: normal">{{ f.label }}</span>
            <span :class="f.delta >= 0 ? 'pos-val' : 'neg-val'" class="num">
              {{ f.delta >= 0 ? '+' : '' }}{{ f.delta.toFixed(1) }}
            </span>
          </div>
        </div>
        <p class="tiny faint mt">
          Attendance, and therefore matchday income, follows this. A mutinous crowd costs real money
          before it costs you your job.
        </p>
      </div>
    </div>

    <AppSheet
      v-if="asking"
      :title="asking.label"
      :subtitle="RISK_LABELS[asking.risk]"
      @close="asking = null"
    >
      <p class="small muted mb">{{ asking.description }}</p>

      <!-- A facility request needs an object. "Fund a facility upgrade" with
           no facility named was a request the board could only answer with a
           round sum and an instruction to go and spend it somewhere else. -->
      <div v-if="asking.kind === 'fundFacility'" class="field">
        <label class="field__label">Which one</label>
        <div class="list">
          <button
            v-for="f in facilityChoices"
            :key="f.kind"
            class="list__row"
            :style="askFacility === f.kind ? 'background: var(--accent-wash)' : ''"
            @click="askFacility = f.kind"
          >
            <div class="list__main">
              <div class="list__primary">{{ f.label }}</div>
              <div class="list__secondary num">
                LEVEL {{ f.level }} · {{ f.grade.toUpperCase() }}
              </div>
            </div>
            <div class="list__trail">
              <div class="list__value">{{ formatMoney(f.cost, store.currency) }}</div>
              <div class="list__sub">TO {{ f.level + 1 }}</div>
            </div>
          </button>
        </div>
        <div class="field__hint">
          The dearer the upgrade, the harder it is to get. They pay for the one you name.
        </div>
      </div>

      <div v-if="asking.maxAmount" class="field">
        <label class="field__label">How much — {{ formatMoney(askAmount, store.currency) }}</label>
        <input
          v-model.number="askAmount"
          class="slider"
          type="range"
          :min="0"
          :max="asking.maxAmount"
          :step="Math.max(1000, Math.round(asking.maxAmount / 40 / 1000) * 1000)"
        />
        <div class="field__hint">
          Asking for more makes refusal more likely. They may also meet you part of the way.
        </div>
      </div>

      <template #footer>
        <button class="btn btn--primary btn--block" @click="submit(asking!.kind)">
          Put it to the board
        </button>
      </template>
    </AppSheet>

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
