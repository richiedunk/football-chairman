<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from './stores/game'
import AppTopBar from './ui/components/AppTopBar.vue'
import AppStatusBar from './ui/components/AppStatusBar.vue'
import AppTabBar from './ui/components/AppTabBar.vue'
import AdvanceBar from './ui/components/AdvanceBar.vue'
import NoticeScreen, { type Notice } from './ui/components/NoticeScreen.vue'
import { listSaves } from './storage/saves'
import { bindAppStateChange, bindBackButton } from './platform/native'

const store = useGameStore()
const route = useRoute()
const router = useRouter()

/**
 * Outcomes are provided from the shell rather than owned per-view, so that an
 * action which navigates away can still report what it did.
 *
 * A queue, not a slot. The toast this replaces overwrote whatever was showing
 * and reset its own timer, so two messages in quick succession meant the first
 * was destroyed without trace.
 */
const notices = ref<Notice[]>([])
let noticeId = 0

function notify(text: string, kind: 'info' | 'error' | 'success' = 'info') {
  if (!text) return
  notices.value = [...notices.value, { id: ++noticeId, text, kind }]
}
function dismissNotice() {
  notices.value = notices.value.slice(1)
}
provide('notify', notify)

const hasSaves = ref(false)
// Screens that own the whole display. The welcome handover is one of them:
// it is a moment rather than a destination, and a back arrow on it would lead
// to the club you have just stopped choosing between.
const isSetupRoute = computed(() =>
  ['start', 'new-game', 'club-select', 'welcome'].includes(String(route.name)),
)
const showChrome = computed(() => store.loaded && !isSetupRoute.value)

/**
 * Every screen opens at the top.
 *
 * The router's own scrollBehavior scrolls the window, and this app does not
 * scroll the window — `.content` does. So it has quietly done nothing, and
 * opening a player from halfway down a squad list dropped you halfway down his
 * profile.
 */
const content = ref<HTMLElement | null>(null)
watch(
  () => route.fullPath,
  () => {
    // After the route transition has swapped the component in, or the reset
    // lands on the outgoing screen.
    void nextTick(() => content.value?.scrollTo({ top: 0 }))
  },
)

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
      () => notices.value.length > 0 || !['start', 'home'].includes(String(route.name)),
      () => {
        // A message waiting to be read is what back dismisses first. Navigating
        // out from under it would lose the thing it was trying to say.
        if (notices.value.length > 0) dismissNotice()
        else router.back()
      },
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
  <div class="app-shell" :inert="notices.length > 0 || undefined">
    <AppTopBar v-if="showChrome" />
    <AppStatusBar v-if="showChrome" />

    <main ref="content" class="content">
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


  </div>

  <!-- Outside the shell, so making the shell inert does not disable the very
       button that dismisses the message. Deliberately not animated: a screen
       that has to be acknowledged should be there the moment you look at it,
       and fading it in leaves its own dismiss button briefly unclickable. -->
  <NoticeScreen :queue="notices" @dismiss="dismissNotice" />
</template>
