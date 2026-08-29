<script setup lang="ts">
import { computed, inject } from 'vue'
import { useGameStore } from '../../stores/game'
import PosBadge from '../components/PosBadge.vue'
import MeterBar from '../components/MeterBar.vue'
import { academyAssessment, INTAKE_WEEK } from '../../engine/systems/academy'
import { facilityGrade } from '../../engine/systems/facilities'
import { staffEffectiveness } from '../../engine/world/staffGen'

const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const club = computed(() => store.club)
const director = computed(() => store.staff.find((s) => s.role === 'academyDirector') ?? null)

const assessed = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []
  return store.academy.map((player) => ({
    player,
    assessment: academyAssessment(s, c, player),
  }))
})

const weeksToIntake = computed(() => {
  const s = store.game
  if (!s) return 0
  return s.date.week <= INTAKE_WEEK ? INTAKE_WEEK - s.date.week : 52 - s.date.week + INTAKE_WEEK
})

function promote(playerId: string) {
  const result = store.promote(playerId)
  toast?.(result.message, result.ok ? 'success' : 'error')
}

function stars(n: number): string {
  const full = Math.floor(n)
  const half = n % 1 >= 0.5
  return '★'.repeat(full) + (half ? '½' : '')
}
</script>

<template>
  <div v-if="club">
    <h1 class="mb">Academy</h1>

    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Youth facilities</span>
          <span class="chip">{{ facilityGrade(club.facilities.youthFacilities) }}</span>
        </div>
        <MeterBar :value="club.facilities.youthFacilities" :max="20" />
        <div class="row row--between small mt">
          <span class="muted">Academy director</span>
          <span>
            {{ director?.knownAs ?? 'None appointed' }}
            <template v-if="director"> ({{ staffEffectiveness(director) }})</template>
          </span>
        </div>
        <div class="row row--between small">
          <span class="muted">Next intake</span>
          <span class="num">{{ weeksToIntake }} weeks</span>
        </div>
        <p class="tiny faint mt">
          Facilities raise the floor of what comes through. The director raises the ceiling, and
          determines how well he can tell one from the other.
        </p>
      </div>
    </div>

    <div class="section-title">Prospects</div>
    <div class="card">
      <div class="list">
        <div v-for="entry in assessed" :key="entry.player.id">
          <button class="list__row" @click="$router.push(`/player/${entry.player.id}`)">
            <PosBadge :position="entry.player.position" />
            <div class="list__main">
              <div class="list__primary">{{ entry.player.knownAs }}</div>
              <div class="list__secondary">
                {{ entry.player.age }}y · {{ entry.assessment.confidence }} confidence
              </div>
            </div>
            <div class="list__trail">
              <div class="list__value" style="color: var(--gold)">
                {{ stars(entry.assessment.starRating) }}
              </div>
            </div>
          </button>
          <div class="card__body" style="padding-top: 0">
            <p class="tiny muted">{{ entry.assessment.verdict }}</p>
            <button
              class="btn btn--ghost btn--sm btn--block mt"
              @click="promote(entry.player.id)"
            >Promote to senior squad</button>
          </div>
        </div>
        <div v-if="!assessed.length" class="empty">
          Nobody in the academy. The next intake arrives in week {{ INTAKE_WEEK }}.
        </div>
      </div>
    </div>

    <p class="tiny faint mt" style="padding-bottom: 8px">
      Unpromoted players who age out are released at the end of the season. Promoting one takes a
      senior squad place and a professional wage, so it is a decision, not a formality.
    </p>
  </div>
</template>
