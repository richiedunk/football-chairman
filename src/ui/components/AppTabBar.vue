<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

const tabs = [
  { id: 'home', label: 'Home', icon: '⚽', to: '/home' },
  { id: 'inbox', label: 'Inbox', icon: '✉️', to: '/inbox' },
  { id: 'squad', label: 'Squad', icon: '👥', to: '/squad' },
  { id: 'transfers', label: 'Market', icon: '🔁', to: '/transfers' },
  { id: 'club', label: 'Club', icon: '🏛', to: '/club' },
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
      <span class="tabbar__icon" aria-hidden="true">{{ tab.icon }}</span>
      <span>{{ tab.label }}</span>
      <span v-if="tab.id === 'inbox' && inboxBadge > 0" class="tabbar__badge">
        {{ inboxBadge > 99 ? '99+' : inboxBadge }}
      </span>
    </button>
  </nav>
</template>
