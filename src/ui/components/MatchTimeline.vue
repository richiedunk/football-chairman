<script setup lang="ts">
import { computed } from 'vue'
import type { MatchEvent } from '../../engine/types'

/**
 * The ninety minutes as one line: home events above it, away below, half
 * time marked. A score says who won; this says when — the early goal, the
 * late collapse, the red card that turned it — at a glance.
 */
const props = defineProps<{
  events: MatchEvent[]
  homeId: string
}>()

const SHOWN = new Set(['goal', 'ownGoal', 'penaltyScored', 'penaltyMissed', 'redCard'])

const length = computed(() => Math.max(90, ...props.events.map((e) => e.minute)))

const marks = computed(() =>
  props.events
    .filter((e) => SHOWN.has(e.type))
    .map((e) => ({
      key: `${e.minute}-${e.type}-${e.playerId}`,
      left: (Math.min(e.minute, length.value) / length.value) * 100,
      // An own goal counts for the other side, so it sits on theirs.
      home: e.type === 'ownGoal' ? e.clubId !== props.homeId : e.clubId === props.homeId,
      type: e.type,
      minute: e.minute,
    })),
)
</script>

<template>
  <div class="timeline" aria-hidden="true">
    <div class="timeline__line">
      <span class="timeline__half" :style="{ left: `${(45 / length) * 100}%` }">HT</span>
    </div>
    <span
      v-for="m in marks"
      :key="m.key"
      class="timeline__mark"
      :class="[`timeline__mark--${m.type}`, m.home ? 'is-home' : 'is-away']"
      :style="{ left: `${m.left}%` }"
    >
      <i />
      <b>{{ m.minute }}'</b>
    </span>
    <!-- The ends are labelled unless an away mark is sitting on the label. -->
    <span v-if="!marks.some((m) => !m.home && m.left < 7)" class="timeline__end timeline__end--start">0'</span>
    <span v-if="!marks.some((m) => !m.home && m.left > 93)" class="timeline__end timeline__end--end">{{ length }}'</span>
  </div>
</template>
