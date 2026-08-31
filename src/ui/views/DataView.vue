<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import {
  DATA_REFRESH_WEEKS, modelNoise, requiredEdgeFraction, shortlistSize,
} from '../../engine/systems/dataDepartment'
import { philosophyOf } from '../../engine/systems/recruitment'
import MeterBar from '../components/MeterBar.vue'
import Chevron from '../components/Chevron.vue'
import { listName } from '../playerName'

/**
 * What the model thinks.
 *
 * An edge, not an answer. Every row says what the market wants, what the model
 * thinks he is worth, and how far the department stands behind it — and the
 * confidence figure is the one that matters, because a badly funded department
 * is not a quiet one, it is a wrong one.
 */
const store = useGameStore()
const router = useRouter()

const level = computed(() => store.club?.facilities.dataDepartment ?? 1)

const findings = computed(() =>
  (store.game?.dataFindings ?? [])
    .map((finding) => {
      const player = store.player(finding.playerId)
      if (!player) return null
      const club = player.clubId ? store.clubById(player.clubId) : null
      return {
        finding,
        player,
        clubName: club?.name ?? 'Free agent',
        edge: finding.modelValue - finding.marketValue,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null))

/** How wrong a department this size can be, said plainly. */
const errorBand = computed(() => Math.round(modelNoise(level.value) * 100))
/** The bar it has to clear before it will name anybody, at this size. */
const requiredEdge = computed(() => Math.round(requiredEdgeFraction(level.value) * 100))

function tone(confidence: number): string {
  if (confidence >= 0.6) return 'var(--accent)'
  if (confidence >= 0.35) return 'var(--warn)'
  return 'var(--danger)'
}
</script>

<template>
  <div v-if="store.club">
    <div class="section-title">The model</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Department</span>
          <span class="bold num">Level {{ level }} of 20</span>
        </div>
        <MeterBar :value="level" :max="20" />
        <p class="small muted" style="margin: 0">
          It runs every {{ DATA_REFRESH_WEEKS }} weeks and can carry
          {{ shortlistSize(level) }} names. Its valuations are out by about
          {{ errorBand }}% either way at this size, so it only speaks up when it
          sees an edge of {{ requiredEdge }}% or more — a smaller department says
          less rather than guessing. What it does say is usually right; what
          money buys is how much it sees.
        </p>
        <p class="small muted" style="margin: 0">
          It looks for players your policy would actually sign:
          <span class="bold">{{ philosophyOf(store.club).name.toLowerCase() }}</span>.
        </p>
      </div>
    </div>

    <div class="section-title">Underpriced, it reckons</div>
    <div class="card">
      <div v-if="findings.length === 0" class="empty">
        Nothing this run. The model does not invent names to fill a list.
      </div>
      <div v-else class="list">
        <button
          v-for="row in findings"
          :key="row.finding.playerId"
          class="list__row"
          @click="router.push(`/player/${row.player.id}`)"
        >
          <div class="list__main">
            <div class="list__primary">{{ listName(row.player) }}</div>
            <div class="list__secondary num">
              {{ row.player.position }} · {{ row.player.age }} · {{ row.clubName.toUpperCase() }}
            </div>
            <div class="small" style="white-space: normal; margin-top: 4px; color: var(--text-dim)">
              {{ row.finding.rationale }}
            </div>
            <div class="tiny num" style="margin-top: 4px">
              MARKET {{ formatMoney(row.finding.marketValue, store.currency) }}
              · MODEL {{ formatMoney(row.finding.modelValue, store.currency) }}
              · <span :style="{ color: tone(row.finding.confidence) }">
                {{ Math.round(row.finding.confidence * 100) }}% CONFIDENT
              </span>
            </div>
          </div>
          <Chevron />
        </button>
      </div>
    </div>

    <p class="tiny faint center mt">
      An edge is not a certainty. The further a player has to climb, the less
      anyone can promise — and no amount of investment changes that, only how
      honestly the department says so.
    </p>
  </div>
</template>
