<script setup lang="ts">
import { computed } from 'vue'

/**
 * Outcomes get a screen, not a toast.
 *
 * A toast on a phone is a bad deal for the reader: it appears somewhere they
 * are not looking, sits on top of what they are reading, and takes itself away
 * again on a timer they did not set. Miss it and it is gone — which is fine
 * for "saved" and not fine at all for "the board will not sanction building
 * work while the club is in crisis", a sentence with no other home in the game.
 *
 * So an outcome takes the whole screen and waits. It costs a tap, and the tap
 * is the point: the message has been read, and the game knows it.
 *
 * Messages queue rather than overwrite. The toast this replaces reset its own
 * timer on every call, so a second message destroyed the first without trace —
 * silent data loss in the one channel whose whole job is telling you things.
 */
export interface Notice {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
}

const props = defineProps<{ queue: Notice[] }>()
const emit = defineEmits<{ dismiss: [] }>()

const current = computed(() => props.queue[0] ?? null)
const remaining = computed(() => props.queue.length - 1)

const LABEL: Record<Notice['kind'], string> = {
  error: 'Problem',
  success: 'Done',
  info: 'Note',
}

const TONE: Record<Notice['kind'], string> = {
  error: 'var(--danger)',
  success: 'var(--accent)',
  info: 'var(--info)',
}
</script>

<template>
  <div v-if="current" class="notice" role="alertdialog" aria-modal="true">
    <div class="notice__body">
      <div class="notice__rule" :style="{ background: TONE[current.kind] }" />
      <div class="notice__label" :style="{ color: TONE[current.kind] }">
        {{ LABEL[current.kind] }}
      </div>
      <p class="notice__text">{{ current.text }}</p>
    </div>

    <div class="notice__foot">
      <div v-if="remaining > 0" class="notice__count">
        {{ remaining }} more to read
      </div>
      <button class="advance" @click="emit('dismiss')">
        <span class="advance__label">{{ remaining > 0 ? 'Next' : 'Continue' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Full bleed, and over everything including the tab bar: a message you must
   acknowledge should not share the screen with the buttons that navigate away
   from it. */
.notice {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
.notice__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 0 24px;
}
.notice__rule {
  width: 44px;
  height: 4px;
  border-radius: 2px;
}
.notice__label {
  font-family: var(--font-num);
  font-size: 0.64rem;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.notice__text {
  font-size: 1.35rem;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: -0.02em;
  margin: 0;
}
.notice__foot {
  flex: 0 0 auto;
  padding: 0 var(--pad) 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.notice__count {
  font-family: var(--font-num);
  font-size: 0.62rem;
  letter-spacing: 0.11em;
  color: var(--text-faint);
  text-align: center;
}

@media (min-width: 620px) {
  .notice { max-width: 520px; left: 50%; transform: translateX(-50%); }
}
</style>
