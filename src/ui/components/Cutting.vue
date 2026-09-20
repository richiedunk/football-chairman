<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import { outletCharacter, reach } from '../press'
import type { MediaStory } from '../../engine/types'

/**
 * A story, as the thing that was published.
 *
 * The third register: the public discussing you. What separates it from the
 * club's own screens is not a typeface — it is that this one can be wrong, and
 * that you can tell what kind of paper is telling you so before you read it.
 *
 * The outlet's masthead is set in its own voice, and the engine's own
 * `credibility` and `sensationalism` decide which. They were being printed as
 * two numbers on a different screen and thrown away on this one.
 */

const props = defineProps<{ story: MediaStory }>()

const store = useGameStore()

const outlet = computed(() => store.game?.outlets[props.story.outletId] ?? null)

const character = computed(() =>
  outlet.value
    // No outlet — an old story whose paper has gone — reads as the quietest
    // voice rather than as nothing, so the cutting still has a masthead.
    ? outletCharacter(outlet.value.credibility, outlet.value.sensationalism)
    : outletCharacter(50, 0),
)

const masthead = computed(() => outlet.value?.name ?? 'The press')

const ours = computed(() => props.story.plantedBy === store.club?.id)
</script>

<template>
  <article class="cutting" :class="character.className">
    <header class="cutting__masthead">
      <span class="cutting__title">{{ masthead }}</span>
      <span class="cutting__standing num">{{ character.standing }}</span>
    </header>

    <h3 class="cutting__headline">{{ story.headline }}</h3>
    <p class="cutting__body">{{ story.body }}</p>

    <footer class="cutting__foot num">
      <!-- How far it travelled. `prominence` scales every effect the story
           has, so it is the number that decides whether a rumour mattered —
           and it was never on screen. -->
      <span>{{ reach(story.prominence) }}</span>
      <span>WEEK {{ story.week }}</span>
      <!-- Only on a story we placed. Whether somebody else's story is true is
           not ours to know from the page it was printed on. -->
      <span v-if="ours" class="cutting__ours">PLACED BY US</span>
    </footer>
  </article>
</template>
