<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import AppSheet from '../components/AppSheet.vue'
import {
  BRIEFING_OPTIONS, credibilityLabel, issueBriefing, respondToStory, RESPONSE_LABELS,
  STORY_KIND_LABELS,
} from '../../engine/systems/media'
import { Rng } from '../../engine/rng'
import type { MediaResponse, MediaStory, MediaStoryKind } from '../../engine/types'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const standing = computed(() => store.game?.mediaStanding ?? null)
const stories = computed(() => (store.game?.mediaStories ?? []).slice(0, 25))
const outlets = computed(() =>
  Object.values(store.game?.outlets ?? {}).filter((o) => o.nationId === store.club?.nationId),
)

const briefOpen = ref(false)
const briefKind = ref<MediaStoryKind>('transferLink')
const briefOutlet = ref('')
const briefTruth = ref<'true' | 'exaggerated' | 'fabricated'>('true')
const briefIntensity = ref(50)
const briefTarget = ref('')

const selectedOption = computed(
  () => BRIEFING_OPTIONS.find((o) => o.kind === briefKind.value) ?? BRIEFING_OPTIONS[0],
)

/**
 * Candidate targets, filtered by what the briefing is actually for.
 *
 * Leaking interest in one of your own players, or briefing that he is
 * unsettled, is incoherent — those stories are about someone else's player.
 * Talking up form or an academy prospect is only ever about your own. Offering
 * the wrong list makes the whole mechanic read as arbitrary.
 */
const targets = computed(() => {
  const s = store.game
  if (!s) return []

  const aboutOthers = ['transferLink', 'playerUnrest'].includes(briefKind.value)
  const pool = aboutOthers
    ? [...s.shortlist, ...Object.keys(s.scoutReports)]
    : (store.club?.squad ?? [])

  return Array.from(new Set(pool))
    .map((id) => s.players[id])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p) => (aboutOthers ? p.clubId !== store.club?.id : p.clubId === store.club?.id))
    .filter((p) => (briefKind.value === 'academyHype' ? p.isAcademy || p.age <= 21 : true))
    .slice(0, 60)
})

// Changing what the briefing is about invalidates the previous target.
watch(briefKind, () => {
  briefTarget.value = targets.value[0]?.id ?? ''
})

function openBrief() {
  briefOutlet.value = outlets.value[0]?.id ?? ''
  briefTarget.value = targets.value[0]?.id ?? ''
  briefOpen.value = true
}

function submitBrief() {
  const s = store.game
  if (!s) return
  const result = issueBriefing(
    s,
    { rng: new Rng(`${s.seed}:brief:${s.date.week}:${briefKind.value}`), ids: store.idFactory() },
    {
      kind: briefKind.value,
      targetPlayerId: selectedOption.value.needsPlayer ? briefTarget.value : undefined,
      outletId: briefOutlet.value,
      truth: selectedOption.value.allowsFabrication ? briefTruth.value : 'true',
      intensity: briefIntensity.value,
    },
  )
  store.commit()
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) briefOpen.value = false
}

function respond(story: MediaStory, response: MediaResponse) {
  const s = store.game
  if (!s) return
  const message = respondToStory(
    s, story, response,
    { rng: new Rng(`${s.seed}:respond:${story.id}`), ids: store.idFactory() },
  )
  store.commit()
  notify?.(message)
}

const RESPONSES: MediaResponse[] = ['noComment', 'deny', 'confirm', 'backPlayer', 'backCoach', 'criticise', 'deflect']

function outletName(id: string) {
  return store.game?.outlets[id]?.name ?? 'The press'
}
</script>

