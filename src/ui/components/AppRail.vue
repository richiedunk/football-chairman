<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { PHONE_APPS } from '../apps'
import { badgeFor } from '../appBadge'
import ClubCrest from './ClubCrest.vue'

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

/**
 * The one app the current screen belongs to.
 *
 * A screen with its own app (the ground, the boardroom) lights that app; one
 * without (a player, a match) lights the app it hangs off. Checking both at
 * once lit two rows on the ground's screen — Ground, and Club, which it is
 * filed under.
 */
const activeId = computed(() => {
  const exact = PHONE_APPS.find((app) => app.to === route.path)
  if (exact) return exact.id
  return String(current.value ?? '')
})

function active(to: string): boolean {
  const app = PHONE_APPS.find((a) => a.to === to)
  return app ? app.id === activeId.value : false
}

const apps = computed(() =>
  PHONE_APPS.map((app) => ({ app, badge: badgeFor(store, app) })))
</script>

<template>
  <nav class="rail" aria-label="Apps">
    <div class="rail__club">
      <ClubCrest v-if="store.club" :club="store.club" :size="44" />
      <div class="grow">
        <div class="rail__club-name">{{ store.club?.name ?? 'Undisclosed Football' }}</div>
        <div class="rail__club-sub num">{{ store.dateLabel }}</div>
      </div>
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
