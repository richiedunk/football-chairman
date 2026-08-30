<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSetupStore } from '../../stores/setup'
import { useGameStore } from '../../stores/game'
import AppSheet from '../components/AppSheet.vue'
import ContractNegotiator from '../components/ContractNegotiator.vue'
import { formatMoney } from '../../engine/systems/valuation'
import { facilityGrade } from '../../engine/systems/facilities'
import { canTakeJobAt, levelFor, levelRequiredFor, xpNeededFor } from '../../engine/systems/career'
import type { Club } from '../../engine/types'
import type { ContractOffer } from '../../engine/systems/directorContract'

/**
 * The jobs board.
 *
 * Every club in the country is listed, grouped by division, with the ones your
 * record does not yet justify shown greyed out alongside the level they need.
 * A locked entry that simply refuses is a wall; one that names the level and
 * the XP gap is a target, and it lets a new director see the whole ladder they
 * are about to start climbing.
 */

const router = useRouter()
const setup = useSetupStore()
const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const detail = ref<Club | null>(null)
const negotiating = ref<Club | null>(null)
const showLocked = ref(true)

const state = computed(() => setup.pending?.state ?? null)
const director = computed(() => state.value?.director ?? null)
const level = computed(() => (director.value ? levelFor(director.value.xp) : null))

if (setup.candidates().length === 0) router.replace('/new')

/** Clubs grouped by division, best division first. */
const divisions = computed(() => {
  const s = state.value
  if (!s) return []
  const byLeague = new Map<string, Club[]>()
  for (const club of setup.candidates()) {
    const list = byLeague.get(club.leagueId) ?? []
    list.push(club)
    byLeague.set(club.leagueId, list)
  }
  return Array.from(byLeague.entries())
    .map(([leagueId, clubs]) => ({
      league: s.leagues[leagueId],
      clubs: clubs.sort((a, b) => b.reputation - a.reputation),
    }))
    .filter((entry) => Boolean(entry.league))
    .sort((a, b) => a.league.tier - b.league.tier)
})

const openCount = computed(
  () => setup.candidates().filter((c) => director.value && canTakeJobAt(director.value, c)).length,
)

function isOpen(club: Club): boolean {
  return director.value ? canTakeJobAt(director.value, club) : false
}

function lockNote(club: Club): string {
  if (!director.value) return ''
  const required = levelRequiredFor(club.reputation)
  const gap = xpNeededFor(director.value, club.reputation)
  return `Level ${required.level} · ${required.title} — ${gap.toLocaleString()} XP away`
}

function summaryFor(club: Club) {
  const s = state.value
  if (!s) return null
  const squad = club.squad.map((id) => s.players[id]).filter((p) => p && !p.isAcademy)
  const avgAge = squad.length ? squad.reduce((sum, p) => sum + p!.age, 0) / squad.length : 0
  const expiring = squad.filter(
    (p) => p!.contract && p!.contract.expiresSeason <= s.date.season,
  ).length

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

  return { squadSize: squad.length, avgAge, problems, strengths }
}

function openDetail(club: Club) {
  if (!isOpen(club)) {
    toast?.(lockNote(club))
    return
  }
  detail.value = club
}

function beginNegotiation(club: Club) {
  detail.value = null
  negotiating.value = club
}

function agree(offer: ContractOffer) {
  const club = negotiating.value
  if (!club) return
  try {
    const { state: next, setup: s } = setup.commit(club.id, offer)
    store.attachWithFactories(next, s.ids, s.names)
    setup.clear()
    void store.autosave()
    router.push('/welcome')
  } catch (e) {
    toast?.(e instanceof Error ? e.message : 'Could not start that career.', 'error')
  }
}
</script>