<template>
  <div v-if="standing">

    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Credibility</span>
          <span class="bold">{{ credibilityLabel(standing.credibility) }}</span>
        </div>
        <MeterBar :value="standing.credibility" />
        <div class="row row--between mb mt">
          <span class="small muted">Goodwill</span>
          <span class="small num">{{ Math.round(standing.goodwill) }}</span>
        </div>
        <MeterBar :value="standing.goodwill" />

        <div v-if="standing.fabricationsPlanted > 0" class="row row--between small mt">
          <span class="muted">Stories you invented</span>
          <span class="num">
            {{ standing.fabricationsPlanted }}
            <span v-if="standing.fabricationsExposed" class="neg-val">
              ({{ standing.fabricationsExposed }} exposed)
            </span>
          </span>
        </div>

        <p class="tiny faint mt">
          Credibility is what makes journalists run what you tell them. Spend it on lies and your
          genuine briefings stop landing.
        </p>
      </div>
    </div>

    <button class="btn btn--primary btn--block mb" @click="openBrief">Brief a journalist</button>

    <div class="section-title">Newspapers</div>
    <div class="card">
      <div class="list">
        <div v-for="o in outlets" :key="o.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ o.name }}</div>
            <div class="list__secondary">
              Credibility {{ o.credibility }} · sensationalism {{ o.sensationalism }}
            </div>
          </div>
          <div style="width: 66px"><MeterBar :value="o.relationship" /></div>
        </div>
      </div>
    </div>

    <div class="section-title">Coverage</div>
    <div v-for="story in stories" :key="story.id" class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="chip">{{ STORY_KIND_LABELS[story.kind] }}</span>
          <span class="tiny faint">
            {{ outletName(story.outletId) }} · wk {{ story.week }}
          </span>
        </div>
        <div class="bold small">{{ story.headline }}</div>
        <p class="tiny muted" style="margin-top: 4px">{{ story.body }}</p>

        <div class="chip-row mt">
          <span v-if="story.plantedBy === store.club?.id" class="chip chip--info">You planted this</span>
          <span v-if="story.truth === 'fabricated'" class="chip chip--danger">Fabricated</span>
          <span v-else-if="story.truth === 'exaggerated'" class="chip chip--warn">Overstated</span>
        </div>

        <div v-if="story.effects.length" class="mt">
          <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em">
            What it did
          </div>
          <div v-for="(e, i) in story.effects" :key="i" class="tiny" style="margin-top: 3px">
            <span :class="e.delta >= 0 ? 'pos-val' : 'neg-val'">
              {{ e.delta >= 0 ? '+' : '' }}{{ e.delta }}
            </span>
            {{ e.description }}
          </div>
        </div>

        <div v-if="!story.plantedBy && !story.response" class="mt">
          <div class="tiny faint bold mb" style="text-transform: uppercase; letter-spacing: 0.05em">
            Respond
          </div>
          <div class="chip-row">
            <button
              v-for="r in RESPONSES"
              :key="r"
              class="btn btn--ghost btn--sm"
              @click="respond(story, r)"
            >{{ RESPONSE_LABELS[r] }}</button>
          </div>
        </div>
        <div v-else-if="story.response" class="tiny mt" style="color: var(--accent)">
          You responded: {{ RESPONSE_LABELS[story.response] }}
        </div>
      </div>
    </div>
    <div v-if="!stories.length" class="card"><div class="empty">Nothing in the papers yet.</div></div>

    <AppSheet
      v-if="briefOpen"
      title="Brief a journalist"
      subtitle="Off the record, of course"
      @close="briefOpen = false"
    >
      <div class="field">
        <label class="field__label">What do you want out there?</label>
        <select v-model="briefKind" class="select">
          <option v-for="o in BRIEFING_OPTIONS" :key="o.kind" :value="o.kind">{{ o.label }}</option>
        </select>
        <div class="field__hint">{{ selectedOption.description }}</div>
        <div class="field__hint" style="color: var(--accent)">{{ selectedOption.effect }}</div>
      </div>

      <div v-if="selectedOption.needsPlayer" class="field">
        <label class="field__label">About</label>
        <select v-model="briefTarget" class="select">
          <option v-for="p in targets" :key="p.id" :value="p.id">
            {{ p.knownAs }} ({{ store.clubById(p.clubId ?? '')?.shortName ?? 'free agent' }})
          </option>
        </select>
        <div v-if="!targets.length" class="field__hint" style="color: var(--warn)">
          Nobody to brief about. Scout some players first, or shortlist a target.
        </div>
      </div>

      <div class="field">
        <label class="field__label">Which paper</label>
        <select v-model="briefOutlet" class="select">
          <option v-for="o in outlets" :key="o.id" :value="o.id">
            {{ o.name }} — credibility {{ o.credibility }}
          </option>
        </select>
        <div class="field__hint">
          A serious paper hits harder and checks harder. A tabloid prints anything and lands softer.
        </div>
      </div>

      <div v-if="selectedOption.allowsFabrication" class="field">
        <label class="field__label">How true is it?</label>
        <div class="segmented">
          <button class="segmented__item" :class="{ 'is-active': briefTruth === 'true' }" @click="briefTruth = 'true'">True</button>
          <button class="segmented__item" :class="{ 'is-active': briefTruth === 'exaggerated' }" @click="briefTruth = 'exaggerated'">Stretched</button>
          <button class="segmented__item" :class="{ 'is-active': briefTruth === 'fabricated' }" @click="briefTruth = 'fabricated'">Invented</button>
        </div>
        <div class="field__hint" :style="briefTruth === 'fabricated' ? 'color: var(--danger)' : ''">
          {{ briefTruth === 'true'
            ? 'Lands hardest, and costs you nothing if it surfaces.'
            : briefTruth === 'exaggerated'
              ? 'Some basis in fact. Modest risk.'
              : 'No basis at all. Cheap, effective, and ruinous if a paper follows it up.' }}
        </div>
      </div>

      <div class="field">
        <label class="field__label">How hard to push — {{ briefIntensity }}</label>
        <input v-model.number="briefIntensity" class="slider" type="range" min="10" max="100" step="5" />
        <div class="field__hint">Louder means a bigger effect and a bigger trail back to you.</div>
      </div>

      <template #footer>
        <button
          class="btn btn--primary btn--block"
          :disabled="selectedOption.needsPlayer && !briefTarget"
          @click="submitBrief"
        >Make the call</button>
      </template>
    </AppSheet>
  </div>
</template>
