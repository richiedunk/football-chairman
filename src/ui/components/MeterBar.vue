<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    /** Colour by value: green when high, red when low. */
    semantic?: boolean
    /** Invert semantics — used for things where low is good, like debt. */
    invert?: boolean
    color?: string
  }>(),
  { max: 100, semantic: true, invert: false },
)

const pct = computed(() => Math.max(0, Math.min(100, (props.value / props.max) * 100)))

const fill = computed(() => {
  if (props.color) return props.color
  if (!props.semantic) return 'var(--info)'
  const v = props.invert ? 100 - pct.value : pct.value
  if (v >= 66) return 'var(--accent)'
  if (v >= 33) return 'var(--warn)'
  return 'var(--danger)'
})
</script>

<template>
  <div
    class="meter"
    role="meter"
    :aria-valuenow="Math.round(value)"
    :aria-valuemin="0"
    :aria-valuemax="max"
  >
    <div class="meter__fill" :style="{ width: `${pct}%`, background: fill }" />
  </div>
</template>
