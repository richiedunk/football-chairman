<script setup lang="ts">
import { computed } from 'vue'
import { crestSvg } from '../art/crest'

/**
 * A club's generated crest. See `src/ui/art/crest.ts`.
 *
 * Takes the club rather than its parts, because every caller has one and the
 * id is what makes the crest stable. Below 40px the ribbon and stars are
 * dropped: they are mush at that size and the outline is what identifies it.
 */
const props = withDefaults(
  defineProps<{
    club: { id: string; name: string; shortName?: string; colors: { primary: string; secondary: string } } | null | undefined
    size?: number
  }>(),
  { size: 40 },
)

const svg = computed(() => {
  const c = props.club
  if (!c) return ''
  return crestSvg({
    // Seeded by name, not id: ids are minted afresh with every world, and
    // a club should wear the same crest and kit in every career.
    id: c.name,
    name: c.shortName || c.name,
    primary: c.colors.primary,
    secondary: c.colors.secondary,
    detail: props.size >= 40 ? 'full' : 'mark',
  })
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- generated from club data, escaped in crestSvg -->
  <span
    class="crest"
    :style="{ width: `${size}px`, height: `${Math.round(size * 1.145)}px` }"
    v-html="svg"
  />
</template>
