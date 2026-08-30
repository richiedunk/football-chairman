<script setup lang="ts">
import type { MatchOutcome } from '../../engine/types'

/**
 * Form as five or six bars rather than lettered squares.
 *
 * Form is consumed as a shape — a run of green with a red at the end — not as
 * a string to be read left to right, and bars say that in a fifth of the
 * height. The letters stay in the accessible name and the tooltip, so the
 * meaning never rests on colour alone.
 */
defineProps<{ form: MatchOutcome[] }>()

const WORD: Record<MatchOutcome, string> = { W: 'Won', D: 'Drew', L: 'Lost' }
</script>

<template>
  <span class="form-run" :aria-label="`Recent form, oldest first: ${form.map((r) => WORD[r]).join(', ') || 'none'}`">
    <span
      v-for="(r, i) in form"
      :key="i"
      class="form-dot"
      :class="`form-dot--${r}`"
      :title="WORD[r]"
    />
    <span v-if="form.length === 0" class="tiny faint">—</span>
  </span>
</template>
