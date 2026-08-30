<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { headerBand } from '../colour'
import { screenLabel } from '../screens'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

// Sub-pages get a back arrow; the five tab roots do not, because "back" from a
// tab root has no meaningful destination on a phone.
const tabRoots = new Set(['home', 'inbox', 'squad', 'transfers', 'club'])
const showBack = computed(() => !tabRoots.has(String(route.name)))

// On a tab root the header carries the club; on a sub-page it carries the
// screen, with the club demoted to the line beneath. The band stays the same
// either way, so the club never stops being present.
const isRoot = computed(() => !showBack.value)
const title = computed(() =>
  isRoot.value
    ? store.club?.name ?? 'Director of Football'
    : screenLabel(String(route.name)),
)
const subtitle = computed(() => {
  const club = store.club
  if (!club) return ''
  if (!isRoot.value) return club.name
  const date = store.game?.date
  // The week lives in the status strip directly below, so the header carries
  // the season instead of repeating it.
  const season = date ? `${date.season}/${String((date.season + 1) % 100).padStart(2, '0')}` : ''
  return [store.league?.name, season].filter(Boolean).join(' · ')
})

const band = computed(() => {
  const colours = store.club?.colors
  return headerBand(colours?.primary ?? '', colours?.secondary)
})

// Painted onto the root so every screen — including sheets and the status bar
// — can reach the club's colour without prop-drilling it.
watchEffect(() => {
  const root = document.documentElement
  root.style.setProperty('--club-band', band.value.band)
  root.style.setProperty('--club-strip', band.value.strip)
  root.style.setProperty('--club-strip-alt', band.value.stripAlt ?? band.value.strip)
})
</script>

<template>
  <header class="topbar">
    <button v-if="showBack" class="topbar__back" aria-label="Back" @click="router.back()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>

    <div class="topbar__title">
      <div class="topbar__club">{{ title }}</div>
      <div class="topbar__meta">{{ subtitle }}</div>
    </div>

    <button
      v-if="isRoot"
      class="topbar__action"
      aria-label="Settings"
      @click="router.push('/settings')"
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 3.68 1.65 1.65 0 0010 2.17V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
    </button>
  </header>
  <div class="topbar__strip" :class="{ 'topbar__strip--split': band.stripAlt }" />
</template>
