import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './ui/styles/main.css'
import { initialiseNative } from './platform/native'

// Native chrome is configured before mount so the status bar is already
// styled when the first frame paints, rather than flashing white.
void initialiseNative()

createApp(App).use(createPinia()).use(router).mount('#app')
