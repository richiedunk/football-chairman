<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { acceptJobOffer } from '../../engine/season'
import { formatWage } from '../../engine/systems/valuation'
import { ordinal } from '../../engine/systems/career'
import { headerBand } from '../colour'
import Chevron from '../components/Chevron.vue'

/**
 * Out of work.
 *
 * Not the start screen with a different heading. A new director sees the whole
 * bottom of the pyramid because nobody has an opinion about him; a sacked one
 * sees whatever happens to be vacant, which is not much — and it changes month
 * by month whether or not he does anything, which is what a job search is.
 */
const store = useGameStore()
const router = useRouter()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const director = computed(() => store.game?.director ?? null)
const waiting = ref(false)

const openCount = computed(() => store.vacancies.filter((o) => !o.barred).length)

const posts = computed(() =>
  store.vacancies.map((offer) => {
    const club = store.clubById(offer.clubId)
    return {
      offer,
      colour: club ? headerBand(club.colors.primary, club.colors.secondary).strip : '#3a3d45',
    }
  }),
)

async function waitAMonth() {
  waiting.value = true
  try {
    const change = await store.checkBackNextMonth()
    const parts: string[] = []
    if (change.filled.length) parts.push(`${change.filled.join(', ')} filled the post`)
    if (change.opened.length) parts.push(`${change.opened.join(', ')} are looking`)
    notify?.(parts.length ? parts.join('. ') + '.' : 'Nothing moved. Another month gone.')
  } finally {
    waiting.value = false
  }
}

function take(offerId: string) {
  const s = store.game
  if (!s) return
  const result = acceptJobOffer(s, offerId)
  store.commit()
  if (!result.ok) {
    notify?.(result.message, 'error')
    return
  }
  router.push('/welcome')
}
</script>

<template>
  <div v-if="director">
    <div class="search-head">
      <div class="search-head__label">Out of work</div>
      <h1 class="search-head__name">{{ director.name }}</h1>
      <p class="search-head__note">
        {{ openCount
          ? `${openCount} club${openCount === 1 ? ' is' : 's are'} looking for a director of football.`
          : 'Nothing you can apply for. Give it a month.' }}
      </p>
    </div>

    <div class="list">
      <component
        :is="p.offer.barred ? 'div' : 'button'"
        v-for="p in posts"
        :key="p.offer.id"
        class="list__row"
        :class="{ 'search-post--barred': p.offer.barred }"
        @click="p.offer.barred ? undefined : take(p.offer.id)"
      >
        <span class="search-post__colour" :style="{ background: p.colour }" />
        <div class="list__main">
          <div class="list__primary">
            {{ p.offer.clubName }}
            <span v-if="p.offer.barred" class="search-post__flag">NOT OPEN TO YOU</span>
          </div>
          <div class="list__secondary num">
            {{ p.offer.leagueName.toUpperCase() }} ·
            {{ formatWage(p.offer.wageOffer, store.currency) }}/WK ·
            {{ p.offer.expectation.leaguePosition }}{{ ordinal(p.offer.expectation.leaguePosition).toUpperCase() }} EXPECTED
          </div>
          <div class="search-post__pitch">{{ p.offer.pitch }}</div>
          <div v-if="p.offer.barredReason" class="search-post__barred">
            {{ p.offer.barredReason }}
          </div>
        </div>
        <Chevron v-if="!p.offer.barred" />
      </component>
      <div v-if="!posts.length" class="empty">
        Nothing on the board. It happens.
      </div>
    </div>

    <div class="search-foot">
      <button class="advance" :disabled="waiting || store.busy" @click="waitAMonth">
        <span class="advance__label">Check back next month</span>
        <span class="advance__sub">FOUR WEEKS PASS · THE BOARD CHANGES</span>
      </button>
      <p class="tiny faint center mt">
        You are {{ director.age }}. The clock does not stop while you look.
      </p>
    </div>
  </div>
</template>

<style scoped>
.search-head { padding: 22px 0 16px; }
.search-head__label {
  font-family: var(--font-num);
  font-size: 0.62rem;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--warn);
}
.search-head__name {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  margin-top: 6px;
}
.search-head__note { font-size: 0.88rem; color: var(--text-dim); margin-top: 8px; }
.search-post__colour {
  flex: 0 0 auto;
  width: 3px;
  align-self: stretch;
  min-height: 34px;
  border-radius: 2px;
}
.search-post__pitch {
  font-size: 0.78rem;
  color: var(--text-dim);
  margin-top: 4px;
  white-space: normal;
}
/* Dimmed, but not so far that it reads as a rendering fault — it is a real
   listing that happens to be shut to you, and it has to stay legible to land. */
.search-post--barred { opacity: 0.72; cursor: default; }
.search-post__flag {
  font-family: var(--font-num);
  font-size: 0.55rem;
  letter-spacing: 0.13em;
  color: var(--danger);
  margin-left: 8px;
  vertical-align: 1px;
}
.search-post__barred {
  font-size: 0.76rem;
  color: var(--danger);
  margin-top: 5px;
  white-space: normal;
}
.search-foot { padding: 20px 0 8px; }
</style>