<template>
  <div v-if="director && level">
    <h1>Jobs board</h1>
    <p class="small muted mb">
      {{ openCount }} of {{ setup.candidates().length }} clubs will interview you.
      You are <strong>{{ level.title }}</strong> — {{ level.description.toLowerCase() }}
    </p>

    <label class="row small mb" style="gap: 6px">
      <input v-model="showLocked" type="checkbox" />
      Show jobs I cannot get yet
    </label>

    <template v-for="entry in divisions" :key="entry.league.id">
      <div
        v-if="showLocked || entry.clubs.some(isOpen)"
        class="section-title"
      >{{ entry.league.name }}</div>

      <div v-if="showLocked || entry.clubs.some(isOpen)" class="card">
        <div class="list">
          <template v-for="club in entry.clubs" :key="club.id">
            <button
              v-if="showLocked || isOpen(club)"
              class="list__row"
              :style="isOpen(club) ? '' : 'opacity: 0.42'"
              @click="openDetail(club)"
            >
              <span
                class="pos"
                :style="{ background: club.colors.primary + '2b', borderColor: club.colors.primary }"
                aria-hidden="true"
              >{{ isOpen(club) ? '' : '🔒' }}</span>
              <div class="list__main">
                <div class="list__primary">{{ club.name }}</div>
                <div class="list__secondary">
                  <template v-if="isOpen(club)">
                    {{ club.city }} ·
                    {{ formatMoney(club.finances.wageBudget) }}/wk wages ·
                    {{ club.facilities.stadium.capacity.toLocaleString() }} seats
                  </template>
                  <template v-else>{{ lockNote(club) }}</template>
                </div>
              </div>
              <div class="list__trail">
                <div class="list__value">{{ club.reputation }}</div>
                <div class="list__sub">rep</div>
              </div>
            </button>
          </template>
        </div>
      </div>
    </template>

    <!-- Club detail -->
    <AppSheet
      v-if="detail"
      :title="detail.name"
      :subtitle="`${state?.leagues[detail.leagueId]?.name} · ${detail.city} · founded ${detail.founded}`"
      @close="detail = null"
    >
      <div class="stat-grid mb">
        <div class="stat">
          <div class="stat__label">Balance</div>
          <div class="stat__value stat__value--sm" :class="detail.finances.balance < 0 ? 'neg-val' : ''">
            {{ formatMoney(detail.finances.balance) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Wage budget</div>
          <div class="stat__value stat__value--sm">{{ formatMoney(detail.finances.wageBudget) }}/wk</div>
        </div>
        <div class="stat">
          <div class="stat__label">Squad</div>
          <div class="stat__value stat__value--sm">
            {{ summaryFor(detail)?.squadSize }} · avg {{ summaryFor(detail)?.avgAge.toFixed(1) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Stadium</div>
          <div class="stat__value stat__value--sm">
            {{ detail.facilities.stadium.capacity.toLocaleString() }}
          </div>
        </div>
      </div>

      <div v-if="summaryFor(detail)?.problems.length" class="mb">
        <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em">
          The problems
        </div>
        <div class="chip-row" style="margin-top: 5px">
          <span v-for="p in summaryFor(detail)?.problems" :key="p" class="chip chip--danger">{{ p }}</span>
        </div>
      </div>
      <div v-if="summaryFor(detail)?.strengths.length" class="mb">
        <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em">
          What you have
        </div>
        <div class="chip-row" style="margin-top: 5px">
          <span v-for="s in summaryFor(detail)?.strengths" :key="s" class="chip chip--accent">{{ s }}</span>
        </div>
      </div>

      <div class="small mb">
        <span class="muted">Board expect:</span> {{ detail.board.expectation.description }}
      </div>
      <div class="small">
        <span class="muted">Training ground:</span> {{ facilityGrade(detail.facilities.trainingGround) }}
        · <span class="muted">Youth:</span> {{ facilityGrade(detail.facilities.youthFacilities) }}
      </div>

      <template #footer>
        <button class="btn btn--primary btn--block" @click="beginNegotiation(detail!)">
          Open contract talks
        </button>
      </template>
    </AppSheet>

    <!-- Contract negotiation -->
    <AppSheet
      v-if="negotiating"
      :title="`Your terms at ${negotiating.shortName}`"
      subtitle="Agree a deal before you take the job"
      @close="negotiating = null"
    >
      <ContractNegotiator
        :club="negotiating"
        :world="state"
        @agreed="agree"
        @cancel="negotiating = null"
      />
    </AppSheet>
  </div>
</template>
