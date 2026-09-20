<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { findThread, groupThreads, isOpen } from '../threads'
import { linkLabel } from '../screens'
import { followLink, resolveLink } from '../link'
import type { InboxItem } from '../../engine/types'

/**
 * One conversation.
 *
 * `InboxDecision` already holds a prompt, the things you could say back, what
 * you said, and their answer — and the flat inbox drew all four as a form: a
 * paragraph with a stack of full-width buttons under it. Here the same four
 * fields, read in the same order, are a reply.
 *
 * Nothing in the engine moved to make that true. It was always a conversation
 * being rendered as a form.
 */

const store = useGameStore()
const route = useRoute()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const key = computed(() => decodeURIComponent(String(route.params.from ?? '')))
const thread = computed(() => findThread(groupThreads(store.inbox), key.value))

/** The message whose replies are showing. Null is the default: nothing open. */
const replyingTo = ref<string | null>(null)

/**
 * Opening a conversation reads it.
 *
 * All of it, not the last message. An unread count that survives having the
 * thread open in front of you is a badge the reader cannot clear and stops
 * trusting.
 */
watch(
  thread,
  (t) => {
    if (!t) return
    for (const message of t.messages) if (!message.read) store.markRead(message.id)
  },
  { immediate: true },
)

// A thread that no longer exists — an old link, a resolved item trimmed out of
// a 150-message inbox — goes back to the list rather than showing an empty
// screen with a name on it.
watch(
  [thread, () => store.loaded],
  ([t, loaded]) => {
    if (loaded && !t) void router.replace('/inbox')
  },
  { immediate: true },
)

function send(item: InboxItem, optionId: string) {
  const outcome = store.decide(item.id, optionId)
  replyingTo.value = null
  // The outcome is written into `decision.outcomeText` and appears in the
  // thread as their answer, so it does not also need a screen. A refusal that
  // has no thread to appear in still does — `notify` is where those go.
  if (outcome && !item.decision?.outcomeText) notify?.(outcome, 'success')
}

function follow(item: InboxItem) {
  if (!item.link) return
  if (!followLink(router, item.link)) notify?.('That screen is no longer there.', 'error')
}

function buttonLabel(item: InboxItem): string {
  if (!item.link) return 'Open'
  const { view, id } = item.link
  const subject = view === 'player' && id ? store.player(id)?.knownAs : null
  return linkLabel(view, subject)
}

function hasDestination(item: InboxItem): boolean {
  return !!item.link && resolveLink(router, item.link) !== null
}

/** The option the player chose, for the reply that shows what they said. */
function chosen(item: InboxItem) {
  const id = item.decision?.chosenId
  return id ? item.decision?.options.find((o) => o.id === id) ?? null : null
}

/**
 * Whether this message names its sender.
 *
 * A thread has one sender, the header already carries the name, and repeating
 * it above every message is three lines of noise in a conversation that is four
 * messages long. It earns its place only where the letterhead actually changes
 * — which happens in the one thread that merges two of them, Recruitment and
 * the Head of Recruitment being the same desk.
 */
function letterhead(index: number): boolean {
  const messages = thread.value?.messages ?? []
  const before = messages[index - 1]
  return !before || before.from !== messages[index].from
}

/**
 * Where a week rule goes.
 *
 * Between messages from different weeks, and above the first. A conversation
 * spanning a season is unreadable without knowing where the gaps are, and the
 * gaps are where the football happened.
 */
function weekBreak(index: number): string | null {
  const messages = thread.value?.messages ?? []
  const item = messages[index]
  const before = messages[index - 1]
  if (before && before.week === item.week && before.season === item.season) return null
  return `WEEK ${item.week}`
}
</script>

<template>
  <div v-if="thread">
    <div class="thread">
      <template v-for="(item, index) in thread.messages" :key="item.id">
        <div v-if="weekBreak(index)" class="thread__break num">{{ weekBreak(index) }}</div>

        <!-- Theirs. No bubble: the text sits on the ground with a hairline
             above it, which is denser than a bubble and unmistakably not you. -->
        <div class="thread__said">
          <div v-if="letterhead(index)" class="thread__who num">{{ item.from }}</div>
          <p class="thread__body">{{ item.body }}</p>

          <button
            v-if="hasDestination(item)"
            class="thread__attach"
            @click="follow(item)"
          >
            {{ buttonLabel(item) }}
          </button>

          <div v-if="isOpen(item)" class="thread__asking num">
            {{ item.decision!.prompt }}
          </div>
        </div>

        <!-- Yours. The one saturated accent, used once, for the thing you did. -->
        <div v-if="chosen(item)" class="thread__mine">
          <p class="thread__body">{{ chosen(item)!.label }}</p>
        </div>

        <!-- Their answer to it. -->
        <div v-if="item.decision?.chosenId && item.decision.outcomeText" class="thread__said">
          <p class="thread__body">{{ item.decision.outcomeText }}</p>
        </div>
      </template>
    </div>

    <!-- The composer. One open decision at a time, and the most recent one is
         the one a reader is answering, so it is the one offered. -->
    <div v-if="thread.pending > 0" class="composer">
      <template v-for="item in thread.messages.filter(isOpen)" :key="`reply-${item.id}`">
        <button
          v-if="replyingTo !== item.id"
          class="btn btn--primary btn--block composer__open"
          @click="replyingTo = item.id"
        >
          Reply
          <span v-if="item.urgent" class="composer__urgent num">· THIS ONE BLOCKS THE WEEK</span>
        </button>

        <!-- The question is not repeated here. It is already on screen, amber,
             directly above the sheet, under the message that asked it. -->
        <div v-else class="composer__sheet">
          <button
            v-for="option in item.decision!.options"
            :key="option.id"
            class="composer__option"
            :disabled="!option.available"
            @click="send(item, option.id)"
          >
            <span class="composer__label">{{ option.label }}</span>
            <!-- The consequence stays visible. A row of four bare labels is a
                 prettier screen that asks the reader to choose blind. -->
            <span class="composer__hint num">
              {{ option.available ? option.hint : option.unavailableReason }}
            </span>
          </button>
          <button class="btn btn--ghost btn--sm btn--block" @click="replyingTo = null">
            Not yet
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
