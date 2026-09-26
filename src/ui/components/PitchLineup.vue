<script setup lang="ts">
import { computed } from 'vue'
import type { Position } from '../../engine/types'
import KitShirt from './KitShirt.vue'
import { useGameStore } from '../../stores/game'
import { numberFor } from '../shirtNumbers'
import { shirtNames } from '../playerName'

/**
 * A side, laid out on a pitch in its shirts.
 *
 * The engine picks eleven and records who they were; it does not record a
 * shape. The shape is read back from the players' own positions — keeper at
 * the foot, then the back line, holding midfield, midfield, the ten and the
 * forwards — and each line spread across the width, left-sided players to
 * the left. What comes out is the formation the coach actually fielded,
 * which is the point: you see where your signing played, or that he did not.
 */
type Row = {
  player: { id: string; knownAs: string; position: Position; clubId: string | null }
  rating?: number
}

const props = withDefaults(
  defineProps<{
    club: { id: string; name: string; colors: { primary: string; secondary: string } }
    players: Row[]
    /** The player to pick out: best on the day, or the one you signed. */
    highlight?: string | null
    away?: boolean
  }>(),
  { highlight: null, away: false },
)

const emit = defineEmits<{ pick: [id: string] }>()
const store = useGameStore()

/** Depth up the pitch, as a percentage from the top. */
const LINE: Record<Position, number> = {
  GK: 89, DL: 70, DC: 72, DR: 70, DM: 56, ML: 42, MC: 45, MR: 42, AM: 29, ST: 13,
}
/** Left to right within a line. */
const SIDE: Record<Position, number> = {
  GK: 1, DL: 0, DC: 1, DR: 2, DM: 1, ML: 0, MC: 1, MR: 2, AM: 1, ST: 1,
}

const placed = computed(() => {
  const lines = new Map<number, Row[]>()
  for (const row of props.players) {
    const y = LINE[row.player.position] ?? 45
    // Wide players share a depth with the centre of their line.
    const key = y >= 68 && y <= 72 ? 71 : y >= 42 && y <= 45 ? 44 : y
    lines.set(key, [...(lines.get(key) ?? []), row])
  }
  const out: { row: Row; x: number; y: number }[] = []
  for (const [y, rows] of lines) {
    const sorted = [...rows].sort((a, b) => SIDE[a.player.position] - SIDE[b.player.position])
    const n = sorted.length
    sorted.forEach((row, i) => {
      // A lone player sits in the middle; a line spreads towards the
      // touchlines as it fills, but never onto them.
      const spread = n <= 1 ? 0 : Math.min(76, 22 * (n - 1))
      const x = 50 - spread / 2 + (n <= 1 ? 0 : (spread * i) / (n - 1))
      out.push({ row, x, y })
    })
  }
  return out
})

const names = computed(() => shirtNames(props.players.map((r) => r.player)))

function tone(rating: number): string {
  if (rating >= 7.5) return 'var(--accent)'
  if (rating >= 6.5) return '#fff'
  if (rating >= 5.5) return 'var(--warn)'
  return 'var(--danger)'
}
</script>

<template>
  <div class="pitch" role="list" aria-label="Line-up">
    <svg class="pitch__lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="64" height="96" />
      <line x1="2" y1="50" x2="66" y2="50" />
      <circle cx="34" cy="50" r="8" />
      <rect x="16" y="2" width="36" height="14" />
      <rect x="25" y="2" width="18" height="5" />
      <rect x="16" y="84" width="36" height="14" />
      <rect x="25" y="93" width="18" height="5" />
    </svg>
    <button
      v-for="{ row, x, y } in placed"
      :key="row.player.id"
      class="pitch__player"
      :class="{ 'is-highlight': row.player.id === highlight }"
      :style="{ left: `${x}%`, top: `${y}%` }"
      role="listitem"
      @click="emit('pick', row.player.id)"
    >
      <KitShirt :club="club" :number="numberFor(store, row.player)" :size="34" :away="away" />
      <span class="pitch__name" :class="{ 'pitch__name--long': (names.get(row.player.id) ?? '').length > 9 }">{{ names.get(row.player.id) }}</span>
      <span v-if="row.rating !== undefined" class="pitch__rating" :style="{ color: tone(row.rating) }">
        {{ row.rating.toFixed(1) }}
      </span>
    </button>
  </div>
</template>
