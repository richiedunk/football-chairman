<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import {
  PHILOSOPHIES, canChangePhilosophy, philosophyOf, type PhilosophyId,
} from '../../engine/systems/recruitment'
import AppSheet from '../components/AppSheet.vue'

/**
 * What kind of club this is in the market.
 *
 * One stated position rather than seven sliders. The sliders are still there
 * underneath and this screen deliberately shows what each policy does to them,
 * because a director who cannot see the mechanism is being asked to trust a
 * label — but the thing he chooses is the position, not the numbers.
 */
const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const club = computed(() => store.club)
const current = computed(() => (club.value ? philosophyOf(club.value) : null))
const pending = ref<PhilosophyId | null>(null)

const proposal = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c || !pending.value) return null
  return { ...canChangePhilosophy(s, c, pending.value), to: pending.value }
})

const options = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []
  return PHILOSOPHIES.map((p) => ({
    philosophy: p,
    isCurrent: p.id === c.strategy.philosophy,
    verdict: canChangePhilosophy(s, c, p.id),
  }))
})

/** How many clubs in this division recruit each way — the market's shape. */
const division = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []
  const league = s.leagues[c.leagueId]
  if (!league) return []
  const counts = new Map<string, number>()
  for (const id of league.clubIds) {
    const other = s.clubs[id]
    if (!other) continue
    const name = philosophyOf(other).name
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
})

function confirm() {
  const p = proposal.value
  if (!p || !p.ok) return
  const outcome = store.statePhilosophy(p.to)
  pending.value = null
  notify?.(outcome.message, outcome.ok ? 'success' : 'error')
}
</script>

<template>
  <div v-if="club && current">
    <div class="section-title">What kind of club we are</div>
    <div class="card">
      <div class="card__body">
        <div class="bold" style="font-size: 1.05rem">{{ current.name }}</div>
        <p class="small muted" style="margin: 6px 0 0">{{ current.summary }}</p>
        <p class="small" style="margin: 8px 0 0; color: var(--warn)">{{ current.tradeOff }}</p>
      </div>
      <div class="card__body" style="border-top: 1px solid var(--border)">
        <div class="tiny faint">
          Everyone reads this. Players weighing a move, agents pitching clients,
          clubs setting a price and the board judging you all know what kind of
          club this is and act accordingly.
        </div>
      </div>
    </div>

    <div class="section-title">Change the policy</div>
    <div class="card">
      <div class="list">
        <button
          v-for="o in options"
          :key="o.philosophy.id"
          class="list__row"
          :disabled="o.isCurrent"
          @click="pending = o.philosophy.id"
        >
          <div class="list__main">
            <div class="list__primary">{{ o.philosophy.name }}</div>
            <div class="list__secondary" style="white-space: normal">{{ o.philosophy.summary }}</div>
          </div>
          <span v-if="o.isCurrent" class="chip chip--accent">Stated</span>
          <span v-else-if="!o.verdict.ok" class="chip chip--warn">Locked</span>
          <span v-else-if="o.verdict.confidenceCost > 0" class="chip chip--danger">
            −{{ o.verdict.confidenceCost }}
          </span>
        </button>
      </div>
    </div>

    <div class="section-title">How this division recruits</div>
    <div class="card">
      <div class="list">
        <div v-for="[name, count] in division" :key="name" class="list__row list__row--static">
          <div class="list__main"><div class="list__primary">{{ name }}</div></div>
          <div class="list__value num">{{ count }}</div>
        </div>
      </div>
    </div>

    <AppSheet v-if="proposal" title="State a new policy" @close="pending = null">
      <div class="stack">
        <div class="bold">{{ options.find((o) => o.philosophy.id === proposal!.to)?.philosophy.name }}</div>
        <p class="small muted" style="margin: 0">{{ proposal.reason }}</p>
        <p v-if="proposal.confidenceCost > 0" class="small" style="margin: 0; color: var(--danger)">
          The board's confidence falls by {{ proposal.confidenceCost }}. They signed off on
          something else and it has not been given time to work.
        </p>
      </div>
      <template #footer>
        <button class="btn btn--ghost btn--block" @click="pending = null">Leave it</button>
        <button
          class="btn btn--primary btn--block"
          :disabled="!proposal.ok"
          @click="confirm"
        >State it</button>
      </template>
    </AppSheet>
  </div>
</template>
