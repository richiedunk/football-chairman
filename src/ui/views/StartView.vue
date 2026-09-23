<script setup lang="ts">
// Bound rather than literal: a literal `src` is resolved by the bundler as a
// module import, and this file lives in public/, which is copied rather than
// bundled. Relative, because the build is based at './' so it can be opened
// from file:// inside a Capacitor WebView — and hash routing means the
// document URL is always index.html, so a relative asset resolves the same
// from every screen.
const badgeUrl = 'badge.svg'

import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { challengeFromUrl } from '../../engine/systems/challenge'
import { deleteSave, listSaves, storageName } from '../../storage/saves'
import type { SaveSlotMeta } from '../../storage/adapter'
import StadiumScene from '../components/StadiumScene.vue'

const router = useRouter()
const route = useRoute()
const store = useGameStore()
const saves = ref<SaveSlotMeta[]>([])
const error = ref('')

/**
 * A challenge link that has just been opened.
 *
 * The link lands here rather than on the challenge screen directly, because
 * the recipient may already have a career in progress and sending them
 * straight into "take this job" would look like an offer to overwrite it. So
 * the title screen makes it the loudest thing on the page and lets them
 * choose.
 */
const incoming = computed(() => {
  const code = route.query.challenge
  return typeof code === 'string' && challengeFromUrl(code) ? code : null
})

onMounted(refresh)

async function refresh() {
  try {
    saves.value = await listSaves()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not read saved games.'
  }
}

async function open(slot: SaveSlotMeta) {
  error.value = ''
  try {
    if (await store.load(slot.id)) router.push('/phone')
    else error.value = 'That save could not be read.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'That save could not be read.'
  }
}

async function remove(slot: SaveSlotMeta) {
  await deleteSave(slot.id)
  await refresh()
}

function when(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<style scoped>
.start { position: relative; }
/* The ground sits behind the title, bleeding to the edges of the screen. */
.start__scene {
  position: absolute;
  top: calc(var(--pad) * -1);
  left: calc(var(--pad) * -1);
  right: calc(var(--pad) * -1);
  aspect-ratio: 400 / 240;
  max-height: 340px;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent);
  mask-image: linear-gradient(180deg, #000 70%, transparent);
}
.start__scene :deep(svg) { width: 100%; height: 100%; display: block; }
.title {
  position: relative;
  padding: min(46vw, 190px) 0 24px;
  text-align: center;
}
.title__badge {
  display: block;
  width: 108px;
  height: auto;
  margin: 0 auto 12px;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 22px rgba(200, 255, 77, 0.25));
}
.title__name {
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
}
.title__name span {
  display: block;
  font-size: 0.52em;
  font-weight: 700;
  letter-spacing: 0.32em;
  margin-top: 6px;
  color: var(--accent);
}
.title__strap {
  margin: 14px auto 0;
  max-width: 22em;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-dim);
}
.start__actions { max-width: 420px; margin: 0 auto; }
.start__legal {
  max-width: 34em;
  margin: 18px auto 0;
  padding: 0 12px 10px;
  font-size: 0.64rem;
  line-height: 1.5;
  color: var(--text-fainter);
  text-align: center;
}
</style>

<template>
  <div class="start">
    <div class="start__scene"><StadiumScene /></div>
    <!-- The badge and the wordmark, under the floodlights. -->
    <div class="title">
      <!-- The badge, then the wordmark. The mark exists now and the title
           screen was the one place still describing the game in text alone. -->
      <img class="title__badge" :src="badgeUrl" alt="" aria-hidden="true" width="118" height="106" />
      <h1 class="title__name">Undisclosed<span>Football</span></h1>
      <p class="title__strap">
        You run recruitment, contracts, the academy and the books.
        Someone else picks the team.
      </p>
    </div>

    <div class="start__actions">
    <template v-if="incoming">
      <div class="card" style="background: var(--accent-wash); border-color: var(--accent-dim)">
        <div class="card__body">
          <div style="font-weight: 700; letter-spacing: -0.02em">Somebody has set you a challenge</div>
          <p class="small muted" style="margin: 6px 0 0">
            The same club, the same squad and the same head coach they were
            handed. See if you do better.
          </p>
        </div>
      </div>
      <button
        class="btn btn--primary btn--block mt"
        @click="router.push({ name: 'challenge', query: { challenge: incoming } })"
      >
        Look at the challenge
      </button>
      <button class="btn btn--ghost btn--block mt" @click="router.push('/new')">
        Start a new career instead
      </button>
    </template>

    <button v-else class="btn btn--primary btn--block" @click="router.push('/new')">
      Start a new career
    </button>

    <div v-if="error" class="card mt">
      <div class="card__body small" style="color: var(--danger)">{{ error }}</div>
    </div>

    <template v-if="saves.length">
      <div class="section-title">Continue</div>
      <div class="card">
        <div class="list">
          <div v-for="slot in saves" :key="slot.id" class="list__row list__row--static">
            <button class="list__main" style="background:none;border:0;color:inherit;text-align:left;padding:0" @click="open(slot)">
              <div class="list__primary">{{ slot.summary.clubName }}</div>
              <div class="list__secondary">
                {{ slot.summary.leagueName }} · {{ slot.summary.season }}, week {{ slot.summary.week }}
                · L{{ slot.summary.level }}
              </div>
              <div class="tiny faint">{{ slot.name }} · {{ when(slot.savedAt) }}</div>
            </button>
            <button class="btn btn--ghost btn--sm" aria-label="Delete save" @click="remove(slot)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    </template>

    </div>

    <p class="tiny faint center mt">
      Saves are stored on this device ({{ storageName() }}). Clearing site data removes them.
    </p>

    <p class="start__legal">
      Club names are used only to identify the real clubs taking part. No club, competition
      or individual endorses this game or is associated with it, and all third-party trade
      marks belong to their owners. Every player, member of staff and ground in the game is
      invented.
    </p>
  </div>
</template>
