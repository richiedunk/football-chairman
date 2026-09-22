<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { PHONE_APPS } from '../apps'
import { badgeFor } from '../appBadge'

/**
 * The apps, down the side.
 *
 * The desktop counterpart to the phone's home screen, and deliberately the
 * same list in the same order rather than a desktop-only menu: somebody who
 * plays on both should not have to learn the game twice, and a second list of
 * destinations is a second thing to keep in step.
 *
 * It replaces the home bar rather than joining it. The home bar exists because
 * a phone needs a way back to the grid; a rail *is* the grid, permanently, so
 * a button leading to it would lead to what is already on screen.
 */
const store = useGameStore()
const route = useRoute()
const router = useRouter()

const current = computed(() => route.meta.tab ?? route.name)

function active(to: string): boolean {
  if (route.path === to) return true
  // The rail lights for the section, not the exact page: a player profile is
  // reached from the squad and belongs under it, which is what `meta.tab`
  // already records for the phone's own back behaviour.
  const id = to.replace(/^\//, '')
  return current.value === id
}

const apps = computed(() =>
  PHONE_APPS.map((app) => ({ app, badge: badgeFor(store, app) })))
</script>

<template>
  <nav class="rail" aria-label="Apps">
    <div class="rail__club">
      <div class="rail__club-name">{{ store.club?.name ?? 'Undisclosed Football' }}</div>
      <div class="rail__club-sub num">{{ store.dateLabel }}</div>
    </div>

    <div class="rail__list">
      <button
        v-for="{ app, badge } in apps"
        :key="app.id"
        class="rail__item"
        :class="{ 'is-active': active(app.to) }"
        :aria-current="active(app.to) ? 'page' : undefined"
        @click="router.push(app.to)"
      >
        <span class="rail__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path :d="app.d" />
            <path v-if="app.extra" :d="app.extra" />
          </svg>
        </span>
        <span class="rail__label">{{ app.label }}</span>
        <span v-if="badge > 0" class="rail__badge">{{ badge > 99 ? '99+' : badge }}</span>
      </button>
    </div>
  </nav>
</template>
