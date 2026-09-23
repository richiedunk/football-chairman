<script setup lang="ts">
import { computed } from 'vue'

/**
 * Five stars, filled to a value — the genre's own shorthand for "how good".
 *
 * Takes either a star count (0-5, halves allowed) or a 0-100 score, which it
 * converts. Drawn as SVG rather than the ★ glyph, which renders at a
 * different size in every font and has no half.
 */
const props = withDefaults(
  defineProps<{
    /** 0-5, in halves. */
    stars?: number
    /** 0-100, converted to stars. */
    score?: number
    size?: number
  }>(),
  { stars: undefined, score: undefined, size: 12 },
)

const value = computed(() => {
  const raw = props.stars ?? (props.score !== undefined ? props.score / 20 : 0)
  return Math.max(0, Math.min(5, Math.round(raw * 2) / 2))
})

const STAR = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z'

function fill(i: number): 'full' | 'half' | 'empty' {
  if (value.value >= i + 1) return 'full'
  if (value.value >= i + 0.5) return 'half'
  return 'empty'
}
</script>

<template>
  <span class="stars" role="img" :aria-label="`${value} out of 5 stars`">
    <svg v-for="i in 5" :key="i" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
      <defs v-if="fill(i - 1) === 'half'">
        <linearGradient :id="`star-half-${size}`">
          <stop offset="50%" stop-color="var(--sel)" />
          <stop offset="50%" stop-color="rgba(255,255,255,0.14)" />
        </linearGradient>
      </defs>
      <path
        :d="STAR"
        :fill="fill(i - 1) === 'full' ? 'var(--sel)' : fill(i - 1) === 'half' ? `url(#star-half-${size})` : 'rgba(255,255,255,0.14)'"
      />
    </svg>
  </span>
</template>
