<script setup lang="ts">
import { computed } from 'vue'
import type { Stand, StandId } from '../../engine/types'

/**
 * The ground from above.
 *
 * Four stands around a pitch, each drawn as deep as it is big relative to
 * the largest, coloured by its condition, hatched if it is a terrace, roofed
 * if it is covered, with the part the safety officer has closed shaded out.
 * The stands list below says the same things in numbers; this says in one
 * look which end of the ground is the problem.
 */
const props = defineProps<{ stands: Stand[] }>()

const W = 200
const H = 140
const PITCH = { x: 52, y: 36, w: 96, h: 68 }
const MIN_DEPTH = 7
const MAX_DEPTH = 30

const biggest = computed(() => Math.max(1, ...props.stands.map((s) => s.capacity)))

function tone(condition: number): string {
  if (condition >= 65) return '#3fd67a'
  if (condition >= 45) return '#ffb020'
  return '#ff5a52'
}

/**
 * Which side of the pitch each stand is drawn on.
 *
 * By its name where the name says, not by its id: the generator hands out the
 * ids north, south, east, west to the Main, North, East and West stands in
 * that order, so going by id put the North Stand at the south end. The
 * stand without a compass point in its name (the Main Stand) takes whichever
 * side is left.
 */
const sides = computed(() => {
  const out = new Map<string, StandId>()
  const taken = new Set<StandId>()
  for (const stand of props.stands) {
    const named = (['north', 'south', 'east', 'west'] as const).find((d) => stand.name.toLowerCase().includes(d))
    if (named && !taken.has(named)) {
      out.set(stand.id, named)
      taken.add(named)
    }
  }
  for (const stand of props.stands) {
    if (out.has(stand.id)) continue
    const free = (['south', 'north', 'west', 'east'] as const).find((d) => !taken.has(d)) ?? stand.id
    out.set(stand.id, free)
    taken.add(free)
  }
  return out
})

const drawn = computed(() =>
  props.stands.map((stand) => {
    const side = sides.value.get(stand.id) ?? stand.id
    const depth = MIN_DEPTH + (MAX_DEPTH - MIN_DEPTH) * (stand.capacity / biggest.value)
    const gap = 3
    const p = PITCH
    // Thresholds match conditionLabel() on the stadium screen: sound, tired, poor.
    // Ends run the width of the pitch; sides run its length.
    const rect: Record<StandId, { x: number; y: number; w: number; h: number }> = {
      north: { x: p.x, y: p.y - gap - depth, w: p.w, h: depth },
      south: { x: p.x, y: p.y + p.h + gap, w: p.w, h: depth },
      west: { x: p.x - gap - depth, y: p.y, w: depth, h: p.h },
      east: { x: p.x + p.w + gap, y: p.y, w: depth, h: p.h },
    }
    const r = rect[side]
    const closedShare = stand.capacity ? Math.min(1, stand.closedSeats / stand.capacity) : 0
    const horizontal = side === 'north' || side === 'south'
    const closed = closedShare
      ? horizontal
        ? { x: r.x + r.w * (1 - closedShare), y: r.y, w: r.w * closedShare, h: r.h }
        : { x: r.x, y: r.y + r.h * (1 - closedShare), w: r.w, h: r.h * closedShare }
      : null
    // The roof sits on the edge away from the pitch.
    const roof =
      stand.type === 'coveredSeated'
        ? side === 'north'
          ? { x: r.x, y: r.y, w: r.w, h: 2 }
          : side === 'south'
            ? { x: r.x, y: r.y + r.h - 2, w: r.w, h: 2 }
            : side === 'west'
              ? { x: r.x, y: r.y, w: 2, h: r.h }
              : { x: r.x + r.w - 2, y: r.y, w: 2, h: r.h }
        : null
    const label = {
      x: r.x + r.w / 2,
      y: r.y + r.h / 2 + 3,
    }
    return { stand, r, closed, roof, label, colour: tone(stand.condition), horizontal }
  }),
)
</script>

<template>
  <svg class="ground-plan" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="The ground from above">
    <defs>
      <pattern id="gp-terrace" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="1.4" height="3" fill="rgba(0,0,0,0.35)" />
      </pattern>
      <pattern id="gp-closed" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="4" height="4" fill="#20262e" />
        <rect width="1.6" height="4" fill="#3a434e" />
      </pattern>
    </defs>

    <!-- Pitch -->
    <rect :x="PITCH.x" :y="PITCH.y" :width="PITCH.w" :height="PITCH.h" rx="1.5" fill="#2c7a3a" />
    <rect
      v-for="i in 6"
      :key="i"
      :x="PITCH.x + (i - 1) * (PITCH.w / 6)"
      :y="PITCH.y"
      :width="PITCH.w / 12"
      :height="PITCH.h"
      fill="rgba(255,255,255,0.05)"
    />
    <g fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="0.6">
      <rect :x="PITCH.x + 3" :y="PITCH.y + 3" :width="PITCH.w - 6" :height="PITCH.h - 6" />
      <line :x1="PITCH.x + PITCH.w / 2" :y1="PITCH.y + 3" :x2="PITCH.x + PITCH.w / 2" :y2="PITCH.y + PITCH.h - 3" />
      <circle :cx="PITCH.x + PITCH.w / 2" :cy="PITCH.y + PITCH.h / 2" r="8" />
      <rect :x="PITCH.x + 3" :y="PITCH.y + PITCH.h / 2 - 14" width="14" height="28" />
      <rect :x="PITCH.x + PITCH.w - 17" :y="PITCH.y + PITCH.h / 2 - 14" width="14" height="28" />
    </g>

    <!-- Stands -->
    <g v-for="d in drawn" :key="d.stand.id">
      <rect :x="d.r.x" :y="d.r.y" :width="d.r.w" :height="d.r.h" rx="1.5" :fill="d.colour" opacity="0.85" />
      <rect v-if="d.stand.type === 'terrace'" :x="d.r.x" :y="d.r.y" :width="d.r.w" :height="d.r.h" rx="1.5" fill="url(#gp-terrace)" />
      <rect v-if="d.closed" :x="d.closed.x" :y="d.closed.y" :width="d.closed.w" :height="d.closed.h" fill="url(#gp-closed)" />
      <rect v-if="d.roof" :x="d.roof.x" :y="d.roof.y" :width="d.roof.w" :height="d.roof.h" fill="#e9eef3" opacity="0.8" />
      <text
        :x="d.label.x"
        :y="d.label.y"
        text-anchor="middle"
        class="ground-plan__label"
        :transform="d.horizontal ? undefined : `rotate(-90 ${d.label.x} ${d.label.y - 3})`"
      >{{ d.stand.capacity.toLocaleString() }}</text>
    </g>
  </svg>
</template>
