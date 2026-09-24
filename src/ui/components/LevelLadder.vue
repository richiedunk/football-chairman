<script setup lang="ts">
import { computed } from 'vue'

/**
 * A facility's level as a ladder of twenty rungs, with where the rest of the
 * league stands marked above it. A bar says "about half"; rungs say "two
 * short of the league's best", which is what decides whether to spend.
 */
const props = defineProps<{
  level: number
  max?: number
  /** League average, marked with a tick. */
  average?: number
  /** Best in the league, marked with a tick. */
  best?: number
  /** The rung being built now. */
  building?: boolean
}>()

const max = computed(() => props.max ?? 20)
const rungs = computed(() => Array.from({ length: max.value }, (_, i) => i + 1))

function band(n: number): string {
  if (n >= 19) return 'world'
  if (n >= 13) return 'high'
  if (n >= 7) return 'mid'
  return 'low'
}

function at(value: number): string {
  return `${((value - 0.5) / max.value) * 100}%`
}
</script>

<template>
  <div class="ladder" role="img" :aria-label="`Level ${level} of ${max}`">
    <div class="ladder__marks" aria-hidden="true">
      <span v-if="average" class="ladder__mark" :style="{ left: at(average) }">avg</span>
      <span v-if="best && Math.abs(best - (average ?? -9)) >= 2" class="ladder__mark ladder__mark--best" :style="{ left: at(best) }">best</span>
    </div>
    <div class="ladder__rungs">
      <i
        v-for="n in rungs"
        :key="n"
        :class="[`ladder__rung--${band(n)}`, { 'is-on': n <= level, 'is-next': building && n === level + 1 }]"
      />
    </div>
  </div>
</template>
