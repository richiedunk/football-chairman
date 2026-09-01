<script setup lang="ts">
import { computed } from 'vue'
import type { Position, PositionGroup } from '../../engine/types'
import { positionGroup } from '../../engine/world/attributes'

const props = defineProps<{ position: Position }>()

const SHORT: Record<PositionGroup, string> = {
  goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD',
}

const group = computed(() => SHORT[positionGroup(props.position)])
</script>

<template>
  <span class="pos" :class="`pos--${group}`">{{ position }}</span>
</template>
