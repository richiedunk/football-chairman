<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from './stores/game'
import AppTopBar from './ui/components/AppTopBar.vue'
import AppStatusBar from './ui/components/AppStatusBar.vue'
import AppTabBar from './ui/components/AppTabBar.vue'
import AdvanceBar from './ui/components/AdvanceBar.vue'
import { listSaves } from './storage/saves'
import { bindAppStateChange, bindBackButton } from './platform/native'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

/**
 * Toasts are provided from the shell rather than owned per-view, so that an
 * action which navigates away can still report its outcome.
 */
const toast = ref<{ text: string; kind: 'info' | 'error' | 'success' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(text: string, kind: 'info' | 'error' | 'success' = 'info') {
  toast.value = { text, kind }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 2600)
}
provide('toast', showToast)

const hasSaves = ref(false)
// Screens that own the whole display. The welcome handover is one of them:
// it is a moment rather than a destination, and a back arrow on it would lead
// to the club you have just stopped choosing between.
const isSetupRoute = computed(() =>
  ['start', 'new-game', 'club-select', 'welcome'].includes(String(route.name)),
)
const showChrome = computed(() => store.loaded && !isSetupRoute.value)

// The advance button belongs to the dashboard, but it lives in the shell so
// it cannot move and is never inside a scrolling region. The primary action of
// a game played one-handed should not need a scroll to reach.
//
// It also appears on a match report the player has just been handed, where it
// reads "Continue" — but NOT on one they reopened from the results list. There
// it would be a button that advances the week sitting under a match from three
// weeks ago, which is a way to lose a week by tapping the wrong thing. A
// reopened report is an ordinary detail screen and the back arrow closes it.
const showAdvance = computed(() => {
  if (!showChrome.value) return false
  if (route.name === 'home') return true
  return route.name === 'match' && store.matchQueue.includes(String(route.params.id ?? ''))
})

const cleanups: (() => void)[] = []

onMounted(async () => {
  hasSaves.value = (await listSaves()).length > 0
  // A reload mid-career should land back in the game, not on the title screen.
  if (!store.loaded && !isSetupRoute.value) router.replace({ name: 'start' })

  // Android's hardware back button, so back navigates rather than quitting.
  cleanups.push(
    await bindBackButton(
      () => !['start', 'home'].includes(String(route.name)),
      () => router.back(),
    ),
  )

  // Mobile operating systems kill backgrounded apps without warning, so the
  // last chance to persist progress is the moment the app loses focus.
  cleanups.push(
    await bindAppStateChange(() => {
      if (store.loaded && store.game?.settings.autosave) void store.autosave()
    }),
  )
})

onUnmounted(() => {
  for (const cleanup of cleanups) cleanup()
})
</script>

<template>
  <div class="app-shell">
    <AppTopBar v-if="showChrome" />
    <AppStatusBar v-if="showChrome" />

    <main class="content">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <AdvanceBar v-if="showAdvance" />
    <AppTabBar v-if="showChrome" />

    <Transition name="fade">
      <div v-if="store.busy" class="overlay">
        <div class="col" style="align-items: center; gap: 14px">
          <div class="spinner" />
          <div class="small muted">{{ store.busyMessage }}</div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div
        v-if="toast"
        class="toast"
        :class="{ 'toast--error': toast.kind === 'error', 'toast--success': toast.kind === 'success' }"
        role="status"
        aria-live="polite"
      >
        {{ toast.text }}
      </div>
    </Transition>
  </div>
</template>
