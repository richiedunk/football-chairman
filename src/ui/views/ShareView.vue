<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useGameStore } from '../../stores/game'
import { drawCard } from '../share/render'
import { cachedCrest, loadCrest } from '../share/crestImage'
import { canShare, copyText } from '../share/share'
import { describeTarget } from '../../engine/systems/challenge'
import type { ShareCardKind } from '../../engine/systems/shareCard'

/**
 * The share screen.
 *
 * One job: show the person exactly what other people will see, and then send
 * it. The preview is the real renderer at a smaller width rather than a CSS
 * approximation of it, so there is no way for the picture on this screen to
 * disagree with the picture in the message — which is the failure this kind of
 * screen usually ships with.
 *
 * The challenge card is the one that does something rather than says
 * something, so it gets the extra row: the link, on its own, copyable without
 * going through the share sheet at all.
 */
const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const LABELS: Record<ShareCardKind, string> = {
  season: 'The season',
  career: 'The career',
  challenge: 'Set a challenge',
}

const BLURBS: Record<ShareCardKind, string> = {
  season: 'Where you finished, and how much of what you bought he would pick.',
  career: 'Everything, on one card.',
  challenge: 'Hand this club, at this seed, to somebody else and see if they do better.',
}

const kinds = computed(() => store.shareableCards)
const kind = ref<ShareCardKind>('career')
const card = computed(() => store.buildCard(kind.value))
const link = computed(() => (card.value ? store.linkFor(card.value) : undefined))

const canvas = ref<HTMLCanvasElement | null>(null)
const sending = ref(false)

/** The preview width, capped so the card never overflows a narrow phone. */
function previewWidth(): number {
  const host = canvas.value?.parentElement
  const available = host ? host.clientWidth : 320
  return Math.max(240, Math.min(available, 420))
}

function paint(): void {
  const element = canvas.value
  const content = card.value
  if (!element || !content) return
  drawCard(element, content, {
    width: previewWidth(),
    codeLabel: content.challenge ? 'CHALLENGE' : undefined,
    crest: cachedCrest(store.club?.id),
  })
}

onMounted(() => {
  if (kinds.value.length && !kinds.value.includes(kind.value)) kind.value = kinds.value[0]
  // The card is drawn with Inter and JetBrains Mono. Both are bundled and
  // usually ready, but a first paint that lands before the face has loaded
  // renders in the fallback and looks nothing like the game — so paint once
  // now for responsiveness and again when the fonts confirm.
  paint()
  // The crest decodes asynchronously too; paint again when it lands.
  if (store.club) void loadCrest(store.club).then((image) => image && paint())
  if (typeof document !== 'undefined' && 'fonts' in document) {
    void (document as Document & { fonts: FontFaceSet }).fonts.ready.then(paint)
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', paint)
})

watch([kind, () => store.revision], paint)

async function send(): Promise<void> {
  sending.value = true
  const result = await store.share(kind.value)
  sending.value = false
  if (result.message) {
    notify?.(result.message, result.route === 'failed' ? 'error' : 'success')
  }
}

async function copyLink(): Promise<void> {
  const url = link.value
  if (!url) return
  notify?.(
    (await copyText(url)) ? 'Link copied.' : 'Could not reach the clipboard.',
    'success',
  )
}
</script>

<template>
  <div>
    <div class="segmented" role="tablist">
      <button
        v-for="k in kinds"
        :key="k"
        class="segmented__item"
        :class="{ 'is-active': kind === k }"
        role="tab"
        :aria-selected="kind === k"
        @click="kind = k"
      >
        {{ LABELS[k] }}
      </button>
    </div>

    <p class="small muted" style="margin: 10px 2px 14px">{{ BLURBS[kind] }}</p>

    <div v-if="card" class="share-stage">
      <canvas ref="canvas" class="share-canvas" :aria-label="`${card.title}, ${card.headline.value} ${card.headline.caption}`" />
    </div>

    <div v-else class="card">
      <div class="card__body">
        <p class="small muted" style="margin: 0">
          Nothing to send yet. Play a season and this fills up.
        </p>
      </div>
    </div>

    <template v-if="card?.challenge">
      <div class="section-title">The challenge</div>
      <div class="card">
        <div class="card__body">
          <div class="row row--between">
            <span class="small muted">To beat</span>
            <span class="mono">{{ describeTarget(card.challenge) }}</span>
          </div>
          <div class="row row--between mt">
            <span class="small muted">Seed</span>
            <span class="mono">{{ card.challenge.seed }}</span>
          </div>
          <p class="small muted" style="margin: 12px 0 0">
            Whoever opens it gets the same squad, the same balance and the same
            head coach you were handed. Nothing about the position is yours to
            adjust — that is the whole of the wager.
          </p>
        </div>
      </div>
    </template>

    <div class="btn-row mt">
      <button class="btn btn--primary" :disabled="!card || sending" @click="send">
        {{ sending ? 'Sending…' : canShare() ? 'Share' : 'Save image' }}
      </button>
      <button v-if="link" class="btn btn--ghost" @click="copyLink">Copy link</button>
    </div>

    <p class="small faint" style="margin: 14px 2px 0">
      The card is a picture. Nothing leaves this device until you choose where
      to send it.
    </p>
  </div>
</template>

<style scoped>
/*
 * The stage exists to centre the canvas and give it somewhere to be measured
 * from. The canvas sizes itself in the renderer — it has to, because the
 * drawing is in device pixels and CSS must not stretch it.
 */
.share-stage {
  display: flex;
  justify-content: center;
  padding: 2px 0 6px;
}

.share-canvas {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  max-width: 100%;
  display: block;
}
</style>
