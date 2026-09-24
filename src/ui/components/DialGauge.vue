<script setup lang="ts">
import { computed } from 'vue'

/**
 * A half-dial, 0-100, for the handful of numbers that are a mood rather than
 * a quantity: the board's confidence in you, the press's opinion of you.
 * A bar says "how much"; a needle on a dial says "which way this is going",
 * which is the question those numbers answer.
 */
const props = withDefaults(
  defineProps<{
    value: number
    label: string
    /** The word for the reading, under the figure. */
    reading?: string
    size?: number
  }>(),
  { reading: '', size: 180 },
)

const v = computed(() => Math.max(0, Math.min(100, props.value)))
const tone = computed(() => (v.value >= 60 ? 'var(--win)' : v.value >= 35 ? 'var(--warn)' : 'var(--danger)'))

// A 180° arc from the left (0) to the right (100), radius 80, centre (100, 96).
const R = 80
const C = { x: 100, y: 96 }
function point(pct: number, r = R) {
  const a = Math.PI * (1 - pct / 100)
  return { x: C.x + Math.cos(a) * r, y: C.y - Math.sin(a) * r }
}
const arc = computed(() => {
  const end = point(v.value)
  return `M${C.x - R} ${C.y}A${R} ${R} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
})
const needle = computed(() => point(v.value, R - 22))
const ticks = [0, 25, 50, 75, 100].map((t) => ({ a: point(t, R + 9), b: point(t, R + 3) }))
</script>

<template>
  <div class="dial" :style="{ width: `${size}px` }" role="meter" :aria-valuenow="Math.round(v)" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
    <svg viewBox="0 0 200 112">
      <path :d="`M${C.x - R} ${C.y}A${R} ${R} 0 0 1 ${C.x + R} ${C.y}`" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="14" stroke-linecap="round" />
      <path v-if="v > 0" :d="arc" fill="none" :stroke="tone" stroke-width="14" stroke-linecap="round" />
      <line v-for="(t, i) in ticks" :key="i" :x1="t.a.x" :y1="t.a.y" :x2="t.b.x" :y2="t.b.y" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
      <line :x1="C.x" :y1="C.y" :x2="needle.x" :y2="needle.y" stroke="#fff" stroke-width="3.5" stroke-linecap="round" />
      <circle :cx="C.x" :cy="C.y" r="6" fill="#fff" />
    </svg>
    <div class="dial__figure" :style="{ color: tone }">{{ Math.round(v) }}</div>
    <div class="dial__label">{{ reading || label }}</div>
  </div>
</template>
