<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import PlayerRow from '../components/PlayerRow.vue'
import { formatMoney } from '../../engine/systems/valuation'
import type { Player, Position } from '../../engine/types'

const store = useGameStore()

const positions: (Position | 'ANY')[] = ['ANY', 'GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST']

const query = ref('')
const position = ref<Position | 'ANY'>('ANY')
const maxAge = ref(34)
const maxFee = ref(0)
const scoutedOnly = ref(true)
const freeAgentsOnly = ref(false)

const budget = computed(() => store.club?.finances.transferBudget ?? 0)
if (budget.value > 0) maxFee.value = budget.value

/**
 * The search deliberately defaults to scouted players only.
 *
 * A director of football cannot browse a global database of true abilities —
 * that is the whole premise of the scouting system. Turning the filter off
 * shows every player in the world, but without a report you are looking at a
 * name, an age and a price, which is exactly as much as you would really know.
 */
const results = computed<Player[]>(() => {
  const s = store.game
  if (!s) return []
  const term = query.value.trim().toLowerCase()
  const out: Player[] = []

  for (const player of Object.values(s.players)) {
    if (player.clubId === s.playerClubId) continue
    if (player.isAcademy) continue
    if (player.age > maxAge.value) continue
    if (position.value !== 'ANY' && player.position !== position.value) continue
    if (freeAgentsOnly.value && player.clubId) continue
    if (!freeAgentsOnly.value && maxFee.value > 0 && player.value > maxFee.value) continue
    if (scoutedOnly.value && !s.scoutReports[player.id]) continue
    if (term && !player.knownAs.toLowerCase().includes(term)
      && !player.lastName.toLowerCase().includes(term)) continue
    out.push(player)
    if (out.length > 400) break
  }

  return out
    .sort((a, b) => {
      const ra = s.scoutReports[a.id]?.recommendation ?? 0
      const rb = s.scoutReports[b.id]?.recommendation ?? 0
      if (rb !== ra) return rb - ra
      return b.currentAbility - a.currentAbility
    })
    .slice(0, 80)
})
</script>

<template>
  <div>

    <div class="card">
      <div class="card__body">
        <div class="field">
          <input v-model="query" class="input" type="search" placeholder="Search by name" />
        </div>

        <div class="field">
          <label class="field__label">Position</label>
          <div class="table__scroll">
            <div class="segmented" style="min-width: 660px">
              <button
                v-for="p in positions"
                :key="p"
                class="segmented__item"
                :class="{ 'is-active': position === p }"
                @click="position = p"
              >{{ p }}</button>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field__label">Maximum age — {{ maxAge }}</label>
          <input v-model.number="maxAge" class="slider" type="range" min="16" max="38" />
        </div>

        <div class="field" v-if="!freeAgentsOnly">
          <label class="field__label">Maximum value — {{ formatMoney(maxFee, store.currency) }}</label>
          <input
            v-model.number="maxFee"
            class="slider"
            type="range"
            :min="0"
            :max="Math.max(2_000_000, budget * 3)"
            :step="25_000"
          />
          <div class="field__hint">Your budget is {{ formatMoney(budget, store.currency) }}.</div>
        </div>

        <div class="row" style="gap: 14px; flex-wrap: wrap">
          <label class="row small" style="gap: 6px">
            <input v-model="scoutedOnly" type="checkbox" /> Scouted only
          </label>
          <label class="row small" style="gap: 6px">
            <input v-model="freeAgentsOnly" type="checkbox" /> Free agents
          </label>
        </div>
      </div>
    </div>

    <div class="section-title">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</div>
    <div class="card">
      <div class="list">
        <PlayerRow v-for="p in results" :key="p.id" :player="p" trail="value" />
        <div v-if="!results.length" class="empty">
          Nothing matches. <template v-if="scoutedOnly">Your scouts may not have covered this ground yet.</template>
        </div>
      </div>
    </div>
  </div>
</template>
