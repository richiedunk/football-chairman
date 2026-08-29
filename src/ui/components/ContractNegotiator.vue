<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import { Rng } from '../../engine/rng'
import {
  contractTermsFor, negotiateContract, type ContractOffer,
} from '../../engine/systems/directorContract'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import type { Club, GameState } from '../../engine/types'

/**
 * Negotiating your own deal.
 *
 * Shared between the opening jobs board and mid-career approaches so the two
 * behave identically. Every dial trades against the others — the club has one
 * overall limit, not six independent ones — so a big signing-on fee has to be
 * paid for with a lower salary or a shorter deal.
 */
const props = defineProps<{
  club: Club
  /**
   * The world to negotiate against. Supplied explicitly during new-game setup,
   * where the live game store is still empty; omitted mid-career, where the
   * loaded game is the right source.
   */
  world?: GameState | null
}>()
const emit = defineEmits<{ agreed: [offer: ContractOffer]; cancel: [] }>()

const store = useGameStore()

const world = computed<GameState | null>(() => props.world ?? store.game ?? null)

const currency = computed(() => world.value?.settings.currency ?? 'GBP')

const terms = computed(() => {
  const s = world.value
  if (!s) return null
  return contractTermsFor(s, props.club, s.director)
})

const offer = ref<ContractOffer>({ ...(terms.value?.opening ?? {
  salary: 500, seasons: 2, signingBonus: 0, promotionBonus: 0,
  trophyBonus: 0, targetBonus: 0, severanceWeeks: 8,
}) })

const response = ref<{ accepted: boolean; message: string } | null>(null)
const rounds = ref(0)

/**
 * Snap slider bounds to the step.
 *
 * A range input whose max is not reachable from its min in whole steps can
 * never be dragged to its own maximum — the last notch sits short of the end
 * of the track. Flooring the minimum and ceiling the maximum to the step fixes
 * it for every slider at once.
 */
function bounds(min: number, max: number, step: number): { min: number; max: number } {
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step
  return { min: low, max: Math.max(low + step, high) }
}

const salaryRange = computed(() =>
  bounds(
    Math.round((terms.value?.opening.salary ?? 300) * 0.6),
    Math.round((terms.value?.ceiling.salary ?? 600) * 1.5),
    50,
  ),
)

function bonusRange(ceiling: number) {
  return bounds(0, Math.max(1000, Math.round(ceiling * 1.6)), 1000)
}

/** Annual cost of the deal as offered, which is what the club actually feels. */
const annualCost = computed(() => offer.value.salary * 52 + offer.value.signingBonus)

function submit() {
  const s = world.value
  if (!s || !terms.value) return
  rounds.value++
  const result = negotiateContract(
    s, props.club, s.director, offer.value,
    new Rng(`${s.seed}:contract:${props.club.id}:${rounds.value}`),
  )
  response.value = { accepted: result.accepted, message: result.message }
  if (result.accepted) {
    emit('agreed', { ...offer.value })
  } else if (result.counter) {
    offer.value = result.counter
  }
}

function acceptOpening() {
  if (terms.value) emit('agreed', { ...terms.value.opening })
}
</script>

<template>
  <div v-if="terms">
    <p class="small muted mb">{{ terms.note }}</p>

    <div class="field">
      <label class="field__label">Salary — {{ formatWage(offer.salary, currency) }}/wk</label>
      <input
        v-model.number="offer.salary"
        class="slider"
        type="range"
        :min="salaryRange.min"
        :max="salaryRange.max"
        :step="50"
      />
      <div class="field__hint">
        Paid from the club's wage bill — the same one you will spend the season
        trying to keep under control.
      </div>
    </div>

    <div class="field">
      <label class="field__label">Length — {{ offer.seasons }} season{{ offer.seasons === 1 ? '' : 's' }}</label>
      <input v-model.number="offer.seasons" class="slider" type="range" min="1" max="5" />
      <div class="field__hint">
        A longer deal is security. A shorter one lets you leave sooner if
        something better appears.
      </div>
    </div>

    <div class="field">
      <label class="field__label">Signing-on fee — {{ formatMoney(offer.signingBonus, currency) }}</label>
      <input
        v-model.number="offer.signingBonus"
        class="slider"
        type="range"
        :min="bonusRange(terms.ceiling.signingBonus).min"
        :max="bonusRange(terms.ceiling.signingBonus).max"
        :step="1000"
      />
    </div>

    <div class="section-title" style="margin-top: 14px">Performance bonuses</div>

    <div class="field">
      <label class="field__label">Promotion — {{ formatMoney(offer.promotionBonus, currency) }}</label>
      <input
        v-model.number="offer.promotionBonus"
        class="slider"
        type="range"
        :min="bonusRange(terms.ceiling.promotionBonus).min"
        :max="bonusRange(terms.ceiling.promotionBonus).max"
        :step="1000"
      />
    </div>

    <div class="field">
      <label class="field__label">Per trophy — {{ formatMoney(offer.trophyBonus, currency) }}</label>
      <input
        v-model.number="offer.trophyBonus"
        class="slider"
        type="range"
        :min="bonusRange(terms.ceiling.trophyBonus).min"
        :max="bonusRange(terms.ceiling.trophyBonus).max"
        :step="1000"
      />
    </div>

    <div class="field">
      <label class="field__label">Meeting the board's target — {{ formatMoney(offer.targetBonus, currency) }}</label>
      <input
        v-model.number="offer.targetBonus"
        class="slider"
        type="range"
        :min="bonusRange(terms.ceiling.targetBonus).min"
        :max="bonusRange(terms.ceiling.targetBonus).max"
        :step="1000"
      />
    </div>

    <div class="field">
      <label class="field__label">Severance — {{ offer.severanceWeeks }} weeks' salary</label>
      <input v-model.number="offer.severanceWeeks" class="slider" type="range" min="0" max="52" />
      <div class="field__hint">
        What you are paid if they dismiss you. The one term that pays out when
        things go wrong.
      </div>
    </div>

    <div class="card" style="background: var(--bg-sunken)">
      <div class="card__body">
        <div class="row row--between small">
          <span class="muted">Cost to the club, year one</span>
          <span class="bold num">{{ formatMoney(annualCost, currency) }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Guaranteed over the deal</span>
          <span class="num">
            {{ formatMoney(offer.salary * 52 * offer.seasons + offer.signingBonus, currency) }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="response && !response.accepted"
      class="small mt"
      style="color: var(--warn)"
    >{{ response.message }}</div>

    <div class="btn-row mt">
      <button class="btn btn--ghost btn--sm" @click="acceptOpening">Take their offer</button>
      <button class="btn btn--primary btn--sm" @click="submit">
        {{ rounds === 0 ? 'Put it to them' : 'Try again' }}
      </button>
    </div>
    <button class="btn btn--ghost btn--block btn--sm mt" @click="emit('cancel')">Walk away</button>
  </div>
</template>
