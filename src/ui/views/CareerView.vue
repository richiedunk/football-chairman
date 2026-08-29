<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { CAREER_LEVELS, levelFor, levelProgress, nextLevel, ordinal } from '../../engine/systems/career'
import { acceptJobOffer } from '../../engine/season'
import { formatMoney } from '../../engine/systems/valuation'

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

function accept(offerId: string) {
  const s = store.game
  if (!s) return
  const result = acceptJobOffer(s, offerId)
  store.commit()
  toast?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) router.push('/home')
}

function decline(offerId: string) {
  const s = store.game
  if (!s) return
  s.director.jobOffers = s.director.jobOffers.filter((o) => o.id !== offerId)
  store.commit()
  toast?.('Approach declined.')
}
</script>

<template>
  <div v-if="director">
    <h1 class="mb">{{ director.name }}</h1>

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

    <template v-if="director.jobOffers.length">
      <div class="section-title">Approaches</div>
      <div v-for="offer in director.jobOffers" :key="offer.id" class="card" style="border-color: var(--accent)">
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
            <button class="btn btn--primary btn--sm" @click="accept(offer.id)">Accept</button>
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

    <div class="section-title">The ladder</div>
    <div class="card">
      <div class="list">
        <div
          v-for="l in CAREER_LEVELS"
          :key="l.level"
          class="list__row list__row--static"
          :style="l.level === level.level ? 'background: rgba(74,222,128,0.07)' : ''"
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
  </div>
</template>
