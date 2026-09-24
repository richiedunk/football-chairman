<script setup lang="ts">
import { computed } from 'vue'

/**
 * One attribute, on the 1-20 scale, as the game can actually see it.
 *
 * Known (your own player): a solid bar coloured by grade, the figure beside
 * it. Estimated (a scout report): solid up to the low end of the range, a
 * hatched band across the part nobody is sure of, and the range as the
 * figure. Unknown: the whole track hatched and a question mark.
 *
 * This is the game's title, drawn. The hatched band is what "undisclosed"
 * looks like, and it narrows as the scouts do their work — so a report you
 * paid for is visibly worth more than one you did not.
 */
const props = defineProps<{
  /** An exact value, when it is known. */
  value?: number | null
  /** A scout's range, when it is not. */
  range?: readonly [number, number] | null
}>()

const MAX = 20

const lo = computed(() => props.value ?? props.range?.[0] ?? null)
const hi = computed(() => props.value ?? props.range?.[1] ?? null)

/** Grade colours, the genre's convention: poor red, fair amber, good green, elite lime. */
function grade(v: number): string {
  if (v >= 16) return 'var(--accent)'
  if (v >= 12) return 'var(--win)'
  if (v >= 8) return 'var(--warn)'
  return 'var(--danger)'
}

const colour = computed(() => {
  if (lo.value === null || hi.value === null) return 'var(--text-faint)'
  return grade((lo.value + hi.value) / 2)
})

const label = computed(() => {
  if (lo.value === null || hi.value === null) return '?'
  return lo.value === hi.value ? String(lo.value) : `${lo.value}–${hi.value}`
})
</script>

<template>
  <span class="attr-bar" :class="{ 'attr-bar--unknown': lo === null }">
    <span class="attr-bar__track">
      <span v-if="lo !== null" class="attr-bar__solid" :style="{ width: `${(lo / MAX) * 100}%`, background: colour }" />
      <span
        v-if="lo !== null && hi !== null && hi > lo"
        class="attr-bar__fog"
        :style="{ left: `${(lo / MAX) * 100}%`, width: `${((hi - lo) / MAX) * 100}%`, color: colour }"
      />
    </span>
    <span class="attr-bar__value" :style="{ color: colour }">{{ label }}</span>
  </span>
</template>
