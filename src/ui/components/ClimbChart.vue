<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * A club's finishes as one line through its country's pyramid.
 *
 * A league position alone does not compare across seasons — 3rd in the
 * fourth tier is below 20th in the third — so each finish is placed by its
 * rank in the whole pyramid (every club in the tiers above, plus the
 * position), with the divisions shaded behind the line. Up the chart is up
 * the leagues. One series, so no legend; the history table beneath is the
 * table view.
 */
export interface ClimbPoint {
  season: number
  position: number
  leagueName: string
  tier: number
  /** Position counted from the top of the pyramid. */
  rank: number
}
export interface ClimbBand {
  tier: number
  name: string
  /** First and last pyramid rank in this tier. */
  from: number
  to: number
}

const props = defineProps<{ points: ClimbPoint[]; bands: ClimbBand[] }>()

const W = 320
const H = 170
const PAD = { l: 8, r: 12, t: 12, b: 22 }

const top = computed(() => Math.min(...props.bands.map((b) => b.from)))
const bottom = computed(() => Math.max(...props.bands.map((b) => b.to)))

function y(rank: number): number {
  const span = Math.max(1, bottom.value - top.value)
  return PAD.t + ((rank - top.value) / span) * (H - PAD.t - PAD.b)
}
function x(i: number): number {
  const n = props.points.length
  return n <= 1 ? W / 2 : PAD.l + 60 + (i / (n - 1)) * (W - PAD.l - PAD.r - 60)
}

const path = computed(() =>
  props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.rank).toFixed(1)}`).join(''),
)

const hover = ref<number | null>(null)
const tip = computed(() => {
  const i = hover.value
  if (i === null) return null
  const p = props.points[i]
  return { p, left: (x(i) / W) * 100, top: (y(p.rank) / H) * 100 }
})

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
</script>

<template>
  <div class="climb" @mouseleave="hover = null">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="League finishes by season, through the divisions">
      <!-- Division bands, alternating, labelled at the left. -->
      <g v-for="(b, i) in bands" :key="b.tier">
        <rect
          :x="0"
          :y="y(b.from) - 0.5"
          :width="W"
          :height="Math.max(1, y(b.to) - y(b.from) + 1)"
          :fill="i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.055)'"
        />
        <text :x="PAD.l" :y="y(b.from) + 11" class="climb__band">{{ b.name }}</text>
      </g>
      <path :d="path" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <g v-for="(p, i) in points" :key="p.season">
        <circle :cx="x(i)" :cy="y(p.rank)" r="4.5" fill="var(--accent)" stroke="#0b0e12" stroke-width="2" />
        <!-- A hit target bigger than the mark. -->
        <circle
          :cx="x(i)"
          :cy="y(p.rank)"
          r="14"
          fill="transparent"
          @mouseenter="hover = i"
          @click="hover = hover === i ? null : i"
        />
        <text
          v-if="points.length <= 8 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1"
          :x="x(i)"
          :y="H - 6"
          text-anchor="middle"
          class="climb__axis"
        >{{ String(p.season).slice(2) }}/{{ String((p.season + 1) % 100).padStart(2, '0') }}</text>
      </g>
    </svg>
    <div
      v-if="tip"
      class="climb__tip"
      :style="{ left: `${tip.left}%`, top: `${tip.top}%` }"
    >
      <b>{{ ordinal(tip.p.position) }}</b> in {{ tip.p.leagueName }}
      <span>{{ tip.p.season }}/{{ String((tip.p.season + 1) % 100).padStart(2, '0') }}</span>
    </div>
  </div>
</template>
