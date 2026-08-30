<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { CAREER_LEVELS, levelFor, levelProgress, nextLevel, ordinal } from '../../engine/systems/career'
import { acceptJobOffer } from '../../engine/season'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { contractSummary } from '../../engine/systems/directorContract'
import AppSheet from '../components/AppSheet.vue'
import ContractNegotiator from '../components/ContractNegotiator.vue'
import type { ContractOffer } from '../../engine/systems/directorContract'
import type { JobOffer } from '../../engine/types'
import {
  MAX_CAREER_SEASONS, RETIREMENT_AGE, careerSummary, retirementHeadline, seasonsRemaining,
} from '../../engine/systems/directorCareer'

const store = useGameStore()
const router = useRouter()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const director = computed(() => store.game?.director ?? null)
const level = computed(() => levelFor(director.value?.xp ?? 0))
const upcoming = computed(() => nextLevel(director.value?.xp ?? 0))
const progress = computed(() => levelProgress(director.value?.xp ?? 0))

const xpByCategory = computed(() => {
  const log = director.value?.xpLog ?? []
  const totals = new Map<string, number>()
  for (const award of log) {
    totals.set(award.category, (totals.get(award.category) ?? 0) + award.amount)
  }
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
})

const negotiating = ref<JobOffer | null>(null)
const negotiatingClub = computed(() =>
  negotiating.value ? store.clubById(negotiating.value.clubId) : null,
)

function openNegotiation(offer: JobOffer) {
  negotiating.value = offer
}

function agree(contract: ContractOffer) {
  const s = store.game
  const offer = negotiating.value
  if (!s || !offer) return
  const result = acceptJobOffer(s, offer.id, contract)
  store.commit()
  negotiating.value = null
  toast?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) router.push('/welcome')
}

/** Money earned, grouped by where it came from. */
const earningsBySource = computed(() => {
  const log = director.value?.earnings ?? []
  const totals = new Map<string, number>()
  for (const entry of log) {
    totals.set(entry.source, (totals.get(entry.source) ?? 0) + entry.amount)
  }
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
})

const SOURCE_LABELS: Record<string, string> = {
  salary: 'Salary',
  signingBonus: 'Signing-on fees',
  promotionBonus: 'Promotion bonuses',
  trophyBonus: 'Trophy bonuses',
  targetBonus: 'Target bonuses',
  severance: 'Severance',
}

function decline(offerId: string) {
  const s = store.game
  if (!s) return
  s.director.jobOffers = s.director.jobOffers.filter((o) => o.id !== offerId)
  store.commit()
  toast?.('Approach declined.')
}

const seasonsLeft = computed(() => (director.value ? seasonsRemaining(director.value) : 0))
// Time left rather than time served: it starts full and drains, which is what a
// clock does. Drawn the other way round it was empty on the first day, and an
// empty bar reads as a control that has not loaded rather than as a career with
// everything still ahead of it.
const remainingShare = computed(() => {
  if (!director.value) return 0
  return Math.max(0, Math.min(100, (seasonsLeft.value / MAX_CAREER_SEASONS) * 100))
})
const clockTone = computed(() => {
  const left = seasonsLeft.value
  if (left <= 0) return 'var(--text-faint)'
  if (left <= 3) return 'var(--danger)'
  if (left <= 8) return 'var(--warn)'
  return 'var(--accent)'
})
const clockNote = computed(() => {
  const d = director.value
  if (!d) return ''
  if (d.retiredAtSeason !== undefined) {
    return d.retiredBecause === 'choice' ? 'STOOD DOWN' : 'RETIRED'
  }
  const left = seasonsLeft.value
  if (left === 1) return 'ONE SEASON LEFT'
  return `${left} SEASONS TO ${RETIREMENT_AGE}`
})

const summary = computed(() => {
  const s = store.game
  if (!s || s.director.retiredAtSeason === undefined) return null
  return careerSummary(s, s.director.retiredBecause ?? 'age')
})

/**
 * Standing down early. "Sixty-five at the latest" fixes the last day; it does
 * not oblige anyone to use all of it. Confirmed once, because it cannot be
 * undone and the button sits next to ordinary ones.
 */
const confirmingRetire = ref(false)
function standDown() {
  store.retire()
  confirmingRetire.value = false
}
</script>

