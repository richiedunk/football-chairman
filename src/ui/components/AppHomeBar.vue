<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { PHONE_APPS } from '../apps'
import { badgeFor } from '../appBadge'

/**
 * The bottom bar.
 *
 * The phone's home screen is still the index of everything, but two buttons
 * — Home and Inbox — left half the width of the bar as dead space and put the
 * three places a director goes every single week (the club, the squad, the
 * market) a tap further away than they need to be. Five slots, the home
 * screen first, the inbox last where a thumb finds it.
 *
 * Icons and badges come from the same list as the home screen and the desktop
 * rail, so the three never drift apart.
 */
const store = useGameStore()
const route = useRoute()
const router = useRouter()

const HOME_ICON = 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
const TABS = ['home', 'squad', 'transfers', 'inbox'] as const

const items = computed(() => [
  {
    id: 'phone',
    label: 'Home',
    to: '/phone',
    d: HOME_ICON,
    extra: undefined as string | undefined,
    badge: 0,
    active: route.name === 'phone',
  },
  ...TABS.map((id) => {
    const app = PHONE_APPS.find((a) => a.id === id)!
    return {
      id,
      label: app.label,
      to: app.to,
      d: app.d,
      extra: app.extra,
      badge: badgeFor(store, app),
      active: route.meta.tab === id || route.name === id,
    }
  }),
])
</script>

<template>
  <nav class="homebar">
    <button
      v-for="item in items"
      :key="item.id"
      class="homebar__item"
      :class="{ 'is-active': item.active }"
      :aria-current="item.active ? 'page' : undefined"
      @click="router.push(item.to)"
    >
      <span class="homebar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.d" />
          <path v-if="item.extra" :d="item.extra" />
        </svg>
      </span>
      <span>{{ item.label }}</span>
      <span v-if="item.badge > 0" class="homebar__badge">
        {{ item.badge > 99 ? '99+' : item.badge }}
      </span>
    </button>
  </nav>
</template>
