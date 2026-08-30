<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import AppSheet from '../components/AppSheet.vue'
import { formatMoney } from '../../engine/systems/valuation'
import {
  awardContract, baseCost, baseWeeks, borrowingLimit, capacityLostDuring, inviteTenders,
  revenuePerHead, STAND_TYPE_LABELS, WORK_DESCRIPTIONS, WORK_LABELS,
  type Financing, type WorkSpec,
} from '../../engine/systems/stadium'
import type { Stand, StadiumWorkKind, StandType } from '../../engine/types'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const club = computed(() => store.club)
const stadium = computed(() => club.value?.facilities.stadium ?? null)
const project = computed(() => club.value?.facilities.stadiumProject ?? null)

const builtCapacity = computed(
  () => stadium.value?.stands.reduce((sum, s) => sum + s.capacity, 0) ?? 0,
)
const closedSeats = computed(
  () => stadium.value?.stands.reduce((sum, s) => sum + s.closedSeats, 0) ?? 0,
)
const boxes = computed(
  () => stadium.value?.stands.reduce((sum, s) => sum + s.hospitalityBoxes, 0) ?? 0,
)

/** Which works make sense for a given stand, given what it already is. */
function worksFor(stand: Stand | null): StadiumWorkKind[] {
  if (!stand) return ['rebuild', 'relocate']
  const works: StadiumWorkKind[] = []
  if (stand.condition < 92 || stand.closedSeats > 0) works.push('repair')
  if (stand.type !== 'coveredSeated' || stand.hospitalityBoxes < 60) works.push('upgrade')
  works.push('expand')
  return works
}

// --- Tender flow -----------------------------------------------------------
const chooserOpen = ref(false)
const selectedStand = ref<Stand | null>(null)
const workKind = ref<StadiumWorkKind>('repair')
const addCapacity = ref(3000)
const targetType = ref<StandType>('coveredSeated')
const addBoxes = ref(10)
const newName = ref('')
const tenderOpen = ref(false)
const financing = ref<Financing>('cash')

const borrowCeiling = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? borrowingLimit(s, c) : 0
})

const spec = computed<WorkSpec>(() => ({
  kind: workKind.value,
  standId: selectedStand.value?.id,
  capacity: workKind.value === 'expand'
    ? addCapacity.value
    : workKind.value === 'rebuild' || workKind.value === 'relocate'
      ? addCapacity.value
      : undefined,
  standType: workKind.value === 'upgrade' ? targetType.value : undefined,
  hospitalityBoxes: workKind.value === 'upgrade' ? addBoxes.value : undefined,
  stadiumName: workKind.value === 'relocate' ? (newName.value || undefined) : undefined,
}))

const estimate = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return { cost: 0, weeks: 0, lost: 0 }
  return {
    cost: baseCost(s, c, spec.value),
    weeks: baseWeeks(c, spec.value),
    lost: capacityLostDuring(c, spec.value),
  }
})

const bids = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []
  return inviteTenders(s, c, spec.value)
})

function openWork(stand: Stand | null, kind: StadiumWorkKind) {
  selectedStand.value = stand
  workKind.value = kind
  addCapacity.value = kind === 'expand'
    ? 3000
    : Math.max(5000, Math.round((builtCapacity.value * 1.4) / 500) * 500)
  targetType.value = stand?.type === 'coveredSeated' ? 'coveredSeated' : 'coveredSeated'
  addBoxes.value = 10
  newName.value = ''
  chooserOpen.value = true
}

function goToTender() {
  chooserOpen.value = false
  tenderOpen.value = true
}

function award(architectId: string) {
  const s = store.game
  const c = club.value
  if (!s || !c) return
  const result = awardContract(s, c, store.idFactory(), spec.value, architectId, financing.value)
  store.commit()
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) tenderOpen.value = false
}

const RISK_CLASS: Record<string, string> = {
  dependable: 'chip--accent',
  'usually fine': '',
  'has form for overruns': 'chip--warn',
  'a gamble': 'chip--danger',
}

function conditionLabel(condition: number): string {
  if (condition >= 85) return 'Excellent'
  if (condition >= 65) return 'Sound'
  if (condition >= 45) return 'Tired'
  if (condition >= 30) return 'Poor'
  return 'Condemned in places'
}
</script>

