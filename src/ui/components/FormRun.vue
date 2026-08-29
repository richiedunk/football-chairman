<script setup lang="ts">
import type { MatchOutcome } from '../../engine/types'

defineProps<{ form: MatchOutcome[] }>()
</script>

<template>
  <span class="form-run" :aria-label="`Recent form: ${form.join(', ') || 'none'}`">
    <span v-for="(r, i) in form" :key="i" class="form-dot" :class="`form-dot--${r}`">{{ r }}</span>
    <span v-if="form.length === 0" class="tiny faint">—</span>
  </span>
</template>
