<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from './stores/game'
import AppTopBar from './ui/components/AppTopBar.vue'
import AppStatusBar from './ui/components/AppStatusBar.vue'
import AppHomeBar from './ui/components/AppHomeBar.vue'
import AppRail from './ui/components/AppRail.vue'
import PaneEmpty from './ui/components/PaneEmpty.vue'
import { useWide } from './ui/wide'
import { paneLoader } from './ui/panes'
import AdvanceBar from './ui/components/AdvanceBar.vue'
import NoticeScreen, { type Notice } from './ui/components/NoticeScreen.vue'
import { nextLine } from './ui/loadingLines'
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
  ['start', 'new-game', 'club-select', 'welcome', 'looking'].includes(String(route.name)),
)

/**
 * Out of work, every other screen is about a club you do not have — so being
 * sacked lands on the jobs board and stays there until you take something.
 */
watch(
  () => [store.betweenJobs, route.name] as const,
  ([looking, name]) => {
    if (looking && name !== 'looking' && name !== 'career' && name !== 'settings') {
      router.replace('/looking')
    } else if (!looking && name === 'looking' && store.loaded) {
      router.replace('/phone')
    }
  },
  { immediate: true },
)
const showChrome = computed(() => store.loaded && !isSetupRoute.value)

/**
 * The desktop arrangement.
 *
 * Three things change above the breakpoint and nothing else does: the apps
 * become a rail on the left instead of a grid you travel to, the column stops
 * being clamped to a phone's width, and a screen that is a list next to a
 * detail is drawn as both at once.
 *
 * Everything below that is untouched. The squad list is twenty-five rows of
 * nine attributes and it is correct at any width; the point of a wide layout
 * is not to redraw those screens but to stop showing one of them at a time
 * down the middle of a monitor.
 */
const wide = useWide()
const desktop = computed(() => wide.value && showChrome.value)

/** The list that stays on the left, when the current route names one. */
const paneName = computed(() => {
  if (!desktop.value) return undefined
  const name = route.meta.pane
  return typeof name === 'string' ? name : undefined
})

const paneComponents = new Map<string, ReturnType<typeof defineAsyncComponent>>()
const paneComponent = computed(() => {
  const name = paneName.value
  const loader = paneLoader(name)
  if (!name || !loader) return null
  // Cached, so that moving between two players does not tear down and rebuild
  // the squad list beside them on every navigation.
  let component = paneComponents.get(name)
  if (!component) {
    component = defineAsyncComponent(loader)
    paneComponents.set(name, component)
  }
  return component
})

/**
 * True when the route *is* the list.
 *
 * A pane is named after its own list route, so on `/inbox` the left-hand side
 * already holds what the router would put on the right. Rendering both would
 * mount the same view twice and show the conversations next to themselves.
 */
const onPaneRoute = computed(() => paneName.value !== undefined && route.name === paneName.value)

/**
 * Every screen opens at the top.
 *
 * The router's own scrollBehavior scrolls the window, and this app does not
 * scroll the window — `.content` does. So it has quietly done nothing, and
 * opening a player from halfway down a squad list dropped you halfway down his
 * profile.
 */
/**
 * A new line each time the game goes away to think. Chosen when `busy` turns
 * on rather than on a timer: the tick is one synchronous call, so nothing
 * repaints while it runs and a rotating message would sit frozen.
 */
const loadingLine = ref(nextLine())
watch(
  () => store.busy,
  (busy) => {
    if (busy) loadingLine.value = nextLine(loadingLine.value)
  },
)

