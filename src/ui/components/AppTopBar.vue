<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { ordinal } from '../../engine/systems/career'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

// Sub-pages get a back arrow; the five tab roots do not, because "back" from a
// tab root has no meaningful destination on a phone.
const tabRoots = new Set(['home', 'inbox', 'squad', 'transfers', 'league'])
const showBack = computed(() => !tabRoots.has(String(route.name)))

const position = computed(() => {
  const p = store.leaguePosition
  return p > 0 ? `${p}${ordinal(p)}` : '—'
})
</script>

<template>
  <header class="topbar">
    <button v-if="showBack" class="topbar__back" aria-label="Back" @click="router.back()">‹</button>

    <div class="topbar__title">
      <div class="topbar__club">{{ store.club?.name ?? 'Director of Football' }}</div>
      <div class="topbar__meta">
        {{ store.dateLabel }} · {{ position }} in {{ store.league?.name ?? '—' }}
      </div>
    </div>

    <span
      v-if="store.transferWindow.open"
      class="chip chip--info"
      :title="store.transferWindow.label"
    >Window</span>
  </header>
</template>
