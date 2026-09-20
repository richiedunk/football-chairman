<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
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

    <div v-else class="threads">
      <button
        v-for="thread in shown"
        :key="thread.key"
        class="chat-row"
        :class="{ 'is-unread': thread.unread > 0, 'is-urgent': thread.urgent }"
        @click="open(thread)"
      >
        <span class="chat-row__main">
          <span class="chat-row__top">
            <span class="chat-row__name">{{ thread.title }}</span>
            <span class="chat-row__when num">{{ when(thread) }}</span>
          </span>
          <span class="chat-row__bottom">
            <span class="thread__preview">{{ preview(thread.latest) }}</span>
            <span v-if="thread.urgent" class="chat-row__flag chat-row__flag--urgent">!</span>
            <span v-else-if="thread.pending > 0" class="chat-row__flag chat-row__flag--decide">?</span>
            <span v-else-if="thread.unread > 0" class="chat-row__count">{{ thread.unread }}</span>
          </span>
        </span>
      </button>
    </div>

    <button v-if="store.unread > 0" class="btn btn--ghost btn--block mt" @click="store.markAllRead()">
      Mark all read
    </button>
  </div>
</template>
