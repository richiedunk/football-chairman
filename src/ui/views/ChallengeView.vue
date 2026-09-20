<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { useSetupStore } from '../../stores/setup'
import { BACKGROUNDS } from '../../engine/newGame'
import { readClipboard } from '../share/share'
import {
  challengeFromUrl, describeTarget, isSameEngine, resolveClub, type Challenge,
} from '../../engine/systems/challenge'

/**
 * Taking on somebody else's challenge.
 *
 * Two jobs, and the order matters. First, show what is being accepted — the
 * club, the division, the mark to beat and who set it — because a code is
 * opaque and nobody should commit a career to a string they cannot read.
 * Second, generate that exact world and drop them into it.
 *
 * The club is not a choice here. That is the point of the thing: the whole
 * wager is that both people were handed the same problem, and a screen that
 * let the recipient pick a better club would quietly make it meaningless. The
 * background is fixed for the same reason — a financier starts with a bigger
 * transfer budget, so it is part of the position rather than a preference.
 */
const route = useRoute()
const router = useRouter()
const store = useGameStore()
const setup = useSetupStore()

const code = ref('')
const challenge = ref<Challenge | null>(null)
const name = ref('')
const error = ref('')
const working = ref(false)

/**
 * What the challenge will actually hand over.
 *
 * Generating the whole world to show a preview would cost a second or two on
 * a phone for a screen the reader may bounce off, so this shows what the code
 * itself carries and the world is built only once they have said yes.
 */
const summary = computed(() => {
  const c = challenge.value
  if (!c) return null
  return {
    club: c.clubName,
    target: describeTarget(c),
    by: c.by || 'Somebody',
    season: c.season,
    seed: c.seed,
    background: BACKGROUNDS.find((b) => b.id === c.background)?.label ?? c.background,
    stale: !isSameEngine(c),
  }
})

onMounted(async () => {
  const fromLink = route.query.challenge
  if (typeof fromLink === 'string' && fromLink) {
    code.value = fromLink
    read()
    return
  }
  // A code that was copied rather than tapped is the common case on a phone,
  // where a link in a group chat often arrives as text. Offered, never
  // imposed: the field stays, and a refused clipboard permission is silent.
  const pasted = await readClipboard()
  if (pasted && challengeFromUrl(pasted)) {
    code.value = pasted.trim()
    read()
  }
})

function read(): void {
  error.value = ''
  const parsed = challengeFromUrl(code.value)
  if (!parsed) {
    challenge.value = null
    error.value = code.value.trim()
      ? 'That is not a challenge code.'
      : 'Paste a challenge link or code.'
    return
  }
  challenge.value = parsed
}

async function accept(): Promise<void> {
  const c = challenge.value
  if (!c) return
  if (!name.value.trim()) {
    error.value = 'Enter your name.'
    return
  }

  working.value = true
  error.value = ''
  try {
    // Let the button's loading state paint: generating a world blocks the
    // thread for a second or more.
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    const generated = setup.generate({
      seed: c.seed,
      directorName: name.value.trim(),
      background: c.background,
      worldSize: c.size,
      homeNationId: c.nationId,
      startingSeason: c.season,
    })

    const club = resolveClub(generated.state, c)
    if (!club) {
      error.value = 'That club is not in the world this code generates.'
      return
    }

    const { state, setup: factories } = setup.commit(club.id)
    // Stamped before the state is attached, so the first autosave already
    // carries it and a reload does not forget what the career is for.
    state.challenge = c
    store.attachWithFactories(state, factories.ids, factories.names)
    setup.clear()
    void store.autosave()
    router.push('/welcome')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not open that challenge.'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="mb">A challenge</h1>

    <div class="card">
      <div class="card__body">
        <div class="field">
          <label class="field__label" for="challenge-code">Link or code</label>
          <input
            id="challenge-code"
            v-model="code"
            class="input"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Paste it here"
            @input="read"
          >
        </div>
      </div>
    </div>

    <template v-if="summary">
      <div class="section-title">What you are taking on</div>
      <div class="card">
        <div class="card__body">
          <div class="row row--between">
            <span class="small muted">Club</span><span class="mono">{{ summary.club }}</span>
          </div>
          <div class="row row--between mt">
            <span class="small muted">To beat</span><span class="mono">{{ summary.target }}</span>
          </div>
          <div class="row row--between mt">
            <span class="small muted">Set by</span><span class="mono">{{ summary.by }}</span>
          </div>
          <div class="row row--between mt">
            <span class="small muted">You start as</span><span class="mono">{{ summary.background }}</span>
          </div>
          <div class="row row--between mt">
            <span class="small muted">Seed</span><span class="mono">{{ summary.seed }}</span>
          </div>

          <p class="small muted" style="margin: 14px 0 0">
            You do not pick the club and you do not pick your background. Both
            are part of the position, and the wager is that you were handed the
            same one.
          </p>
        </div>
      </div>

      <!-- Said plainly rather than hidden, because the alternative is handing
           somebody a subtly different squad and letting them believe it is the
           same one. -->
      <div v-if="summary.stale" class="card mt" style="background: var(--warn-wash)">
        <div class="card__body">
          <p class="small" style="margin: 0; color: var(--warn)">
            This was set on a different version of the game. The world it
            generates here may not match the one it was set in, so treat the
            comparison as rough.
          </p>
        </div>
      </div>

      <div class="card mt">
        <div class="card__body">
          <div class="field">
            <label class="field__label" for="challenge-name">Your name</label>
            <input id="challenge-name" v-model="name" class="input" placeholder="Your name">
          </div>
        </div>
      </div>
    </template>

    <p v-if="error" class="small" style="color: var(--danger); margin: 12px 2px">{{ error }}</p>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button
        class="btn btn--primary"
        :disabled="!challenge || working"
        @click="accept"
      >
        {{ working ? 'Building the world…' : 'Take the job' }}
      </button>
      <button class="btn btn--ghost" @click="router.push('/')">Back</button>
    </div>
  </div>
</template>
