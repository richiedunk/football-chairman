<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { CATEGORY_LABELS } from '../../engine/systems/inbox'
import { linkLabel } from '../screens'
import { followLink, resolveLink } from '../link'
import type { InboxItem } from '../../engine/types'

const store = useGameStore()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const filter = ref<'all' | 'unread' | 'decisions'>('all')
const openId = ref<string | null>(null)

const items = computed(() => {
  const all = store.inbox
  if (filter.value === 'unread') return all.filter((i) => !i.read)
  if (filter.value === 'decisions') return all.filter((i) => i.decision && !i.decision.chosenId)
  return all
})

function toggle(item: InboxItem) {
  openId.value = openId.value === item.id ? null : item.id
  if (openId.value) store.markRead(item.id)
}

function choose(item: InboxItem, optionId: string) {
  const outcome = store.decide(item.id, optionId)
  if (outcome) notify?.(outcome, 'success')
}

function follow(item: InboxItem) {
  if (!item.link) return
  if (!followLink(router, item.link)) {
    notify?.('That screen is no longer there.', 'error')
  }
}

/**
 * What the button says. Naming the destination — and the player, where the
 * link is to a player — is the difference between a message you can act on
 * from the list and one you have to open to understand.
 */
function buttonLabel(item: InboxItem): string {
  if (!item.link) return 'Open'
  const { view, id } = item.link
  const subject = view === 'player' && id ? store.player(id)?.knownAs : null
  return linkLabel(view, subject)
}

/** A link is only shown when it goes somewhere. */
function hasDestination(item: InboxItem): boolean {
  return !!item.link && resolveLink(router, item.link) !== null
}

/**
 * The colour of an item's leading bar.
 *
 * Urgency, not category. Category is already spelled out in the line beneath,
 * and colouring eleven categories would mean eleven colours competing on one
 * screen — which is how the old build ended up with nothing standing out.
 */
function severity(item: InboxItem): string {
  if (!item.decision || item.decision.chosenId) return 'var(--border-strong)'
  return item.urgent ? 'var(--danger)' : 'var(--warn)'
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

    <div v-if="items.length === 0" class="card">
      <div class="empty">Nothing here.</div>
    </div>

    <div v-for="item in items" :key="item.id" class="card">
      <button
        class="list__row"
        style="border-bottom: 0"
        :style="!item.read ? 'background: rgba(106, 169, 255, 0.07)' : ''"
        @click="toggle(item)"
      >
        <span
          class="dash-item__severity"
          :style="{ background: severity(item) }"
          aria-hidden="true"
        />
        <div class="list__main">
          <div class="list__primary">
            <span v-if="!item.read" style="color: var(--info)">● </span>{{ item.subject }}
          </div>
          <div class="list__secondary num">
            {{ item.from }} · {{ CATEGORY_LABELS[item.category] }} · wk {{ item.week }}
          </div>
        </div>
        <span v-if="item.urgent && item.decision && !item.decision.chosenId" class="chip chip--danger">Urgent</span>
        <span v-else-if="item.decision && !item.decision.chosenId" class="chip chip--warn">Decide</span>
      </button>

      <div v-if="openId === item.id" class="card__body" style="border-top: 1px solid var(--border)">
        <p class="small" style="white-space: pre-line">{{ item.body }}</p>

        <template v-if="item.decision">
          <div v-if="!item.decision.chosenId" class="mt">
            <div class="small bold mb">{{ item.decision.prompt }}</div>
            <div class="col">
              <button
                v-for="option in item.decision.options"
                :key="option.id"
                class="btn btn--block"
                :class="option.id === item.decision.options[0].id ? 'btn--primary' : 'btn--ghost'"
                :disabled="!option.available"
                style="flex-direction: column; align-items: flex-start; padding: 10px 14px; height: auto; min-height: var(--tap)"
                @click="choose(item, option.id)"
              >
                <span>{{ option.label }}</span>
                <span class="tiny" style="opacity: 0.75; font-weight: 400">
                  {{ option.available ? option.hint : option.unavailableReason }}
                </span>
              </button>
            </div>
          </div>
          <div v-else class="mt small" style="color: var(--accent)">
            {{ item.decision.outcomeText ?? 'Answered.' }}
          </div>
        </template>

        <button v-if="hasDestination(item)" class="btn btn--ghost btn--sm btn--block mt" @click="follow(item)">
          {{ buttonLabel(item) }}
        </button>
      </div>
    </div>

    <button v-if="store.unread > 0" class="btn btn--ghost btn--block mt" @click="store.markAllRead()">
      Mark all read
    </button>
  </div>
</template>
