<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSetupStore } from '../../stores/setup'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import { facilityGrade } from '../../engine/systems/facilities'
import type { Club } from '../../engine/types'

const router = useRouter()
const setup = useSetupStore()
const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const selected = ref<string | null>(null)
const clubs = computed(() => setup.candidates())

if (clubs.value.length === 0) router.replace('/new')

function summaryFor(club: Club) {
  const state = setup.pending?.state
  if (!state) return null
  const squad = club.squad.map((id) => state.players[id]).filter((p) => p && !p.isAcademy)
  const avgAge = squad.length ? squad.reduce((s, p) => s + p!.age, 0) / squad.length : 0
  const expiring = squad.filter(
    (p) => p!.contract && p!.contract.expiresSeason <= state.date.season,
  ).length

  // The problems are stated plainly rather than left to be discovered — at
  // level 1 every option is a mess, and the choice is which mess suits you.
  const problems: string[] = []
  if (club.finances.debt > 0) problems.push(`${formatMoney(club.finances.debt)} of debt`)
  if (club.finances.balance < 0) problems.push('overdrawn')
  if (squad.length < 20) problems.push(`only ${squad.length} senior players`)
  if (avgAge > 29) problems.push(`ageing squad (avg ${avgAge.toFixed(1)})`)
  if (expiring > 3) problems.push(`${expiring} contracts expiring`)
  if (club.facilities.trainingGround <= 4) problems.push('poor training ground')
  if (club.facilities.youthFacilities <= 4) problems.push('no youth setup to speak of')

  const strengths: string[] = []
  if (club.finances.balance > 500_000) strengths.push('cash in the bank')
  if (club.facilities.youthFacilities >= 8) strengths.push('a real academy')
  if (club.fanbase > 40) strengths.push('a big support for this level')
  if (avgAge > 0 && avgAge < 25) strengths.push('a young squad')

  return {
    league: state.leagues[club.leagueId]?.name ?? '',
    squadSize: squad.length,
    avgAge,
    problems,
    strengths,
  }
}

function choose(clubId: string) {
  try {
    const { state, setup: s } = setup.commit(clubId)
    store.attachWithFactories(state, s.ids, s.names)
    setup.clear()
    void store.autosave()
    router.push('/home')
  } catch (e) {
    toast?.(e instanceof Error ? e.message : 'Could not start that career.', 'error')
  }
}
</script>

<template>
  <div>
    <h1>Take a job</h1>
    <p class="small muted mb">
      You have no track record, so these are the clubs willing to take a chance.
      None of them are in good shape. Pick the problem you would rather solve.
    </p>

    <div v-for="club in clubs" :key="club.id" class="card">
      <button
        class="card__head"
        style="width: 100%; background: none; border-top: 0; border-left: 0; border-right: 0; cursor: pointer; text-align: left"
        @click="selected = selected === club.id ? null : club.id"
      >
        <div class="grow">
          <div class="bold">{{ club.name }}</div>
          <div class="tiny muted">
            {{ summaryFor(club)?.league }} · {{ club.city }} · founded {{ club.founded }}
          </div>
        </div>
        <!-- Club colours tint the chip but never set the text colour: a club
             whose secondary is near-black renders an unreadable label on a
             dark ground. Border and wash carry the identity instead. -->
        <span
          class="chip"
          :style="{ background: club.colors.primary + '2b', borderColor: club.colors.primary }"
          style="color: var(--text)"
        >{{ club.nickname }}</span>
      </button>

      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Balance</div>
          <div class="stat__value stat__value--sm" :class="club.finances.balance < 0 ? 'neg-val' : ''">
            {{ formatMoney(club.finances.balance) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Wage budget</div>
          <div class="stat__value stat__value--sm">{{ formatMoney(club.finances.wageBudget) }}/wk</div>
        </div>
        <div class="stat">
          <div class="stat__label">Squad</div>
          <div class="stat__value stat__value--sm">
            {{ summaryFor(club)?.squadSize }} · avg {{ summaryFor(club)?.avgAge.toFixed(1) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Stadium</div>
          <div class="stat__value stat__value--sm">
            {{ club.facilities.stadium.capacity.toLocaleString() }}
          </div>
        </div>
      </div>

      <div class="card__body">
        <div v-if="summaryFor(club)?.problems.length" class="mb">
          <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em">
            The problems
          </div>
          <div class="chip-row" style="margin-top: 5px">
            <span v-for="p in summaryFor(club)?.problems" :key="p" class="chip chip--danger">{{ p }}</span>
          </div>
        </div>
        <div v-if="summaryFor(club)?.strengths.length" class="mb">
          <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em">
            What you have
          </div>
          <div class="chip-row" style="margin-top: 5px">
            <span v-for="s in summaryFor(club)?.strengths" :key="s" class="chip chip--accent">{{ s }}</span>
          </div>
        </div>

        <div v-if="selected === club.id" class="stack">
          <div class="divider" />
          <div class="small">
            <span class="muted">Board expect:</span> {{ club.board.expectation.description }}
          </div>
          <div class="small">
            <span class="muted">Training ground:</span> {{ facilityGrade(club.facilities.trainingGround) }}
            · <span class="muted">Youth:</span> {{ facilityGrade(club.facilities.youthFacilities) }}
          </div>
          <button class="btn btn--primary btn--block" @click="choose(club.id)">
            Take the job at {{ club.shortName }}
          </button>
        </div>
        <button v-else class="btn btn--ghost btn--block btn--sm" @click="selected = club.id">
          More detail
        </button>
      </div>
    </div>
  </div>
</template>
