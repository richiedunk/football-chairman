<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { ordinal } from '../../engine/systems/career'
import { formatMoney } from '../../engine/systems/valuation'
import { ledgerBalance, ledgerExpenditure, ledgerIncome } from '../../engine/systems/finance'
import { readCareerRecord } from '../../engine/systems/careerRecord'
import type { Player, PlayerCareerSeason } from '../../engine/types'
import ClubCrest from '../components/ClubCrest.vue'
import PersonFace from '../components/PersonFace.vue'
import StadiumScene from '../components/StadiumScene.vue'

/**
 * The season, closed.
 *
 * The week the season rolls over used to land on the career screen with a
 * one-line notice, which is a strange way to mark the one moment a football
 * season is built towards. This is the end-of-season programme: where you
 * finished and what it means for next year, the cup run, the players who
 * carried it, and what it cost.
 *
 * Everything here is read back from what the roll-over archived — the club's
 * history row, the closed ledger, each player's career record — so the screen
 * can be opened again later and says the same thing.
 */
const store = useGameStore()
const router = useRouter()

const club = computed(() => store.club)
const last = computed(() => club.value?.history.at(-1) ?? null)

/** Up, down or staying: the tier of the league finished in against now. */
const movement = computed(() => {
  const s = store.game
  const c = club.value
  const h = last.value
  if (!s || !c || !h) return null
  const was = s.leagues[h.leagueId]?.tier
  const now = s.leagues[c.leagueId]?.tier
  if (was === undefined || now === undefined || was === now) return { word: 'Staying up', tone: 'stay', to: s.leagues[c.leagueId]?.name ?? '' }
  return now < was
    ? { word: 'Promoted', tone: 'up', to: s.leagues[c.leagueId]?.name ?? '' }
    : { word: 'Relegated', tone: 'down', to: s.leagues[c.leagueId]?.name ?? '' }
})

const ledger = computed(() => club.value?.finances.lastSeason ?? null)

/**
 * Each squad player's season at this club, read out of his career record.
 *
 * Asked of the save rather than read off the player: a save moves each
 * player's archived seasons into storage of their own, and the autosave that
 * follows the roll-over has usually done so by the time this screen opens.
 * The current squad, plus anyone borrowed, is who is asked; a player sold in
 * the days since is the one who can be missing.
 */
const seasons = ref<{ player: Player; season: PlayerCareerSeason }[]>([])
watchEffect(async () => {
  const h = last.value
  const c = club.value
  if (!h || !c) return
  const ids = [...c.squad, ...c.loanedIn]
  const found = await Promise.all(
    ids.map(async (id) => {
      const player = store.player(id)
      if (!player) return null
      const records = await store.careerHistory(id)
      const record = records.map(readCareerRecord).find((r) => r.season === h.season && r.clubId === c.id)
      return record ? { player, season: record } : null
    }),
  )
  seasons.value = found.filter((x): x is { player: Player; season: PlayerCareerSeason } => x !== null)
})

const awards = computed(() => {
  const list = seasons.value
  if (!list.length) return []
  const best = (score: (x: (typeof list)[number]) => number, min = 1) =>
    list.filter((x) => score(x) >= min).sort((a, b) => score(b) - score(a))[0] ?? null
  const scorer = best((x) => x.season.goals)
  const creator = best((x) => x.season.assists)
  const rated = best((x) => (x.season.appearances >= 10 ? x.season.ratingSum / x.season.appearances : 0), 0.1)
  const ever = best((x) => x.season.appearances)
  return [
    scorer && { label: 'Top scorer', who: scorer.player, figure: `${scorer.season.goals}`, unit: 'goals' },
    creator && { label: 'Most assists', who: creator.player, figure: `${creator.season.assists}`, unit: 'assists' },
    rated && { label: 'Player of the season', who: rated.player, figure: (rated.season.ratingSum / rated.season.appearances).toFixed(2), unit: 'avg rating' },
    ever && { label: 'Ever-present', who: ever.player, figure: `${ever.season.appearances}`, unit: 'apps' },
  ].filter(Boolean) as { label: string; who: Player; figure: string; unit: string }[]
})
</script>

