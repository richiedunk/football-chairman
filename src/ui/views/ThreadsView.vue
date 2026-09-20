<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { CATEGORY_LABELS } from '../../engine/systems/inbox'
import { groupThreads, preview, type Thread } from '../threads'

/**
 * The conversations, most recently spoken in first.
 *
 * This replaces a flat list of forty messages filed by category. Nine things
 * arriving in a week is nine rows there and four conversations here, and the
 * four are what the reader is actually keeping track of.
 */

const store = useGameStore()
const router = useRouter()

const filter = ref<'all' | 'unread' | 'decisions'>('all')

const threads = computed(() => groupThreads(store.inbox))

const shown = computed(() => {
  if (filter.value === 'unread') return threads.value.filter((t) => t.unread > 0)
  if (filter.value === 'decisions') return threads.value.filter((t) => t.pending > 0)
  return threads.value
})

function open(thread: Thread) {
  void router.push(`/inbox/${encodeURIComponent(thread.key)}`)
}

/**
 * How long ago, in the units the reader thinks in.
 *
 * Weeks, not dates. The calendar is an engine detail and the week is what a
 * season is counted in, so "3 weeks ago" reads and "week 19" has to be
 * subtracted from something first.
 */
function when(thread: Thread): string {
  const now = store.game?.date
  if (!now) return ''
  const seasons = now.season - thread.latest.season
  if (seasons > 0) return seasons === 1 ? 'LAST SEASON' : `${seasons} SEASONS AGO`
  const weeks = now.week - thread.latest.week
  if (weeks <= 0) return 'THIS WEEK'
  return weeks === 1 ? 'LAST WEEK' : `${weeks} WEEKS AGO`
}

/**
 * Urgency, not category. Colouring eleven categories puts eleven colours on
 * one screen, which is how the build this replaces ended up with nothing
 * standing out.
 */
function severity(thread: Thread): string {
  if (thread.pending === 0) return 'var(--border-strong)'
  return thread.urgent ? 'var(--danger)' : 'var(--warn)'
}
</script>

<template>
  <div>
    <div class="segmented mb">
      <button class="segmented__item" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">
        All
      </button>
      <button class="segmented__item" :class="{ 'is-active': filter === 'unread' }" @click="filter = 'unread'">
        Unread ({{ store.unread }})
      </button>
      <button class="segmented__item" :class="{ 'is-active': filter === 'decisions' }" @click="filter = 'decisions'">
        Decisions ({{ store.pendingDecisions }})
      </button>
    </div>

    <div v-if="shown.length === 0" class="card">
      <!-- `empty` is as shared a class as `list__row` is, so this state carries
           a name of its own too. Both of this screen's states have to be
           tellable from another screen's, or a test that waits for one of them
           passes while looking at the wrong screen. -->
      <div class="empty threads-empty">Nobody is waiting on you.</div>
    </div>

    <div v-else class="card">
      <!-- `threads` names this list for what it is. `list__row` is on half the
           screens in the game, so a selector anchored on it matches the wrong
           rows — which is exactly how the end-to-end test came to tap a league
           row while looking for a conversation. -->
      <div class="list threads">
        <button
          v-for="thread in shown"
          :key="thread.key"
          class="list__row"
          @click="open(thread)"
        >
          <span class="dash-item__severity" :style="{ background: severity(thread) }" aria-hidden="true" />
          <div class="list__main">
            <div class="list__primary">
              <span v-if="thread.unread > 0" style="color: var(--info)">● </span>{{ thread.title }}
            </div>
            <div class="thread__preview">{{ preview(thread.latest) }}</div>
            <div class="list__secondary num">
              {{ CATEGORY_LABELS[thread.category] }} · {{ when(thread) }}
            </div>
          </div>
          <span v-if="thread.urgent" class="chip chip--danger">Urgent</span>
          <span v-else-if="thread.pending > 0" class="chip chip--warn">Decide</span>
        </button>
      </div>
    </div>

    <button v-if="store.unread > 0" class="btn btn--ghost btn--block mt" @click="store.markAllRead()">
      Mark all read
    </button>
  </div>
</template>
