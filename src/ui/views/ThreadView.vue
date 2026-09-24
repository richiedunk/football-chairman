<script setup lang="ts">
import { computed, inject, watch } from 'vue'
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
  // The outcome is written into `decision.outcomeText` and appears in the
  // thread as their answer, so it does not also need a screen. A refusal that
  // has no thread to appear in still does — `notify` is where those go.
  if (outcome && !item.decision?.outcomeText) notify?.(outcome, 'success')
}

/**
 * A second tap can land after the first has answered and before the buttons
 * re-render, when there is nothing left to answer. It is dropped, not sent.
 */
function reply(optionId: string) {
  const item = answering()
  if (item) send(item, optionId)
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

/**
 * The one decision being answered right now: the oldest one still open.
 *
 * A busy week leaves two or three open at once. Offering all of them at once
 * stacked three near-identical sets of options — four ways to answer a bid,
 * then four more for a different bid, with nothing saying which belonged to
 * which — so only one is offered and answering it reveals the next.
 *
 * **Oldest, not newest.** These expire: an offer lapses two weeks after it
 * arrives and resolves itself with its default. So the one nearest the front
 * of the queue is the one nearest to being decided for you, and it is the one
 * that should be in front of you. It also means the question being answered is
 * the first one you meet reading down, rather than the last.
 *
 * **A function, not a computed, and that is load-bearing.** `isOpen` reads
 * `decision.chosenId` off the raw engine object, and the game state is a
 * `shallowRef` — so a mutation there is invisible to reactivity until the
 * store bumps its revision. The template calls `isOpen` afresh on every
 * render; a cached computed only re-evaluates when its dependencies say so.
 * The two drifted apart, and the screen ended up naming the offer you had just
 * answered while the one still waiting sat above it greyed out. Evaluated in
 * the same render as the predicate it agrees with, they cannot disagree.
 */
function answering(): InboxItem | null {
  return (thread.value?.messages ?? []).find(isOpen) ?? null
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
  <div v-if="thread" class="chat">
    <div class="chat__log" role="log">
      <template v-for="(item, index) in thread.messages" :key="item.id">
        <div v-if="weekBreak(index)" class="chat__break num">{{ weekBreak(index) }}</div>

        <!-- Theirs. -->
        <div class="bubble bubble--in">
          <div v-if="letterhead(index)" class="bubble__who num">{{ item.from }}</div>
          <p class="bubble__text">{{ item.body }}</p>

          <button v-if="hasDestination(item)" class="bubble__attach" @click="follow(item)">
            {{ buttonLabel(item) }}
          </button>

          <div class="bubble__stamp num">W{{ item.week }}</div>
        </div>

        <!-- The question, held under the message that asked it — but only the
             one being answered is live. Two amber prompts on screen with a
             single set of replies at the bottom is the reader guessing which
             offer they are accepting, which is the worst thing this screen
             could ask of them. -->
        <div
          v-if="isOpen(item)"
          class="chat__asking num"
          :class="{ 'is-waiting': item.id !== answering()?.id }"
        >
          {{ item.decision!.prompt }}
          <span v-if="item.id !== answering()?.id" class="chat__queued">still waiting</span>
        </div>

        <!-- Yours: what you said back. -->
        <div v-if="chosen(item)" class="bubble bubble--out">
          <p class="bubble__text">{{ chosen(item)!.label }}</p>
          <div class="bubble__stamp num">W{{ item.week }}</div>
        </div>

        <!-- And their answer to it. -->
        <div v-if="item.decision?.chosenId && item.decision.outcomeText" class="bubble bubble--in">
          <p class="bubble__text">{{ item.decision.outcomeText }}</p>
        </div>
      </template>
    </div>

    <!-- The replies, always on show. You cannot type to a chairman, so there
         is no text box to put them behind — hiding them behind a Reply button
         was a button whose only job was to reveal the thing the screen is for. -->
    <div v-if="answering()" class="replies">
      <div class="replies__head num">
        <!-- Naming it is the whole fix: the options for two different offers
             are word-for-word identical, so the only thing telling them apart
             is which message they belong to. -->
        <span class="replies__subject">{{ answering()!.subject }}</span>
        <span v-if="thread.pending > 1">{{ thread.pending - 1 }} MORE AFTER</span>
      </div>
      <div v-if="answering()!.urgent" class="replies__blocks num">THIS ONE BLOCKS THE WEEK</div>
      <button
        v-for="option in answering()!.decision!.options"
        :key="option.id"
        class="reply"
        :disabled="!option.available"
        @click="reply(option.id)"
      >
        <span class="reply__label">{{ option.label }}</span>
        <!-- The consequence stays on the chip. A row of bare labels is a
             prettier screen that asks the reader to choose blind. -->
        <span class="reply__hint num">
          {{ option.available ? option.hint : option.unavailableReason }}
        </span>
      </button>
    </div>
  </div>
</template>