<template>
  <div v-if="club && stadium">
    <h1>{{ stadium.name }}</h1>
    <p class="small muted mb">
      Built {{ stadium.builtYear }} ·
      {{ stadium.owned ? 'Owned by the club' : 'The club is a tenant here' }}
    </p>

    <div class="card">
      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Usable capacity</div>
          <div class="stat__value">{{ stadium.capacity.toLocaleString() }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Built capacity</div>
          <div class="stat__value stat__value--sm">{{ builtCapacity.toLocaleString() }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Executive boxes</div>
          <div class="stat__value stat__value--sm">{{ boxes }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Revenue per head</div>
          <div class="stat__value stat__value--sm">
            {{ formatMoney(Math.round(revenuePerHead(stadium)), store.currency) }}
          </div>
        </div>
      </div>

      <div v-if="closedSeats > 0" class="card__body" style="background: var(--danger-wash)">
        <div class="small bold" style="color: var(--danger)">
          {{ closedSeats.toLocaleString() }} places closed by the safety officer
        </div>
        <div class="tiny muted">
          They stay shut, and unsold, until the stands concerned are repaired.
        </div>
      </div>

      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Pitch</span>
          <span class="small">{{ conditionLabel(stadium.pitchCondition) }}</span>
        </div>
        <MeterBar :value="stadium.pitchCondition" />
      </div>
    </div>

    <!-- Work in progress -->
    <div v-if="project" class="card card--boxed" style="border-color: var(--info)">
      <div class="card__head">
        <span class="card__title">Work in progress</span>
        <span class="chip chip--info">{{ WORK_LABELS[project.kind] }}</span>
      </div>
      <div class="card__body stack">
        <div class="bold">{{ project.description }}</div>
        <div class="small muted">{{ project.architectFirm }}</div>
        <div>
          <div class="row row--between" style="margin-bottom: 5px">
            <span class="small muted">Progress</span>
            <span class="small num">
              {{ project.agreedWeeks - project.weeksRemaining }} of {{ project.agreedWeeks }} weeks
            </span>
          </div>
          <MeterBar
            :value="project.agreedWeeks - project.weeksRemaining"
            :max="project.agreedWeeks"
            :semantic="false"
          />
        </div>
        <div class="row row--between small">
          <span class="muted">Contract value</span>
          <span class="num">{{ formatMoney(project.agreedCost, store.currency) }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Spent so far</span>
          <span class="num">{{ formatMoney(project.spent, store.currency) }}</span>
        </div>
        <div v-if="project.overrunCost > 0" class="row row--between small">
          <span class="muted">Overrun</span>
          <span class="num neg-val">
            {{ formatMoney(project.overrunCost, store.currency) }} · {{ project.overrunWeeks }}w
          </span>
        </div>
        <div v-if="project.capacityReduction > 0" class="chip chip--warn">
          {{ project.capacityReduction.toLocaleString() }} places out of use while work continues
        </div>
      </div>
    </div>

    <!-- Stands -->
    <div class="section-title">The stands</div>
    <div v-for="stand in stadium.stands" :key="stand.id" class="card">
      <div class="card__head">
        <span class="card__title">{{ stand.name }}</span>
        <span class="chip">{{ STAND_TYPE_LABELS[stand.type] }}</span>
      </div>
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">
            {{ stand.capacity.toLocaleString() }} places
            <template v-if="stand.closedSeats > 0">
              · <span class="neg-val">{{ stand.closedSeats.toLocaleString() }} closed</span>
            </template>
            <template v-if="stand.hospitalityBoxes > 0">
              · {{ stand.hospitalityBoxes }} boxes
            </template>
          </span>
          <span class="small">{{ conditionLabel(stand.condition) }}</span>
        </div>
        <MeterBar :value="stand.condition" />
        <div class="tiny faint" style="margin-top: 4px">
          Built {{ stand.builtYear }} · {{ store.game!.date.season - stand.builtYear }} years old
        </div>

        <div v-if="!project && stadium.owned" class="chip-row mt">
          <button
            v-for="kind in worksFor(stand)"
            :key="kind"
            class="btn btn--ghost btn--sm"
            @click="openWork(stand, kind)"
          >{{ WORK_LABELS[kind] }}</button>
        </div>
      </div>
    </div>

    <!-- Whole-ground options -->
    <div class="section-title">The whole ground</div>
    <div class="card">
      <div class="list">
        <button
          class="list__row"
          :style="project || !stadium.owned ? 'opacity: 0.45' : ''"
          @click="!project && stadium.owned && openWork(null, 'rebuild')"
        >
          <div class="list__main">
            <div class="list__primary">{{ WORK_LABELS.rebuild }}</div>
            <div class="list__secondary" style="white-space: normal">
              {{ project ? 'Work is already under way.'
                : !stadium.owned ? 'The club does not own the ground.'
                : WORK_DESCRIPTIONS.rebuild }}
            </div>
          </div>
        </button>
        <button
          class="list__row"
          :style="project ? 'opacity: 0.45' : ''"
          @click="!project && openWork(null, 'relocate')"
        >
          <div class="list__main">
            <div class="list__primary">{{ WORK_LABELS.relocate }}</div>
            <div class="list__secondary" style="white-space: normal">
              {{ project ? 'Work is already under way.' : WORK_DESCRIPTIONS.relocate }}
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Brief -->
    <AppSheet
      v-if="chooserOpen"
      :title="`${WORK_LABELS[workKind]}${selectedStand ? ` — ${selectedStand.name}` : ''}`"
      :subtitle="WORK_DESCRIPTIONS[workKind]"
      @close="chooserOpen = false"
    >
      <div v-if="workKind === 'expand'" class="field">
        <label class="field__label">Places to add — {{ addCapacity.toLocaleString() }}</label>
        <input v-model.number="addCapacity" class="slider" type="range" min="500" max="20000" step="500" />
      </div>

      <template v-if="workKind === 'upgrade'">
        <div class="field">
          <label class="field__label">What it becomes</label>
          <div class="segmented">
            <button
              v-for="t in (['terrace','seated','coveredSeated'] as StandType[])"
              :key="t"
              class="segmented__item"
              :class="{ 'is-active': targetType === t }"
              @click="targetType = t"
            >{{ STAND_TYPE_LABELS[t] }}</button>
          </div>
        </div>
        <div class="field">
          <label class="field__label">Executive boxes to add — {{ addBoxes }}</label>
          <input v-model.number="addBoxes" class="slider" type="range" min="0" max="60" />
          <div class="field__hint">
            Boxes are worth many times an ordinary seat on matchday. Often the
            single most profitable thing you can do to a ground.
          </div>
        </div>
      </template>

      <template v-if="workKind === 'rebuild' || workKind === 'relocate'">
        <div class="field">
          <label class="field__label">Capacity of the new ground — {{ addCapacity.toLocaleString() }}</label>
          <input v-model.number="addCapacity" class="slider" type="range" min="2000" max="80000" step="1000" />
          <div class="field__hint">
            Seats only pay for themselves if you can fill them. Your average
            gate is driven by fanbase and form, not by capacity.
          </div>
        </div>
      </template>

      <div v-if="workKind === 'relocate'" class="field">
        <label class="field__label">Name of the new stadium</label>
        <input v-model="newName" class="input" type="text" :placeholder="`New ${club.city} Stadium`" maxlength="40" />
        <div class="field__hint" style="color: var(--warn)">
          Supporters do not all follow a club that leaves its ground. Expect to
          lose some of them for good.
        </div>
      </div>

      <div class="card" style="background: var(--bg-sunken)">
        <div class="card__body stack">
          <div class="row row--between small">
            <span class="muted">Indicative cost before fees</span>
            <span class="bold num">{{ formatMoney(estimate.cost, store.currency) }}</span>
          </div>
          <div class="row row--between small">
            <span class="muted">Indicative duration</span>
            <span class="num">{{ estimate.weeks }} weeks</span>
          </div>
          <div class="row row--between small">
            <span class="muted">Places lost during works</span>
            <span class="num">{{ estimate.lost.toLocaleString() }}</span>
          </div>
          <div class="row row--between small">
            <span class="muted">Club balance</span>
            <span class="num">{{ formatMoney(club.finances.balance, store.currency) }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <button class="btn btn--primary btn--block" @click="goToTender">Invite tenders</button>
      </template>
    </AppSheet>

    <!-- Tender panel -->
    <AppSheet
      v-if="tenderOpen"
      title="Tenders received"
      :subtitle="`${WORK_LABELS[workKind]}${selectedStand ? ` — ${selectedStand.name}` : ''}`"
      @close="tenderOpen = false"
    >
      <div class="field">
        <label class="field__label">How it is paid for</label>
        <div class="segmented">
          <button
            class="segmented__item"
            :class="{ 'is-active': financing === 'cash' }"
            @click="financing = 'cash'"
          >From reserves</button>
          <button
            class="segmented__item"
            :class="{ 'is-active': financing === 'borrow' }"
            @click="financing = 'borrow'"
          >Borrow</button>
        </div>
        <div class="field__hint">
          <template v-if="financing === 'cash'">
            Paid from the balance as the work proceeds. You have
            {{ formatMoney(club.finances.balance, store.currency) }}.
          </template>
          <template v-else>
            The money arrives now and is serviced out of revenue for years
            afterwards — which is how stadiums actually get built. You can
            borrow up to {{ formatMoney(borrowCeiling, store.currency) }}.
          </template>
        </div>
      </div>

      <div class="list">
        <div v-for="bid in bids" :key="bid.architectId">
          <button
            class="list__row"
            :style="bid.available ? '' : 'opacity: 0.45'"
            @click="bid.available && award(bid.architectId)"
          >
            <div class="list__main">
              <div class="list__primary">{{ bid.firm }}</div>
              <div class="list__secondary" style="white-space: normal">
                {{ bid.available ? bid.note : bid.unavailableReason }}
              </div>
            </div>
            <div class="list__trail">
              <div class="list__value">{{ formatMoney(bid.cost, store.currency) }}</div>
              <div class="list__sub">{{ bid.weeks }} weeks</div>
            </div>
          </button>
          <div v-if="bid.available" class="card__body" style="padding-top: 0; padding-bottom: 8px">
            <span class="chip" :class="RISK_CLASS[bid.risk]">{{ bid.risk }}</span>
            <span
              v-if="financing === 'cash' && bid.cost > club.finances.balance"
              class="chip chip--danger"
            >more than the club has</span>
            <span
              v-else-if="financing === 'borrow' && bid.cost > borrowCeiling"
              class="chip chip--danger"
            >beyond what anyone will lend</span>
          </div>
        </div>
        <div v-if="bids.length === 0" class="empty">No firm has tendered for this work.</div>
      </div>

      <p class="tiny faint mt">
        The cheapest tender is not always the cheapest job. A firm with form for
        overruns will find more weeks and more money once the work has started.
      </p>
    </AppSheet>
  </div>
</template>