<template>
  <div v-if="club && last" class="season">
    <div class="season__scene"><StadiumScene /></div>

    <section class="season__hero">
      <div class="season__label">Season {{ last.season }}/{{ String((last.season + 1) % 100).padStart(2, '0') }} · Final</div>
      <ClubCrest :club="club" :size="96" />
      <div class="season__finish">
        {{ last.position }}<span>{{ ordinal(last.position) }}</span>
      </div>
      <div class="season__league">{{ last.leagueName }}</div>
      <div v-if="movement" class="season__move" :class="`season__move--${movement.tone}`">
        {{ movement.word }}<template v-if="movement.tone !== 'stay'"> · {{ movement.to }}</template>
      </div>
    </section>

    <section class="card">
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Points</div>
          <div class="stat__value">{{ last.points }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Goals</div>
          <div class="stat__value">{{ last.goalsFor }}<span class="faint">–{{ last.goalsAgainst }}</span></div>
        </div>
        <div class="stat">
          <div class="stat__label">Cup</div>
          <div class="stat__value stat__value--sm">{{ last.cupResult || '—' }}</div>
        </div>
      </div>
    </section>

    <template v-if="awards.length">
      <div class="section-title">The players who carried it</div>
      <div class="season__awards">
        <button v-for="a in awards" :key="a.label" class="card season__award" @click="router.push(`/player/${a.who.id}`)">
          <span class="season__award-label">{{ a.label }}</span>
          <PersonFace :person="a.who" :club="club" :size="58" />
          <span class="season__award-name">{{ a.who.knownAs }}</span>
          <span class="season__award-figure">{{ a.figure }} <small>{{ a.unit }}</small></span>
        </button>
      </div>
    </template>

    <template v-if="ledger">
      <div class="section-title">The books</div>
      <section class="card">
        <div class="card__body">
          <div class="row row--between small"><span class="muted">Income</span><span class="num pos-val">{{ formatMoney(ledgerIncome(ledger), store.currency) }}</span></div>
          <div class="row row--between small"><span class="muted">Spending</span><span class="num neg-val">{{ formatMoney(ledgerExpenditure(ledger), store.currency) }}</span></div>
          <div class="divider" />
          <div class="row row--between">
            <span class="bold">Result</span>
            <span class="bold num" :class="ledgerBalance(ledger) >= 0 ? 'pos-val' : 'neg-val'">{{ formatMoney(ledgerBalance(ledger), store.currency) }}</span>
          </div>
        </div>
      </section>
    </template>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button class="btn btn--ghost" @click="router.push('/career')">Your career</button>
      <button class="btn btn--primary" @click="router.replace('/phone')">On to next season</button>
    </div>
  </div>
  <div v-else class="empty">No season has finished yet.</div>
</template>

<style scoped>
.season { position: relative; }
.season__scene {
  position: absolute;
  top: calc(var(--pad) * -1);
  left: calc(var(--pad) * -1);
  right: calc(var(--pad) * -1);
  aspect-ratio: 400 / 240;
  max-height: 340px;
  overflow: hidden;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, #000 60%, transparent);
  mask-image: linear-gradient(180deg, #000 60%, transparent);
}
.season__scene :deep(svg) { width: 100%; height: 100%; display: block; }
.season__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 0 18px;
  text-align: center;
}
.season__label {
  padding: 4px 14px;
  border-radius: 4px;
  background: linear-gradient(180deg, #4be08a, #23a85a);
  color: #06140b;
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.season__finish {
  font-family: var(--font-display);
  font-size: 4.2rem;
  font-weight: 900;
  line-height: 0.9;
  letter-spacing: -0.05em;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
  margin-top: 8px;
}
.season__finish span { font-size: 1.4rem; font-weight: 700; color: var(--text-dim); letter-spacing: 0; }
.season__league {
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.season__move {
  margin-top: 6px;
  padding: 5px 14px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.season__move--up { background: var(--accent); color: var(--accent-ink); }
.season__move--down { background: var(--danger); color: #fff; }
.season__move--stay { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.season__awards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
@media (min-width: 900px) { .season__awards { grid-template-columns: repeat(4, 1fr); } }
.season__award {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 12px 8px;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: center;
}
.season__award-label {
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--gold);
}
.season__award-name {
  max-width: 100%;
  font-family: var(--font-display);
  font-size: 0.86rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.season__award-figure { font-family: var(--font-display); font-size: 1.1rem; font-weight: 900; }
.season__award-figure small { font-size: 0.6rem; font-weight: 700; color: var(--text-faint); text-transform: uppercase; }
</style>
