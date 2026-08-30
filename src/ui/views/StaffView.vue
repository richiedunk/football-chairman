<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import AppSheet from '../components/AppSheet.vue'
import { formatWage } from '../../engine/systems/valuation'
import {
  availableCoaches, availableStaff, dismissStaff, hireCoach, hireStaff, relationshipLabel,
  respondToRequest,
} from '../../engine/systems/board'
import { expectedWage, ROLE_LABELS, STYLE_LABELS, staffEffectiveness } from '../../engine/world/staffGen'
import type { Staff, StaffRole } from '../../engine/types'
import Chevron from '../components/Chevron.vue'

const store = useGameStore()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const club = computed(() => store.club)
const coach = computed(() => store.headCoach)
const others = computed(() => store.staff.filter((s) => s.role !== 'headCoach'))
const requests = computed(() =>
  (coach.value?.coachProfile?.requests ?? []).filter((r) => r.response === 'pending'),
)

const hiringOpen = ref(false)
const candidates = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? availableCoaches(s, c) : []
})
const selectedCoach = ref<Staff | null>(null)
const offerWage = ref(0)
const offerSeasons = ref(3)

function openHire(candidate: Staff) {
  selectedCoach.value = candidate
  offerWage.value = Math.round(Math.pow(candidate.reputation / 50, 3) * 2_400 * 4.5)
  offerSeasons.value = 3
}

function confirmHire() {
  const s = store.game
  const c = club.value
  const candidate = selectedCoach.value
  if (!s || !c || !candidate) return
  const result = hireCoach(s, c, candidate, offerWage.value, offerSeasons.value)
  store.commit()
  if (result.ok) {
    toast?.(`${candidate.knownAs} appointed as head coach.`, 'success')
    selectedCoach.value = null
    hiringOpen.value = false
  } else {
    toast?.(result.error, 'error')
  }
}

// --- Backroom hiring -------------------------------------------------------
const hireRole = ref<StaffRole | null>(null)
const selectedStaff = ref<Staff | null>(null)
const staffWage = ref(0)
const staffSeasons = ref(2)

const HIREABLE_ROLES: StaffRole[] = [
  'scout', 'assistantCoach', 'physio', 'analyst', 'academyDirector',
  'fitnessCoach', 'goalkeepingCoach',
]

const roleCandidates = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c || !hireRole.value) return []
  return availableStaff(s, c, hireRole.value)
})

function countOf(role: StaffRole): number {
  return store.staff.filter((s) => s.role === role).length
}

function openRoleHire(role: StaffRole) {
  hireRole.value = role
  selectedStaff.value = null
}

function pickStaff(candidate: Staff) {
  selectedStaff.value = candidate
  staffWage.value = expectedWage(candidate)
  staffSeasons.value = 2
}

function confirmStaffHire() {
  const s = store.game
  const c = club.value
  const candidate = selectedStaff.value
  if (!s || !c || !candidate) return
  const result = hireStaff(s, c, candidate, staffWage.value, staffSeasons.value)
  store.commit()
  if (result.ok) {
    toast?.(`${candidate.knownAs} has joined as ${ROLE_LABELS[candidate.role].toLowerCase()}.`, 'success')
    hireRole.value = null
    selectedStaff.value = null
  } else {
    toast?.(result.error, 'error')
  }
}

function dismiss(member: Staff) {
  const s = store.game
  const c = club.value
  if (!s || !c) return
  const result = dismissStaff(s, c, member)
  store.commit()
  toast?.(
    result.ok
      ? `${member.knownAs} has left. Settlement cost ${result.cost.toLocaleString()}.`
      : result.error,
    result.ok ? 'success' : 'error',
  )
}

function answer(requestId: string, accept: boolean) {
  const s = store.game
  const c = club.value
  if (!s || !c) return
  const message = respondToRequest(s, c, requestId, accept)
  store.commit()
  if (message) toast?.(message)
}
</script>

