import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
// Fonts are vendored rather than pulled from a CDN: the packaged app has to
// look right with no network, and a phone on a train is the normal case.
import '@fontsource-variable/inter'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/jetbrains-mono'
import './ui/styles/main.css'
import { initialiseNative, isNative } from './platform/native'

// Native chrome is configured before mount so the status bar is already
// styled when the first frame paints, rather than flashing white.
void initialiseNative()

createApp(App).use(createPinia()).use(router).mount('#app')

/**
 * Register the service worker, so the game is playable with no network.
 *
 * After mount, not before: registration is not worth a millisecond of the
 * first paint, and a failure here must never stop the game starting.
 *
 * Skipped inside the native shell, where the files are already on the device
 * and a worker would only add a second cache of them — and skipped on a
 * `file://` URL, where registration is not allowed and throws.
 */
if ('serviceWorker' in navigator && !isNative() && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    // Resolved against this document, so it works from a subdirectory as well
    // as from the root — the same reason `vite.config.ts` sets `base: './'`.
    void navigator.serviceWorker.register(new URL('sw.js', window.location.href))
      .catch(() => {
        // An unregistrable worker means no offline play. It does not mean no
        // game, so there is nothing to tell anybody about.
      })
  })
}
