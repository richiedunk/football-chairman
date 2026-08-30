<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PosBadge from './PosBadge.vue'
import { useGameStore } from '../../stores/game'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { U21_AGE } from '../../engine/systems/registration'
import type { Player } from '../../engine/types'
import { listName } from '../playerName'

const props = withDefaults(
  defineProps<{
    player: Player
    /** What to show on the right: value, wage, ability, or a season summary. */
    trail?: 'value' | 'wage' | 'ability' | 'stats' | 'none'
    clickable?: boolean
  }>(),
  { trail: 'value', clickable: true },
)

const store = useGameStore()
const router = useRouter()

/** True when this club is the one that would have to register him. */
const isOwn = computed(() => {
  const c = store.club
  const p = props.player
  if (!c) return false
  return (p.clubId === c.id && !p.loanClubId) || c.loanedIn.includes(p.id)
})

const status = computed(() => {
  const p = props.player
  if (p.injury) return { label: `${p.injury.weeksRemaining}w`, cls: 'chip--danger', title: p.injury.type }
  if (p.suspendedWeeks > 0) return { label: 'Susp', cls: 'chip--danger', title: 'Suspended' }
  if (p.loanClubId && p.clubId === store.club?.id) {
    return { label: 'Out on loan', cls: 'chip--info', title: 'Loaned to another club' }
  }
  if (p.loanClubId) return { label: 'On loan', cls: 'chip--info', title: 'Borrowed from another club' }
  // Being left off the squad list matters more than anything else here: he is
  // not available at all, so it outranks "wants out" and "listed".
  if (isOwn.value && p.age >= U21_AGE && !store.club!.registeredIds.includes(p.id)) {
    return { label: 'Unregistered', cls: 'chip--danger', title: 'Not on the squad list — cannot be selected' }
  }
  if (p.transferRequested) return { label: 'Wants out', cls: 'chip--warn', title: 'Transfer requested' }
  if (p.listedForTransfer) return { label: 'Listed', cls: 'chip--warn', title: 'Listed for transfer' }
  return null
})

const contractYears = computed(() => {
  const s = store.game
  if (!s || !props.player.contract) return null
  return props.player.contract.expiresSeason - s.date.season
})

const avgRating = computed(() => {
  const st = props.player.stats
  return st.appearances > 0 ? (st.ratingSum / st.appearances).toFixed(2) : '—'
})

function open() {
  if (props.clickable) router.push(`/player/${props.player.id}`)
}
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="list__row"
    :class="{ 'list__row--static': !clickable }"
    @click="open"
  >
    <PosBadge :position="player.position" />

    <div class="list__main">
      <div class="list__primary">
        {{ listName(player) }}
        <span v-if="status" class="chip" :class="status.cls" :title="status.title">{{ status.label }}</span>
      </div>
      <div class="list__secondary num">
        {{ player.age }}y
        <template v-if="player.contract"> · {{ formatWage(player.contract.wage, store.currency) }}/wk</template>
        <template v-if="contractYears !== null">
          ·
          <span :class="contractYears <= 0 ? 'neg-val' : contractYears === 1 ? 'bold' : ''">
            {{ contractYears <= 0 ? 'Expiring' : `${contractYears}y left` }}
          </span>
        </template>
      </div>
    </div>

    <div v-if="trail !== 'none'" class="list__trail">
      <template v-if="trail === 'value'">
        <div class="list__value">{{ formatMoney(player.value, store.currency) }}</div>
        <div class="list__sub">Form {{ Math.round(player.form) }}</div>
      </template>
      <template v-else-if="trail === 'wage'">
        <div class="list__value">{{ formatWage(player.contract?.wage ?? 0, store.currency) }}</div>
        <div class="list__sub">per week</div>
      </template>
      <template v-else-if="trail === 'ability'">
        <div class="list__value">{{ Math.round(player.currentAbility) }}</div>
        <div class="list__sub">CA</div>
      </template>
      <template v-else-if="trail === 'stats'">
        <div class="list__value">{{ avgRating }}</div>
        <div class="list__sub">{{ player.stats.appearances }} apps · {{ player.stats.goals }}g</div>
      </template>
    </div>
  </component>
</template>
