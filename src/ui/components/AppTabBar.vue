<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

// Five slots, and no more: everything else — finance, facilities, the board,
// staff, scouting, agents, registration — is reached from the dashboard.
// Fewer top-level places and a deeper drill-down is the actual de-busying.
const tabs = [
  { id: 'home', label: 'Club', to: '/home', d: 'M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  { id: 'squad', label: 'Squad', to: '/squad', d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87', extra: 'M9 3a4 4 0 100 8 4 4 0 000-8z' },
  { id: 'transfers', label: 'Market', to: '/transfers', d: 'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7' },
  { id: 'inbox', label: 'Inbox', to: '/inbox', d: 'M4 4h16v16H4zM4 8l8 5 8-5' },
  { id: 'league', label: 'League', to: '/league', d: 'M3 3v18h18M18 9l-5 5-3-3-4 4' },
]

const activeTab = computed(() => (route.meta.tab as string) ?? 'home')
const inboxBadge = computed(() => store.unread)
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tabbar__item"
      :class="{ 'is-active': activeTab === tab.id }"
      :aria-current="activeTab === tab.id ? 'page' : undefined"
      @click="router.push(tab.to)"
    >
      <span class="tabbar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="tab.d" />
          <path v-if="tab.extra" :d="tab.extra" />
        </svg>
      </span>
      <span>{{ tab.label }}</span>
      <span v-if="tab.id === 'inbox' && inboxBadge > 0" class="tabbar__badge">
        {{ inboxBadge > 99 ? '99+' : inboxBadge }}
      </span>
    </button>
  </nav>
</template>
