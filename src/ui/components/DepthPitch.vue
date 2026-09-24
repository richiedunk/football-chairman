<script setup lang="ts">
import type { Position } from '../../engine/types'

/**
 * Squad depth on a pitch: at each position, how many players can cover it
 * and the best of them. A thin position is amber, an empty one red, so the
 * hole in a squad is where it would be on a Saturday rather than a row in
 * a list.
 */
defineProps<{
  depth: { position: Position; count: number; bestRating: number; shortage: boolean }[]
}>()

const SPOTS: Record<Position, { x: number; y: number }> = {
  GK: { x: 50, y: 88 },
  DL: { x: 14, y: 70 },
  DC: { x: 50, y: 72 },
  DR: { x: 86, y: 70 },
  DM: { x: 50, y: 56 },
  ML: { x: 14, y: 40 },
  MC: { x: 50, y: 42 },
  MR: { x: 86, y: 40 },
  AM: { x: 50, y: 27 },
  ST: { x: 50, y: 11 },
}
</script>

<template>
  <div class="depth-pitch pitch" style="aspect-ratio: 68 / 80">
    <svg class="pitch__lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="64" height="96" />
      <line x1="2" y1="50" x2="66" y2="50" />
      <circle cx="34" cy="50" r="8" />
      <rect x="16" y="2" width="36" height="14" />
      <rect x="16" y="84" width="36" height="14" />
    </svg>
    <div
      v-for="d in depth"
      :key="d.position"
      class="depth-pitch__spot"
      :class="{ 'is-thin': d.shortage && d.count > 0, 'is-empty': d.count === 0 }"
      :style="{ left: `${SPOTS[d.position]?.x ?? 50}%`, top: `${SPOTS[d.position]?.y ?? 50}%` }"
    >
      <span class="depth-pitch__pos">{{ d.position }}</span>
      <span class="depth-pitch__count">{{ d.count }}</span>
      <span class="depth-pitch__best">{{ d.bestRating || '—' }}</span>
    </div>
  </div>
</template>