const content = ref<HTMLElement | null>(null)
const detail = ref<HTMLElement | null>(null)
watch(
  () => route.fullPath,
  () => {
    // After the route transition has swapped the component in, or the reset
    // lands on the outgoing screen.
    //
    // The detail pane when there is one: in the two-pane arrangement it is
    // the detail that scrolls, and resetting the container around it would
    // leave a player's profile opened halfway down.
    void nextTick(() => (detail.value ?? content.value)?.scrollTo({ top: 0 }))
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
  // The home screen is where a week is set off from — it is the screen that
  // says what is waiting, so it is the screen that should let you get on with
  // it. The dashboard keeps the button too, being the same screen it always
  // was, one tap further in.
  if (route.name === 'phone' || route.name === 'home') return true
  // And on the conversations, because that is where the blockers are answered.
  // Clearing the last one and then walking back to set the week off is a round
  // trip through a screen you did not want.
  //
  // The list of them, not inside a thread: a thread scrolls, and the replies
  // are pinned to the bottom of it, so a second control down there would sit
  // on top of the one you are actually using.
  if (route.name === 'inbox') return true
  return route.name === 'match' && store.matchQueue.includes(String(route.params.id ?? ''))
})

const cleanups: (() => void)[] = []

onMounted(async () => {
  hasSaves.value = (await listSaves()).length > 0
  // A reload mid-career should land back in the game, not on the title screen.
  // Except on a screen that does not exist: bouncing a bad address to "Start a
  // new career" is what made a mistyped link look like a lost save, and the
  // not-found screen offers the title as a button instead.
  //
  // `await router.isReady()` is load-bearing. The initial navigation resolves
  // asynchronously, so on a cold load this ran while `route.name` was still
  // undefined — the exemption did not match, and a bad address was replaced
  // with the title screen anyway. It passed under a light load and failed
  // under a heavy one, which is the worst way for a bug like this to behave.
  await router.isReady()
  const landed = router.currentRoute.value.name
  const setup = ['start', 'new-game', 'club-select', 'welcome', 'looking'].includes(String(landed))
  if (!store.loaded && !setup && landed !== 'not-found') {
    router.replace({ name: 'start' })
  }

  // Android's hardware back button, so back navigates rather than quitting.
  cleanups.push(
    await bindBackButton(
      () => notices.value.length > 0 || !['start', 'phone'].includes(String(route.name)),
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
  <div
    class="app-shell"
    :class="{ 'app-shell--desktop': desktop }"
    :inert="notices.length > 0 || undefined"
  >
    <AppRail v-if="desktop" />

    <div class="app-frame">
      <AppTopBar v-if="showChrome && route.name !== 'phone'" />
      <AppStatusBar v-if="showChrome" />

      <!-- Two panes, when the route names a list to keep beside it. -->
      <div v-if="paneComponent" class="panes">
        <aside class="panes__list"><component :is="paneComponent" /></aside>
        <main ref="detail" class="panes__detail">
          <PaneEmpty v-if="onPaneRoute" :pane="paneName!" />
          <RouterView v-else v-slot="{ Component }">
            <Transition name="fade" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </main>
      </div>

      <main v-else ref="content" class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <AdvanceBar v-if="showAdvance" />
      <!-- The rail is the grid, permanently, so a button leading back to the
           grid would lead to what is already on screen. -->
      <AppHomeBar v-if="showChrome && !desktop" />
    </div>

    <div v-if="store.busy" class="loading">
      <!-- A ball rolled along the touchline while the week runs. Transform
           animation only, so it keeps moving while the tick blocks the
           main thread. -->
      <div class="loading__track">
        <span class="loading__roller"><svg class="loading__ball" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#0b0e12" stroke-width="1.4" />
          <path d="M12 7.6l4.2 3-1.6 4.9H9.4l-1.6-4.9z" fill="#0b0e12" />
          <path d="M12 7.6V2M16.2 10.6l5.2-1.7M14.6 15.5l3.2 4.4M9.4 15.5l-3.2 4.4M7.8 10.6L2.6 8.9" stroke="#0b0e12" stroke-width="1.3" />
        </svg></span>
      </div>
      <div class="loading__bar"><div class="loading__sweep" /></div>
      <div class="loading__line">{{ loadingLine }}</div>
      <div class="loading__task">{{ store.busyMessage }}</div>
    </div>


  </div>

  <!-- Outside the shell, so making the shell inert does not disable the very
       button that dismisses the message. Deliberately not animated: a screen
       that has to be acknowledged should be there the moment you look at it,
       and fading it in leaves its own dismiss button briefly unclickable. -->
  <NoticeScreen :queue="notices" @dismiss="dismissNotice" />
</template>
