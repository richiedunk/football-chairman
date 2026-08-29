<script setup lang="ts">
import { computed } from 'vue'
import type { Position } from '../../engine/types'

const props = defineProps<{ position: Position }>()

const group = computed(() => {
  if (props.position === 'GK') return 'GK'
  if (['DC', 'DL', 'DR'].includes(props.position)) return 'DEF'
  if (['ST', 'AM'].includes(props.position)) return 'FWD'
  return 'MID'
})
</script>

<template>
  <span class="pos" :class="`pos--${group}`">{{ position }}</span>
</template>
