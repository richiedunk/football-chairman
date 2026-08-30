<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { deleteSave, listSaves, storageName, storageQuota } from '../../storage/saves'
import type { SaveSlotMeta } from '../../storage/adapter'

const store = useGameStore()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const saves = ref<SaveSlotMeta[]>([])
const quota = ref<{ used: number; available: number } | null>(null)
const saveName = ref('')

const settings = computed(() => store.game?.settings ?? null)

onMounted(refresh)

async function refresh() {
  saves.value = await listSaves()
  quota.value = await storageQuota()
}

async function saveNow() {
  try {
    const slot = `manual-${Date.now()}`
    await store.save(slot, saveName.value.trim() || undefined)
    saveName.value = ''
    await refresh()
  } catch (e) {
    notify?.(e instanceof Error ? e.message : 'Save failed.', 'error')
  }
}

async function loadSlot(id: string) {
  if (await store.load(id)) {
    router.push('/home')
  } else {
    notify?.('That save could not be read.', 'error')
  }
}

async function removeSlot(id: string) {
  await deleteSave(id)
  await refresh()
}

function quit() {
  store.reset()
  router.push('/')
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div v-if="settings">

    <div class="card">
      <div class="card__head"><span class="card__title">Game</span></div>
      <div class="card__body">
        <label class="row row--between" style="min-height: var(--tap)">
          <span class="small">Autosave every week</span>
          <input v-model="settings.autosave" type="checkbox" @change="store.commit()" />
        </label>
        <label class="row row--between" style="min-height: var(--tap)">
          <span class="small">Haptic feedback</span>
          <input v-model="settings.hapticsEnabled" type="checkbox" @change="store.commit()" />
        </label>
        <div class="field mt">
          <label class="field__label">Currency</label>
          <select v-model="settings.currency" class="select" @change="store.commit()">
            <option value="GBP">Pounds (£)</option>
            <option value="EUR">Euros (€)</option>
            <option value="USD">Dollars ($)</option>
          </select>
        </div>
        <label class="row row--between mt" style="min-height: var(--tap)">
          <span class="small">
            Show true attributes
            <span class="tiny faint" style="display: block">
              Bypasses the scouting system entirely. For debugging.
            </span>
          </span>
          <input v-model="settings.revealTrueAttributes" type="checkbox" @change="store.commit()" />
        </label>
      </div>
    </div>

    <div class="section-title">Saves</div>
    <div class="card">
      <div class="card__body">
        <div class="row">
          <input v-model="saveName" class="input grow" type="text" placeholder="Save name (optional)" />
          <button class="btn btn--primary btn--sm" @click="saveNow">Save</button>
        </div>
        <div class="tiny faint mt">
          Stored on this device via {{ storageName() }}.
          <template v-if="quota">
            {{ mb(quota.used) }} used.
          </template>
        </div>
      </div>
      <div class="list">
        <div v-for="slot in saves" :key="slot.id" class="list__row list__row--static">
          <button
            class="list__main"
            style="background: none; border: 0; color: inherit; text-align: left; padding: 0"
            @click="loadSlot(slot.id)"
          >
            <div class="list__primary">{{ slot.name }}</div>
            <div class="list__secondary">
              {{ slot.summary.clubName }} · {{ slot.summary.season }} wk {{ slot.summary.week }}
              · {{ mb(slot.size) }}
            </div>
          </button>
          <button class="btn btn--ghost btn--sm" aria-label="Delete" @click="removeSlot(slot.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="section-title">World</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between small">
          <span class="muted">Seed</span>
          <span class="num">{{ store.game?.seed }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Clubs</span>
          <span class="num">{{ Object.keys(store.game?.clubs ?? {}).length }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Players</span>
          <span class="num">{{ Object.keys(store.game?.players ?? {}).length }}</span>
        </div>
      </div>
    </div>

    <button class="btn btn--ghost btn--block mt" @click="router.push('/about')">
      About and legal notice
    </button>

    <button class="btn btn--danger btn--block mt" style="margin-bottom: 8px" @click="quit">
      Quit to title
    </button>
  </div>
</template>
