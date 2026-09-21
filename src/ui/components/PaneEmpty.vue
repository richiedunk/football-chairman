<script setup lang="ts">
import { PANE_PROMPTS } from '../panes'

/**
 * The right-hand side, before anything has been chosen.
 *
 * One line and nothing else. The temptation on a wide screen is to fill this
 * with a summary or a set of shortcuts, which would make the pane compete with
 * the list it is meant to be waiting on, and would mean the screen looked
 * completely different before and after the first tap.
 */
defineProps<{ pane: string }>()
</script>

<template>
  <div class="pane-empty">
    <p class="small faint">{{ PANE_PROMPTS[pane] ?? 'Pick something on the left.' }}</p>
  </div>
</template>
