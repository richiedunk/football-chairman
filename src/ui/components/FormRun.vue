<script setup lang="ts">
import type { MatchOutcome } from '../../engine/types'

/**
 * Form as a row of lettered tiles, the way every football graphic draws it.
 *
 * Still read as a shape first — a run of green with a red at the end — but
 * the letter is on the tile too, so the meaning never rests on colour alone
 * and a colour-blind reader gets W, D and L rather than three greys.
 */
withDefaults(defineProps<{ form: MatchOutcome[]; compact?: boolean }>(), { compact: false })

const WORD: Record<MatchOutcome, string> = { W: 'Won', D: 'Drew', L: 'Lost' }
</script>

<template>
  <span class="form-run" :class="{ 'form-run--compact': compact }" :aria-label="`Recent form, oldest first: ${form.map((r) => WORD[r]).join(', ') || 'none'}`">
    <span
      v-for="(r, i) in form"
      :key="i"
      class="form-dot"
      :class="`form-dot--${r}`"
      :title="WORD[r]"
      aria-hidden="true"
    >{{ compact ? '' : r }}</span>
    <span v-if="form.length === 0" class="tiny faint">—</span>
  </span>
</template>
