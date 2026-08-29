<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { BACKGROUNDS } from '../../engine/newGame'
import { NATION_DEFS } from '../../engine/world/nations'
import { randomSeed } from '../../engine/rng'
import { useSetupStore } from '../../stores/setup'
import type { DirectorBackground } from '../../engine/types'
import type { WorldSize } from '../../engine/world/worldGen'

const router = useRouter()
const setup = useSetupStore()

const name = ref('')
const background = ref<DirectorBackground>('analyst')
const worldSize = ref<WorldSize>('standard')
const homeNation = ref('eng')
const seed = ref('')
const generating = ref(false)
const error = ref('')

// Only nations with a real pyramid can be a starting country: you begin at the
// bottom, so a nation with a single division has nowhere to start from.
const startNations = NATION_DEFS.filter((n) => n.tiers.length >= 2)

const sizes: { id: WorldSize; label: string; detail: string }[] = [
  { id: 'compact', label: 'Compact', detail: '~240 clubs. Fastest, smallest saves — best on older phones.' },
  { id: 'standard', label: 'Standard', detail: '~490 clubs across 18 nations. The recommended world.' },
  { id: 'large', label: 'Large', detail: 'Every division of every nation. Slower weeks, richest market.' },
]

async function begin() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = 'Enter your name.'
    return
  }
  generating.value = true
  try {
    // Yield a frame so the button's loading state paints before world
    // generation blocks the thread for a second or two.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    setup.generate({
      directorName: name.value.trim(),
      background: background.value,
      worldSize: worldSize.value,
      homeNationId: homeNation.value,
      seed: seed.value.trim() || undefined,
    })
    router.push('/new/club')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create a world.'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="mb">New career</h1>

    <div class="card">
      <div class="card__body">
        <div class="field">
          <label class="field__label" for="dof-name">Your name</label>
          <input
            id="dof-name"
            v-model="name"
            class="input"
            type="text"
            autocomplete="name"
            placeholder="e.g. Sam Whitlock"
            maxlength="32"
          />
        </div>

        <div class="field">
          <label class="field__label" for="dof-nation">Start in</label>
          <select id="dof-nation" v-model="homeNation" class="select">
            <option v-for="n in startNations" :key="n.id" :value="n.id">
              {{ n.name }} — {{ n.tiers.length }} divisions
            </option>
          </select>
          <div class="field__hint">
            Your starting country gets its full pyramid. You begin near the bottom of it.
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">Where you came from</div>
    <div class="card">
      <div class="list">
        <button
          v-for="bg in BACKGROUNDS"
          :key="bg.id"
          class="list__row"
          @click="background = bg.id"
        >
          <div
            class="pos"
            :class="background === bg.id ? 'pos--MID' : ''"
            style="width: 26px"
            aria-hidden="true"
          >{{ background === bg.id ? '✓' : '' }}</div>
          <div class="list__main">
            <div class="list__primary">{{ bg.label }}</div>
            <div class="list__secondary" style="white-space: normal">{{ bg.description }}</div>
            <div class="tiny" style="color: var(--accent); white-space: normal; margin-top: 3px">
              {{ bg.perk }}
            </div>
          </div>
        </button>
      </div>
    </div>

    <div class="section-title">World size</div>
    <div class="card">
      <div class="card__body">
        <div class="segmented mb">
          <button
            v-for="s in sizes"
            :key="s.id"
            class="segmented__item"
            :class="{ 'is-active': worldSize === s.id }"
            @click="worldSize = s.id"
          >{{ s.label }}</button>
        </div>
        <div class="small muted">{{ sizes.find((s) => s.id === worldSize)?.detail }}</div>
      </div>
    </div>

    <div class="section-title">Seed <span class="faint">(optional)</span></div>
    <div class="card">
      <div class="card__body">
        <div class="row">
          <input
            v-model="seed"
            class="input grow"
            type="text"
            placeholder="Leave blank for random"
            maxlength="16"
            autocapitalize="characters"
          />
          <button class="btn btn--ghost btn--sm" @click="seed = randomSeed()">Roll</button>
        </div>
        <div class="field__hint">
          The same seed always builds the same world — useful for comparing runs.
        </div>
      </div>
    </div>

    <div v-if="error" class="card mt">
      <div class="card__body small" style="color: var(--danger)">{{ error }}</div>
    </div>

    <div class="mt" style="padding-bottom: 8px">
      <button class="btn btn--primary btn--block" :disabled="generating" @click="begin">
        <span v-if="generating" class="spinner" style="width: 16px; height: 16px" />
        {{ generating ? 'Building the world…' : 'Create world' }}
      </button>
    </div>
  </div>
</template>
