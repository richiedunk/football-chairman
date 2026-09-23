<script setup lang="ts">
import { PANE_PROMPTS } from '../panes'
import { useGameStore } from '../../stores/game'
import ClubCrest from './ClubCrest.vue'

/**
 * The right-hand side, before anything has been chosen.
 *
 * One line, under the club's crest. The temptation on a wide screen is to fill
 * this with a summary or a set of shortcuts, which would make the pane compete
 * with the list it is meant to be waiting on, and would mean the screen looked
 * completely different before and after the first tap. The crest is not
 * content — it is dimmed, and there is nothing in it to read — but a pane of
 * bare pitch with one faint line in it looked like something had failed to
 * load.
 */
defineProps<{ pane: string }>()
const store = useGameStore()
</script>

<template>
  <div class="pane-empty">
    <div class="pane-empty__inner">
      <ClubCrest v-if="store.club" :club="store.club" :size="120" class="pane-empty__crest" />
      <p class="pane-empty__prompt">{{ PANE_PROMPTS[pane] ?? 'Pick something on the left.' }}</p>
    </div>
  </div>
</template>
