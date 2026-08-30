<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { deleteSave, listSaves, storageName } from '../../storage/saves'
import type { SaveSlotMeta } from '../../storage/adapter'

const router = useRouter()
const store = useGameStore()
const saves = ref<SaveSlotMeta[]>([])
const error = ref('')

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
    if (await store.load(slot.id)) router.push('/home')
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
.title { padding: 34px 0 26px; }
.title__rule {
  width: 44px;
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
  margin-bottom: 20px;
}
.title__name {
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: -0.045em;
}
.title__strap {
  margin-top: 14px;
  max-width: 22em;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-dim);
}
</style>

<template>
  <div>
    <!-- The wordmark is the mark. An emoji ball was a full-colour cartoon on
         a screen that has no other colour, and it undersold the game. -->
    <div class="title">
      <div class="title__rule" />
      <h1 class="title__name">Director<br />of Football</h1>
      <p class="title__strap">
        You run recruitment, contracts, the academy and the books.
        Someone else picks the team.
      </p>
    </div>

    <button class="btn btn--primary btn--block" @click="router.push('/new')">
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

    <p class="tiny faint center mt">
      Saves are stored on this device ({{ storageName() }}). Clearing site data removes them.
    </p>

    <p class="tiny faint center" style="padding: 0 12px 10px; line-height: 1.5">
      Club names are used only to identify the real clubs taking part. No club, competition
      or individual endorses this game or is associated with it, and all third-party trade
      marks belong to their owners. Every player, member of staff and ground in the game is
      invented.
    </p>
  </div>
</template>
