<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'

/**
 * A screen that is not there.
 *
 * The router used to answer an unresolvable address with a redirect: to the
 * dashboard if a game was loaded, and to the title screen if not. The second
 * one is the problem. Landing on "Start a new career" after tapping a link
 * looks exactly like having been logged out — or worse, like the save has
 * gone — and a game that appears to have lost your career for a mistyped
 * address has done something far worse than fail to find a page.
 *
 * So it says what happened instead. The address is shown, because a wrong
 * address is the one piece of evidence worth having, and the way back is a
 * button you press rather than something that happens to you.
 */
const route = useRoute()
const router = useRouter()
const store = useGameStore()

const attempted = computed(() => {
  const path = route.fullPath
  return path.length > 44 ? `${path.slice(0, 43)}…` : path
})

/** Mid-career, the way back is your own desk. Cold, it is the title screen. */
const home = computed(() => (store.loaded ? '/home' : '/'))
const homeLabel = computed(() => (store.loaded ? 'Back to the dashboard' : 'Back to the title screen'))
</script>

<template>
  <div class="notfound">
    <div class="notfound__label">Wrong turnstile</div>
    <h1 class="notfound__head">There is no such screen</h1>
    <p class="notfound__body">
      You have ended up in a part of the ground that was never built. Usually
      that is a link from an old message, a bookmark from a career that has
      since finished, or a slip in the address.
    </p>
    <div class="notfound__path num">{{ attempted }}</div>
    <p class="notfound__body">
      Nothing has been lost.
      <template v-if="store.loaded">Your career is exactly where you left it.</template>
      <template v-else>Any saved career is still on the title screen.</template>
    </p>

    <div class="col mt">
      <button class="btn btn--primary btn--block" @click="router.replace(home)">
        {{ homeLabel }}
      </button>
      <button v-if="store.loaded" class="btn btn--ghost btn--block" @click="router.replace('/inbox')">
        Back to the inbox
      </button>
    </div>
  </div>
</template>

<style scoped>
.notfound { padding: 40px 0 24px; }
.notfound__label {
  font-family: var(--font-num);
  font-size: 0.62rem;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--warn);
}
.notfound__head {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  margin-top: 8px;
}
.notfound__body {
  font-size: 0.9rem;
  color: var(--text-dim);
  margin-top: 12px;
  line-height: 1.5;
}
/* The address is evidence, so it is shown exactly — wrapped rather than cut,
   since the interesting part of a wrong address is usually the end of it. */
.notfound__path {
  margin-top: 16px;
  padding: 10px 12px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.72rem;
  color: var(--text-faint);
  overflow-wrap: anywhere;
}
</style>
