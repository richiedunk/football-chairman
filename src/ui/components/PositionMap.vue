<script setup lang="ts">
import type { Position } from '../../engine/types'

/**
 * Where a player can play, on a pitch: his position lit, the others he can
 * cover marked, everything else dim. Faster to read than "DL · also DR, DC",
 * and it shows the shape of a utility player at a glance.
 */
defineProps<{ primary: Position; alt: Position[] }>()

/** Attacking upwards; x across, y down the pitch, on a 60 × 84 frame. */
const SPOTS: Record<Position, { x: number; y: number }> = {
  GK: { x: 30, y: 76 },
  DL: { x: 10, y: 62 },
  DC: { x: 30, y: 64 },
  DR: { x: 50, y: 62 },
  DM: { x: 30, y: 52 },
  ML: { x: 10, y: 40 },
  MC: { x: 30, y: 40 },
  MR: { x: 50, y: 40 },
  AM: { x: 30, y: 27 },
  ST: { x: 30, y: 13 },
}
const ALL = Object.keys(SPOTS) as Position[]
</script>

<template>
  <svg class="pos-map" viewBox="0 0 60 84" role="img" :aria-label="`Plays ${primary}${alt.length ? `, also ${alt.join(', ')}` : ''}`">
    <rect x="1" y="1" width="58" height="82" rx="3" fill="#2a7336" stroke="rgba(255,255,255,0.45)" stroke-width="1" />
    <g stroke="rgba(255,255,255,0.35)" stroke-width="0.8" fill="none">
      <line x1="1" y1="42" x2="59" y2="42" />
      <circle cx="30" cy="42" r="7" />
      <rect x="16" y="1" width="28" height="11" />
      <rect x="16" y="72" width="28" height="11" />
    </g>
    <circle
      v-for="p in ALL"
      :key="p"
      :cx="SPOTS[p].x"
      :cy="SPOTS[p].y"
      :r="p === primary ? 5.5 : alt.includes(p) ? 4.2 : 2.2"
      :fill="p === primary ? 'var(--accent)' : alt.includes(p) ? 'var(--warn)' : 'rgba(255,255,255,0.25)'"
      :stroke="p === primary || alt.includes(p) ? '#0b0e12' : 'none'"
      stroke-width="1"
    />
  </svg>
</template>