<template>
  <div v-if="director">
    <h1 class="mb">{{ director.name }}</h1>

    <!-- The clock. It is the whole point of having an age: a three-year rebuild
         at fifty-eight is not the same decision as one at thirty-four, and the
         player can only feel that if the number is somewhere they look. -->
    <div class="career-clock">
      <div class="career-clock__age">
        <span class="career-clock__value">{{ director.age }}</span>
        <span class="career-clock__unit">years old</span>
      </div>
      <div class="career-clock__bar">
        <div
          class="career-clock__fill"
          :style="{ width: `${remainingShare}%`, background: clockTone }"
        />
      </div>
      <div class="career-clock__note" :style="{ color: clockTone }">{{ clockNote }}</div>
    </div>

    <template v-if="summary">
      <div class="card__head"><span class="card__title">The record</span></div>
      <div class="career-final">{{ retirementHeadline(summary) }}</div>
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Seasons</div>
          <div class="stat__value">{{ summary.seasonsWorked }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Clubs</div>
          <div class="stat__value">{{ summary.clubs }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Trophies</div>
          <div class="stat__value">{{ summary.trophies }}</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Best finish</div>
          <div class="stat__value stat__value--sm">
            {{ summary.bestFinish ? `${summary.bestFinish}${ordinal(summary.bestFinish)}` : '—' }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Net spend</div>
          <div class="stat__value stat__value--sm">
            {{ formatMoney(summary.netSpend, store.currency) }}
          </div>
        </div>
      </div>
    </template>

    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <div>
            <div class="bold" style="font-size: 1.1rem">{{ level.title }}</div>
            <div class="tiny muted">Level {{ level.level }} of {{ CAREER_LEVELS.length }}</div>
          </div>
          <div class="right">
            <div class="bold num">{{ director.xp.toLocaleString() }}</div>
            <div class="tiny faint">career XP</div>
          </div>
        </div>
        <MeterBar :value="progress * 100" />
        <div v-if="upcoming" class="tiny faint mt">
          {{ (upcoming.xpRequired - director.xp).toLocaleString() }} XP to {{ upcoming.title }} —
          unlocks clubs up to reputation {{ upcoming.maxClubReputation }}
        </div>
        <div v-else class="tiny mt" style="color: var(--gold)">
          Every job in world football is open to you.
        </div>
        <p class="small muted mt">{{ level.description }}</p>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <span class="card__title">Earnings</span>
        <span class="chip">{{ contractSummary(store.game!) }}</span>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Career total</div>
          <div class="stat__value">{{ formatMoney(director.careerEarnings, store.currency) }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">This season</div>
          <div class="stat__value stat__value--sm">
            {{ formatMoney(director.earningsThisSeason, store.currency) }}
          </div>
        </div>
      </div>
      <div v-if="director.contract" class="card__body stack">
        <div class="row row--between small">
          <span class="muted">Salary</span>
          <span class="bold num">{{ formatWage(director.contract.salary, store.currency) }}/wk</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Expires</span>
          <span class="num">end of {{ director.contract.expiresSeason }}</span>
        </div>
        <div v-if="director.contract.promotionBonus > 0" class="row row--between small">
          <span class="muted">Promotion bonus</span>
          <span class="num">{{ formatMoney(director.contract.promotionBonus, store.currency) }}</span>
        </div>
        <div v-if="director.contract.trophyBonus > 0" class="row row--between small">
          <span class="muted">Per trophy</span>
          <span class="num">{{ formatMoney(director.contract.trophyBonus, store.currency) }}</span>
        </div>
        <div v-if="director.contract.targetBonus > 0" class="row row--between small">
          <span class="muted">Board target met</span>
          <span class="num">{{ formatMoney(director.contract.targetBonus, store.currency) }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Severance if dismissed</span>
          <span class="num">
            {{ formatMoney(director.contract.salary * director.contract.severanceWeeks, store.currency) }}
          </span>
        </div>
      </div>
      <div v-if="earningsBySource.length" class="list" style="border-top: 1px solid var(--border)">
        <div v-for="[source, total] in earningsBySource" :key="source" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__secondary">{{ SOURCE_LABELS[source] ?? source }}</div>
          </div>
          <div class="list__value">{{ formatMoney(total, store.currency) }}</div>
        </div>
      </div>
      <div class="card__body">
        <p class="tiny faint">
          Your salary comes out of the club's wage bill, so what you take is
          money you cannot spend on players.
        </p>
      </div>
    </div>

    <template v-if="director.jobOffers.length">
      <div class="section-title">Approaches</div>
      <div v-for="offer in director.jobOffers" :key="offer.id" class="card card--boxed" style="border-color: var(--accent)">
        <div class="card__head">
          <span class="card__title">{{ offer.clubName }}</span>
          <span class="chip chip--accent">Rep {{ offer.clubReputation }}</span>
        </div>
        <div class="card__body">
          <div class="small muted mb">{{ offer.leagueName }}</div>
          <p class="small">{{ offer.pitch }}</p>
          <div class="row row--between small">
            <span class="muted">They expect</span>
            <span>{{ offer.expectation.description }}</span>
          </div>
          <div class="row row--between small">
            <span class="muted">Transfer budget</span>
            <span class="num">{{ formatMoney(offer.transferBudgetOffer, store.currency) }}</span>
          </div>
          <div class="btn-row mt">
            <button class="btn btn--primary btn--sm" @click="openNegotiation(offer)">
              Talk terms
            </button>
            <button class="btn btn--ghost btn--sm" @click="decline(offer.id)">Decline</button>
          </div>
          <p class="tiny faint mt">
            Moving clears your scouting reports and shortlist — they belonged to your old employer.
          </p>
        </div>
      </div>
    </template>

    <template v-if="xpByCategory.length">
      <div class="section-title">XP this season</div>
      <div class="card">
        <div class="list">
          <div v-for="[category, total] in xpByCategory" :key="category" class="list__row list__row--static">
            <div class="list__main">
              <div class="list__primary" style="text-transform: capitalize">{{ category }}</div>
            </div>
            <div class="list__value" :class="total >= 0 ? 'pos-val' : 'neg-val'">
              {{ total >= 0 ? '+' : '' }}{{ total.toLocaleString() }}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Breakdown</span></div>
        <div class="list">
          <div v-for="(award, i) in director.xpLog" :key="i" class="list__row list__row--static">
            <div class="list__main">
              <div class="list__secondary" style="white-space: normal">{{ award.reason }}</div>
            </div>
            <div class="list__value" :class="award.amount >= 0 ? 'pos-val' : 'neg-val'">
              {{ award.amount >= 0 ? '+' : '' }}{{ award.amount }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="section-title">Career</div>
    <div class="card">
      <div class="list">
        <div v-for="(entry, i) in director.careerHistory.slice().reverse()" :key="i" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ entry.clubName }}</div>
            <div class="list__secondary">
              {{ entry.fromSeason }}–{{ entry.toSeason ?? 'present' }} · {{ entry.outcome }}
              <template v-if="entry.bestFinish < 99">
                · best {{ entry.bestFinish }}{{ ordinal(entry.bestFinish) }}
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AppSheet
      v-if="negotiating && negotiatingClub"
      :title="`Your terms at ${negotiatingClub.shortName}`"
      subtitle="Agree a deal before you accept"
      @close="negotiating = null"
    >
      <ContractNegotiator
        :club="negotiatingClub"
        @agreed="agree"
        @cancel="negotiating = null"
      />
    </AppSheet>

    <div class="section-title">The ladder</div>
    <div class="card">
      <div class="list">
        <div
          v-for="l in CAREER_LEVELS"
          :key="l.level"
          class="list__row list__row--static"
          :style="l.level === level.level ? 'background: var(--accent-wash)' : ''"
        >
          <div class="pos" style="width: 26px">{{ l.level }}</div>
          <div class="list__main">
            <div class="list__primary">
              {{ l.title }}
              <span v-if="l.level === level.level" class="chip chip--accent">You</span>
            </div>
            <div class="list__secondary" style="white-space: normal">{{ l.description }}</div>
          </div>
          <div class="list__trail">
            <div class="list__sub">{{ l.xpRequired.toLocaleString() }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button class="btn btn--ghost" @click="router.push('/achievements')">
        Milestones ({{ store.achievementProgress.filter((a) => a.earned).length }}/{{ store.achievementProgress.length }})
      </button>
    </div>

    <!-- Last on the screen, because it is destructive and because nobody
         should meet it before they have read the record above it. -->
    <template v-if="!summary">
      <div class="card__head"><span class="card__title">Finishing early</span></div>
      <div class="career-standdown">
        <p class="small muted" style="margin-bottom: 12px">
          Sixty-five is the last day anyone works, but nobody is obliged to use all
          of it. Standing down ends the save — there is no coming back from it.
        </p>
        <button
          v-if="!confirmingRetire"
          class="btn btn--danger btn--block"
          @click="confirmingRetire = true"
        >Stand down</button>
        <div v-else class="btn-row">
          <button class="btn btn--ghost" @click="confirmingRetire = false">Keep working</button>
          <button class="btn btn--danger" @click="standDown">End my career</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.career-clock {
  margin: 0 calc(var(--pad) * -1) 4px;
  padding: 0 var(--pad) 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.career-clock__age { display: flex; align-items: baseline; gap: 8px; }
.career-clock__value {
  font-family: var(--font-num);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
}
.career-clock__unit { font-size: 0.82rem; color: var(--text-faint); }
.career-clock__bar {
  height: 5px;
  border-radius: 3px;
  background: var(--track);
  overflow: hidden;
}
.career-clock__fill { height: 5px; border-radius: 3px; }
.career-final {
  padding: 2px var(--pad) 14px;
  margin: 0 calc(var(--pad) * -1);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.career-standdown { padding: 8px 0 20px; }
.career-clock__note {
  font-family: var(--font-num);
  font-size: 0.62rem;
  letter-spacing: 0.11em;
}
</style>
