<script setup lang="ts">
import { computed } from 'vue'
import type { MatchEvent } from '../../engine/types'
import { momentum } from '../art/momentum'
import { contrast, parseHex } from '../colour'

/**
 * The match's momentum as a wave: home pressure above the line in home
 * colours, away below in theirs, goals pinned where they went in. During a
 * live match it is drawn only as far as the clock.
 */
const props = defineProps<{
  events: MatchEvent[]
  homeId: string
  homeColors: { primary: string; secondary: string }
  awayColors: { primary: string; secondary: string }
  /** Draw up to this minute. Omitted, the whole match. */
  clock?: number
}>()

const W = 360
const H = 64
const MID = H / 2

const length = computed(() => Math.max(90, ...props.events.map((e) => e.minute)))
const shape = computed(() => momentum(props.events, props.homeId, length.value))
const upTo = computed(() => Math.min(props.clock ?? length.value, length.value))

function x(minute: number): number {
  return (minute / length.value) * W
}

function area(values: number[], dir: 1 | -1): string {
  const end = upTo.value
  if (end <= 0) return ''
  let d = `M0 ${MID}`
  for (let m = 0; m <= end; m++) d += ` L${x(m).toFixed(1)} ${(MID - dir * (values[m] * (MID - 4) + 1)).toFixed(1)}`
  return `${d} L${x(end).toFixed(1)} ${MID} Z`
}

const BG = { r: 14, g: 17, b: 22 }
/** A club colour that shows on the dark card, falling back to its second. */
function visible(c: { primary: string; secondary: string }, avoid?: string): string {
  for (const hex of [c.primary, c.secondary, '#e8ecf2']) {
    const rgb = parseHex(hex)
    if (!rgb || contrast(rgb, BG) < 2.4) continue
    const other = avoid ? parseHex(avoid) : null
    if (other && contrast(rgb, other) < 1.5) continue
    return hex
  }
  return '#e8ecf2'
}

const homeColour = computed(() => visible(props.homeColors))
const awayColour = computed(() => {
  const c = visible(props.awayColors, homeColour.value)
  return c === homeColour.value ? '#9aa4b2' : c
})

const goals = computed(() =>
  props.events
    .filter((e) => (e.type === 'goal' || e.type === 'penaltyScored' || e.type === 'ownGoal' || e.type === 'redCard') && e.minute <= upTo.value)
    .map((e) => {
      const home = e.type === 'ownGoal' ? e.clubId !== props.homeId : e.clubId === props.homeId
      if (e.type === 'redCard') return { key: `r${e.minute}-${e.playerId}`, left: `${(x(e.minute) / W) * 100}%`, home: e.clubId === props.homeId, red: true, minute: e.minute }
      return { key: `${e.minute}-${e.playerId}`, red: false, left: `${(x(e.minute) / W) * 100}%`, home, minute: e.minute }
    }),
)
</script>

<template>
  <div class="momentum" aria-hidden="true">
  <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none">
    <path :d="area(shape.home, 1)" :fill="homeColour" fill-opacity="0.55" :stroke="homeColour" stroke-width="1" vector-effect="non-scaling-stroke" />
    <path :d="area(shape.away, -1)" :fill="awayColour" fill-opacity="0.55" :stroke="awayColour" stroke-width="1" vector-effect="non-scaling-stroke" />
    <line :x1="0" :x2="W" :y1="MID" :y2="MID" stroke="rgba(255,255,255,0.25)" stroke-width="1" vector-effect="non-scaling-stroke" />
    <line :x1="x(45)" :x2="x(45)" y1="0" :y2="H" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke" />
    <line v-if="clock !== undefined" :x1="x(upTo)" :x2="x(upTo)" y1="0" :y2="H" stroke="var(--win)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
  <!-- Goals and red cards as HTML so they stay round however wide the wave is stretched. -->
  <span
    v-for="g in goals"
    :key="g.key"
    :class="[g.red ? 'momentum__red' : 'momentum__goal', g.home ? 'is-home' : 'is-away']"
    :style="{ left: g.left, borderColor: g.red ? undefined : g.home ? homeColour : awayColour }"
  ><b>{{ g.minute }}'</b></span>
  </div>
</template>
