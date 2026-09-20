<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'

/**
 * The phone's own navigation, in place of a tab bar.
 *
 * Five fixed tabs was the wrong shape for thirty screens, and the four that
 * were not tabs were reached by drilling through the one that was. The home
 * screen replaces it: everything is one tap from there.
 *
 * Two affordances, because that is what the reader actually needs everywhere.
 * Home, which is the phone. And the inbox, because it is the interrupt channel
 * and putting it two taps away would undo the reason the tab moved to the
 * middle in the first place.
 */
const store = useGameStore()
const route = useRoute()
const router = useRouter()

const onHome = computed(() => route.name === 'phone')
const onInbox = computed(() => route.meta.tab === 'inbox')
</script>

<template>
  <nav class="homebar">
    <button
      class="homebar__item"
      :class="{ 'is-active': onHome }"
      :aria-current="onHome ? 'page' : undefined"
      @click="router.push('/phone')"
    >
      <span class="homebar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="7" height="7" rx="1.6" />
          <rect x="13" y="4" width="7" height="7" rx="1.6" />
          <rect x="4" y="13" width="7" height="7" rx="1.6" />
          <rect x="13" y="13" width="7" height="7" rx="1.6" />
        </svg>
      </span>
      <span>Home</span>
    </button>

    <button
      class="homebar__item"
      :class="{ 'is-active': onInbox }"
      :aria-current="onInbox ? 'page' : undefined"
      @click="router.push('/inbox')"
    >
      <span class="homebar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4h16v16H4zM4 8l8 5 8-5" />
        </svg>
      </span>
      <span>Inbox</span>
      <span v-if="store.unread > 0" class="homebar__badge">
        {{ store.unread > 99 ? '99+' : store.unread }}
      </span>
    </button>
  </nav>
</template>