<template>
  <div v-if="club">

    <div v-if="coach?.coachProfile" class="card">
      <div class="card__head">
        <span class="card__title">Head coach</span>
        <span class="chip chip--info">{{ STYLE_LABELS[coach.coachProfile.style] }}</span>
      </div>
      <div class="card__body">
        <div class="row row--between mb">
          <div>
            <div class="bold">{{ coach.knownAs }}</div>
            <div class="tiny muted">
              {{ coach.age }}y · {{ coach.coachProfile.formation }} ·
              {{ formatWage(coach.contract?.wage ?? 0, store.currency) }}/wk
            </div>
          </div>
          <span class="chip">Rep {{ Math.round(coach.reputation) }}</span>
        </div>

        <div class="stack">
          <div>
            <div class="row row--between">
              <span class="small muted">Relationship with you</span>
              <span class="small">{{ relationshipLabel(coach.coachProfile.dofRelationship) }}</span>
            </div>
            <MeterBar :value="coach.coachProfile.dofRelationship" />
          </div>
          <div>
            <div class="row row--between">
              <span class="small muted">Job security</span>
              <span class="small num">{{ Math.round(coach.coachProfile.jobSecurity) }}</span>
            </div>
            <MeterBar :value="coach.coachProfile.jobSecurity" />
          </div>
          <div>
            <div class="row row--between">
              <span class="small muted">Trust in youth</span>
              <span class="small num">{{ Math.round(coach.coachProfile.trustInYouth) }}</span>
            </div>
            <MeterBar :value="coach.coachProfile.trustInYouth" :semantic="false" />
          </div>
          <div>
            <div class="row row--between">
              <span class="small muted">Rotation</span>
              <span class="small num">{{ Math.round(coach.coachProfile.rotationTendency) }}</span>
            </div>
            <MeterBar :value="coach.coachProfile.rotationTendency" :semantic="false" />
          </div>
        </div>

        <p class="tiny faint mt">
          He picks the team. Sign players who do not fit what he wants and they will not play,
          however much you paid for them.
        </p>
        <div class="chip-row mt">
          <span v-for="a in coach.coachProfile.valuedAttributes" :key="a" class="chip chip--accent">
            values {{ a.replace(/([A-Z])/g, ' $1').toLowerCase() }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="card card--boxed" style="border-color: var(--danger)">
      <div class="card__body">
        <div class="bold" style="color: var(--danger)">No head coach</div>
        <p class="small muted">
          Nobody is picking the team. Appoint someone before the next fixture.
        </p>
        <button class="btn btn--primary btn--block" @click="hiringOpen = true">Appoint a coach</button>
      </div>
    </div>

    <template v-if="requests.length">
      <div class="section-title">The coach wants</div>
      <div v-for="request in requests" :key="request.id" class="card">
        <div class="card__body">
          <div class="row row--between mb">
            <div>
              <div class="bold">A {{ request.position }}</div>
              <div class="tiny muted">
                Minimum standard {{ request.minAbility }} · raised week {{ request.weekRaised }}
              </div>
            </div>
            <span
              class="chip"
              :class="request.urgency === 'urgent' ? 'chip--danger' : request.urgency === 'wanted' ? 'chip--warn' : ''"
            >{{ request.urgency }}</span>
          </div>
          <div class="btn-row">
            <button class="btn btn--primary btn--sm" @click="answer(request.id, true)">
              Agree to look
            </button>
            <button class="btn btn--ghost btn--sm" @click="answer(request.id, false)">
              Tell him no
            </button>
          </div>
          <p class="tiny faint mt">
            Ignoring him entirely costs more than an honest refusal.
          </p>
        </div>
      </div>
    </template>

    <div class="section-title">Backroom</div>
    <div class="card">
      <div class="list">
        <div v-for="member in others" :key="member.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ member.knownAs }}</div>
            <div class="list__secondary">
              {{ ROLE_LABELS[member.role] }} · {{ formatWage(member.contract?.wage ?? 0, store.currency) }}/wk
            </div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ staffEffectiveness(member) }}</div>
            <div class="list__sub">rating</div>
          </div>
          <button class="btn btn--ghost btn--sm" aria-label="Dismiss" @click="dismiss(member)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div v-if="!others.length" class="empty">No backroom staff.</div>
      </div>
    </div>

    <div class="section-title">Hire</div>
    <div class="card">
      <div class="list">
        <button
          v-for="role in HIREABLE_ROLES"
          :key="role"
          class="list__row"
          @click="openRoleHire(role)"
        >
          <div class="list__main">
            <div class="list__primary">{{ ROLE_LABELS[role] }}</div>
            <div class="list__secondary">
              {{ countOf(role) }} employed
              <template v-if="role === 'scout' && countOf(role) < 2">
                — more scouts means more ground covered
              </template>
            </div>
          </div>
          <Chevron />
        </button>
      </div>
    </div>

    <button v-if="coach" class="btn btn--ghost btn--block mt" @click="hiringOpen = true">
      Replace the head coach
    </button>

    <AppSheet
      v-if="hireRole"
      :title="`Hire a ${ROLE_LABELS[hireRole].toLowerCase()}`"
      subtitle="Only people who would consider a club this size are shown"
      @close="hireRole = null; selectedStaff = null"
    >
      <div v-if="!selectedStaff" class="list">
        <button v-for="c in roleCandidates" :key="c.id" class="list__row" @click="pickStaff(c)">
          <div class="list__main">
            <div class="list__primary">{{ c.knownAs }}</div>
            <div class="list__secondary">
              {{ c.age }}y · wants {{ formatWage(expectedWage(c), store.currency) }}/wk
            </div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ staffEffectiveness(c) }}</div>
            <div class="list__sub">rating</div>
          </div>
        </button>
        <div v-if="!roleCandidates.length" class="empty">
          Nobody available for this role who would join a club of this size.
        </div>
      </div>

      <div v-else>
        <div class="mb">
          <div class="bold">{{ selectedStaff.knownAs }}</div>
          <div class="small muted">
            {{ ROLE_LABELS[selectedStaff.role] }} · rating {{ staffEffectiveness(selectedStaff) }}
            · reputation {{ Math.round(selectedStaff.reputation) }}
          </div>
        </div>
        <div class="field">
          <label class="field__label">Weekly wage — {{ formatWage(staffWage, store.currency) }}</label>
          <input
            v-model.number="staffWage"
            class="slider"
            type="range"
            :min="200"
            :max="Math.max(3000, Math.round(expectedWage(selectedStaff) * 3))"
            :step="50"
          />
          <div class="field__hint">
            He expects around {{ formatWage(expectedWage(selectedStaff), store.currency) }}.
            You have {{ formatWage((club?.finances.wageBudget ?? 0) - store.wageBill, store.currency) }} of headroom.
          </div>
        </div>
        <div class="field">
          <label class="field__label">Contract — {{ staffSeasons }} season{{ staffSeasons === 1 ? '' : 's' }}</label>
          <input v-model.number="staffSeasons" class="slider" type="range" min="1" max="5" />
        </div>
      </div>

      <template #footer>
        <div v-if="selectedStaff" class="btn-row">
          <button class="btn btn--ghost" @click="selectedStaff = null">Back</button>
          <button class="btn btn--primary" @click="confirmStaffHire">Hire</button>
        </div>
        <div v-else class="tiny faint center">Select someone to make an offer.</div>
      </template>
    </AppSheet>

    <AppSheet
      v-if="hiringOpen"
      title="Available coaches"
      subtitle="Only coaches who would consider a club this size are shown"
      @close="hiringOpen = false; selectedCoach = null"
    >
      <!-- Named slots must be direct children of the component: a #footer
           nested inside a v-if template crashes the template compiler, so the
           branch lives inside each slot rather than around them. -->
      <div v-if="!selectedCoach" class="list">
        <button v-for="c in candidates" :key="c.id" class="list__row" @click="openHire(c)">
          <div class="list__main">
            <div class="list__primary">{{ c.knownAs }}</div>
            <div class="list__secondary">
              {{ c.age }}y · {{ c.coachProfile ? STYLE_LABELS[c.coachProfile.style] : '' }}
              · {{ c.coachProfile?.formation }}
            </div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ Math.round(c.reputation) }}</div>
            <div class="list__sub">rep</div>
          </div>
        </button>
        <div v-if="!candidates.length" class="empty">
          No coaches available who would consider this job.
        </div>
      </div>

      <div v-else>
        <div class="mb">
          <div class="bold">{{ selectedCoach.knownAs }}</div>
          <div class="small muted">
            {{ selectedCoach.coachProfile ? STYLE_LABELS[selectedCoach.coachProfile.style] : '' }}
            · {{ selectedCoach.coachProfile?.formation }}
            · trusts youth {{ Math.round(selectedCoach.coachProfile?.trustInYouth ?? 0) }}/100
          </div>
        </div>
        <div class="field">
          <label class="field__label">Weekly wage — {{ formatWage(offerWage, store.currency) }}</label>
          <input
            v-model.number="offerWage"
            class="slider"
            type="range"
            :min="500"
            :max="Math.max(20000, Math.round(Math.pow(selectedCoach.reputation / 50, 3) * 2400 * 9))"
            :step="250"
          />
        </div>
        <div class="field">
          <label class="field__label">Contract — {{ offerSeasons }} season{{ offerSeasons === 1 ? '' : 's' }}</label>
          <input v-model.number="offerSeasons" class="slider" type="range" min="1" max="5" />
        </div>
      </div>

      <template #footer>
        <div v-if="selectedCoach" class="btn-row">
          <button class="btn btn--ghost" @click="selectedCoach = null">Back</button>
          <button class="btn btn--primary" @click="confirmHire">Appoint</button>
        </div>
        <div v-else class="tiny faint center">Select a coach to make an offer.</div>
      </template>
    </AppSheet>
  </div>
</template>
