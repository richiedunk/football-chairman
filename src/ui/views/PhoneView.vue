<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { PHONE_APPS } from '../apps'
import ClubCrest from '../components/ClubCrest.vue'
import { badgeFor as countFor } from '../appBadge'
import { isOpen, preview, threadKey } from '../threads'

/**
 * The home screen.
 *
 * Not a dashboard and not a menu — the place the phone sits when you are not
 * doing anything with it. What it owes the reader is one thing: which of these
 * wants something from me. That is what the badges are for, and it is why the
 * counts are the same counts the screens themselves would show rather than a
 * second reckoning invented here.
 *
 * The dashboard is not gone. It is the Club app, first in the grid, and it
 * still holds the standing, board confidence against its target and the next
 * match. It stopped being the root, which is a different thing from being
 * deleted — the mistake I made twice was calling this a replacement.
 */

const store = useGameStore()
const router = useRouter()

/** Urgent is a different colour from merely waiting. */
const blocked = computed(() => store.blockers.length > 0)

/**
 * The notification stack.
 *
 * What a phone shows you before you have opened anything: who wanted you, and
 * what about. Nothing here is new state — `store.inbox` is already newest
 * first and already knows what has been read — so this is the lock screen a
 * turn-based game can honestly have, rather than a live feed pretending
 * things arrive while you watch.
 *
 * Capped, because thirty ignored messages is not a notification stack, it is
 * the inbox. The ones over the cap are counted rather than listed.
 */
const NOTIFICATION_CAP = 4

const notifications = computed(() =>
  store.inbox.filter((item) => !item.read).slice(0, NOTIFICATION_CAP),
)

const overflow = computed(() => Math.max(0, store.unread - notifications.value.length))

function openNotification(from: string) {
  void router.push(`/inbox/${encodeURIComponent(threadKey(from))}`)
}

const club = computed(() => store.club)
const date = computed(() => store.game?.date ?? null)
</script>

<template>
  <div class="phone">
    <div class="phone__plate">
      <ClubCrest v-if="club" :club="club" :size="64" />
      <div class="grow">
      <div class="phone__club">{{ club?.name ?? 'Undisclosed Football' }}</div>
      <div class="phone__when num">
        <span v-if="date">{{ date.season }}/{{ String((date.season + 1) % 100).padStart(2, '0') }}</span>
        <span v-if="date">WEEK {{ date.week }}</span>
      </div>
      <!-- The one line the home screen owes you before you tap anything. -->
      <div v-if="blocked" class="phone__waiting phone__waiting--urgent num">
        {{ store.blockers.length }} THING{{ store.blockers.length === 1 ? '' : 'S' }} NEED YOU
      </div>
      <div v-else-if="store.pendingDecisions" class="phone__waiting num">
        {{ store.pendingDecisions }} DECISION{{ store.pendingDecisions === 1 ? '' : 'S' }} OPEN
      </div>
      <!-- Only when the stack below is not already saying it. "Nothing
           pressing" above four unread messages is the screen contradicting
           itself. -->
      <div v-else-if="!notifications.length" class="phone__waiting num">NOTHING PRESSING</div>
      </div>
    </div>

    <!-- The stack. Between the plate and the apps, which is where a phone puts
         it, and gone entirely when there is nothing waiting rather than left
         as an empty box saying so. -->
    <div v-if="notifications.length" class="notifs card">
      <button
        v-for="item in notifications"
        :key="item.id"
        class="notif"
        :class="{ 'is-urgent': item.urgent && isOpen(item) }"
        @click="openNotification(item.from)"
      >
        <span class="notif__main">
          <span class="notif__top">
            <span class="notif__from">{{ item.from }}</span>
            <span class="notif__when num">W{{ item.week }}</span>
          </span>
          <span class="notif__text">{{ preview(item) }}</span>
        </span>
      </button>
      <button v-if="overflow > 0" class="notif notif--more" @click="router.push('/inbox')">
        <span class="notif__main num">{{ overflow }} more in the inbox</span>
      </button>
    </div>

    <div class="apps">
      <button
        v-for="app in PHONE_APPS"
        :key="app.id"
        class="app"
        @click="router.push(app.to)"
      >
        <span class="app__tile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="app.d" />
            <path v-if="app.extra" :d="app.extra" />
          </svg>
          <span v-if="countFor(store, app) > 0" class="app__badge">
            {{ countFor(store, app) > 99 ? '99+' : countFor(store, app) }}
          </span>
        </span>
        <span class="app__label">{{ app.label }}</span>
      </button>
    </div>
  </div>
</template>
