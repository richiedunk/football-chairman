<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from './stores/game'
import AppTopBar from './ui/components/AppTopBar.vue'
import AppTabBar from './ui/components/AppTabBar.vue'
import { listSaves } from './storage/saves'

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
const isSetupRoute = computed(() =>
  ['start', 'new-game', 'club-select'].includes(String(route.name)),
)
const showChrome = computed(() => store.loaded && !isSetupRoute.value)

onMounted(async () => {
  hasSaves.value = (await listSaves()).length > 0
  // A reload mid-career should land back in the game, not on the title screen.
  if (!store.loaded && !isSetupRoute.value) router.replace({ name: 'start' })
})
</script>

<template>
  <div class="app-shell">
    <AppTopBar v-if="showChrome" />

    <main class="content">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

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
