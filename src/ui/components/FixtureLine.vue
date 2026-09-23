<script setup lang="ts">
import ClubCrest from './ClubCrest.vue'

/**
 * One match on one line, the way a results page prints it: home side
 * right-aligned against the score, away side left-aligned after it, a crest
 * on the outside of each. The score sits in a fixed-width plate so a column
 * of results lines up down the middle.
 */
type ClubLike = { id: string; name: string; shortName?: string; colors: { primary: string; secondary: string } }

defineProps<{
  home: ClubLike | null | undefined
  away: ClubLike | null | undefined
  homeGoals?: number | null
  awayGoals?: number | null
  /** Which side is the player's club, for emphasis. */
  mine?: string | null
}>()
</script>

<template>
  <span class="fixture-line">
    <span class="fixture-line__side fixture-line__side--home" :class="{ 'is-mine': home && mine === home.id }">
      <span class="truncate">{{ home?.shortName || home?.name || '—' }}</span>
      <ClubCrest :club="home" :size="20" />
    </span>
    <span class="fixture-line__score" :class="{ 'is-played': homeGoals != null }">
      <template v-if="homeGoals != null && awayGoals != null">{{ homeGoals }}<i>-</i>{{ awayGoals }}</template>
      <template v-else>v</template>
    </span>
    <span class="fixture-line__side" :class="{ 'is-mine': away && mine === away.id }">
      <ClubCrest :club="away" :size="20" />
      <span class="truncate">{{ away?.shortName || away?.name || '—' }}</span>
    </span>
  </span>
</template>
