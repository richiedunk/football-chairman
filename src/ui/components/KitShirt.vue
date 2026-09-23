<script setup lang="ts">
import { computed } from 'vue'
import { kitSvg } from '../art/kit'

/** A club's generated shirt, optionally numbered. See `src/ui/art/kit.ts`. */
const props = withDefaults(
  defineProps<{
    club: { id: string; colors: { primary: string; secondary: string } } | null | undefined
    number?: number | string
    size?: number
    away?: boolean
  }>(),
  { size: 32, number: undefined, away: false },
)

const svg = computed(() => {
  const c = props.club
  if (!c) return ''
  return kitSvg({
    id: c.id,
    primary: c.colors.primary,
    secondary: c.colors.secondary,
    number: props.number,
    away: props.away,
  })
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- generated from club data -->
  <span class="kit" :style="{ width: `${size}px`, height: `${size}px` }" v-html="svg" />
</template>
