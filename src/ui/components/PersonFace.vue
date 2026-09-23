<script setup lang="ts">
import { computed } from 'vue'
import { faceSvg } from '../art/face'

/** A generated portrait in a round frame. See `src/ui/art/face.ts`. */
const props = withDefaults(
  defineProps<{
    person: { id: string; age: number }
    kind?: 'player' | 'staff'
    club?: { colors: { primary: string; secondary: string } } | null
    size?: number
  }>(),
  { kind: 'player', club: null, size: 56 },
)

const svg = computed(() =>
  faceSvg({
    id: props.person.id,
    age: props.person.age,
    kind: props.kind,
    primary: props.club?.colors.primary,
    secondary: props.club?.colors.secondary,
  }),
)
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- generated, no user text -->
  <span class="face" :style="{ width: `${size}px`, height: `${size}px` }" v-html="svg" />
</template>
