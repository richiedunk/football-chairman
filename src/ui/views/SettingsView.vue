<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import {
  deleteSave, exportSave, importSave, listBackups, listSaves, saveGame, storageName, storageQuota,
} from '../../storage/saves'
import type { SaveSlotMeta } from '../../storage/adapter'

const store = useGameStore()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const saves = ref<SaveSlotMeta[]>([])
const backups = ref<SaveSlotMeta[]>([])
const quota = ref<{ used: number; available: number } | null>(null)
const saveName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

const settings = computed(() => store.game?.settings ?? null)

onMounted(refresh)

async function refresh() {
  saves.value = await listSaves()
  backups.value = await listBackups()
  quota.value = await storageQuota()
}

/**
 * Take the career off the device.
 *
 * `exportSave` and `importSave` have existed in the storage layer since it was
 * written and nothing has ever called them, so there has been no way for a
 * player to move a career to another phone or to keep a copy of one against
 * clearing site data. The download is the compressed save rather than raw
 * JSON — the same bytes the device holds, about 5 MB rather than 50.
 */
async function exportToFile() {
  const state = store.game
  if (!state || busy.value) return
  busy.value = true
  try {
    const blob = await exportSave(state)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(store.club?.shortName ?? 'career').replace(/\W+/g, '-').toLowerCase()}`
      + `-${state.date.season}-wk${state.date.week}.dof`
    link.click()
    URL.revokeObjectURL(url)
    notify?.('Career file saved. Keep it somewhere that is not this device.', 'success')
  } catch (e) {
    notify?.(e instanceof Error ? e.message : 'Export failed.', 'error')
  } finally {
    busy.value = false
  }
}

async function importFromFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || busy.value) return
  busy.value = true
  try {
    const state = await importSave(file)
    // Written to a slot of its own rather than over anything: importing a
    // career should never be the thing that loses one.
    const slot = `imported-${Date.now()}`
    await saveGame(state, slot, `${file.name.replace(/\.[^.]+$/, '')} (imported)`)
    await refresh()
    notify?.('Career imported. It is in the list below.', 'success')
  } catch (e) {
    notify?.(e instanceof Error ? e.message : 'That file could not be read.', 'error')
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
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

    <div class="section-title">Backup</div>
    <div class="card">
      <div class="card__body stack">
        <p class="small muted" style="margin: 0">
          A save lives only on this device. Clearing site data removes it, and a
          new phone does not have it. A career file is the copy you keep.
        </p>
        <div class="row">
          <button
            class="btn btn--ghost btn--sm grow"
            :disabled="busy || !store.loaded"
            @click="exportToFile"
          >Save career to a file</button>
          <button
            class="btn btn--ghost btn--sm grow"
            :disabled="busy"
            @click="fileInput?.click()"
          >Load one from a file</button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".dof,.json,application/json"
          style="display: none"
          @change="importFromFile"
        />
      </div>

      <!-- The copies taken automatically before a save was brought up to a
           new format. Only shown when there are any, because most of the time
           there are none and a permanently empty section is furniture. -->
      <template v-if="backups.length">
        <div class="card__body" style="border-top: 1px solid var(--border)">
          <div class="small bold">Kept before an update</div>
          <p class="tiny faint" style="margin: 4px 0 0">
            Taken automatically when a career was brought up to a newer format.
            Load one only if something looks wrong with the updated career.
          </p>
        </div>
        <div class="list">
          <div v-for="slot in backups" :key="slot.id" class="list__row list__row--static">
            <button
              class="list__main"
              style="background: none; border: 0; color: inherit; text-align: left; padding: 0"
              @click="loadSlot(slot.id)"
            >
              <div class="list__primary">{{ slot.summary.clubName }}</div>
              <div class="list__secondary">
                {{ slot.name }} · {{ slot.summary.season }} wk {{ slot.summary.week }}
                · {{ mb(slot.size) }}
              </div>
            </button>
            <button class="btn btn--ghost btn--sm" aria-label="Delete" @click="removeSlot(slot.id)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </template>
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
