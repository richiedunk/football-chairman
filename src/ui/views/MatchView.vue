<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import ClubCrest from '../components/ClubCrest.vue'
import PitchLineup from '../components/PitchLineup.vue'
import MatchTimeline from '../components/MatchTimeline.vue'
import { matchInPlay } from '../liveMatch'
import { manOfTheMatch, matchVerdict } from '../../engine/systems/matchReport'
import type { MatchEvent, MatchResult } from '../../engine/types'

/**
 * The match report.
 *
 * One screen, landed on the moment a match is played. Everything here was
 * already being simulated every week and discarded: ratings, the events, the
 * shot counts. What is added is the judgement — whether the result was any
 * good, given who it was against — because a scoreline alone makes a director
 * work that out for himself every single week.
 *
 * Deliberately readable from the Recent list afterwards too. A result you
 * tapped past at one in the morning should not be gone for good.
 */
const store = useGameStore()
const route = useRoute()
const router = useRouter()

const report = computed(() => {
  const s = store.game
  const club = store.club
  const fixture = store.fixtureById(String(route.params.id ?? ''))
  if (!s || !club || !fixture?.result) return null

  const result = fixture.result
  const isHome = fixture.homeClubId === club.id
  const opponent = store.clubById(isHome ? fixture.awayClubId : fixture.homeClubId)
  if (!opponent) return null

  const verdict = matchVerdict(club, opponent, fixture, result, store.headCoach)
  const motm = manOfTheMatch(club, fixture, result)

  const competition =
    fixture.competitionType === 'league'
      ? store.leagueById(fixture.competitionId)?.name ?? 'League'
      : s.cups[fixture.competitionId]?.name ?? 'Cup'
  const round =
    fixture.competitionType === 'league'
      ? null
      : s.cups[fixture.competitionId]?.rounds.find((r) => r.round === fixture.round)?.name ?? null

  // Only the events worth a line. A full log of every save and blocked shot is
  // a debugging tool, not a report.
  const notable: MatchEvent[] = result.events
    .filter((e) =>
      ['goal', 'ownGoal', 'penaltyScored', 'penaltyMissed', 'redCard', 'injury'].includes(e.type),
    )
    .sort((a, b) => a.minute - b.minute)

  const rated = (ids: string[]) => ids
    .map((id) => ({ player: store.player(id), rating: result.ratings[id] }))
    .filter((row): row is { player: NonNullable<typeof row.player>; rating: number } =>
      Boolean(row.player) && row.rating !== undefined)
    .sort((a, b) => b.rating - a.rating)
  const lineup = rated(isHome ? result.homeLineup : result.awayLineup)
  const theirLineup = rated(isHome ? result.awayLineup : result.homeLineup)

  return {
    fixture,
    result,
    club,
    opponent,
    isHome,
    verdict,
    motm,
    competition: round ?? competition,
    notable,
    lineup,
    theirLineup,
    ourGoals: isHome ? result.homeGoals : result.awayGoals,
    theirGoals: isHome ? result.awayGoals : result.homeGoals,
    // The trimmings only exist on a match the player can open, which is every
    // match that reaches this screen. The fallbacks are for a save written
    // before the trim, where a reopened old fixture may have lost them.
    ourShots: isHome ? (result.shots?.home ?? 0) : (result.shots?.away ?? 0),
    theirShots: isHome ? (result.shots?.away ?? 0) : (result.shots?.home ?? 0),
    ourOnTarget: isHome ? (result.shotsOnTarget?.home ?? 0) : (result.shotsOnTarget?.away ?? 0),
    ourPossession: isHome ? (result.possession ?? 50) : 100 - (result.possession ?? 50),
    // The scoreboard is written home side first, as every scoreboard is,
    // whichever side the director works for.
    home: isHome ? club : opponent,
    away: isHome ? opponent : club,
    stats: comparison(result, fixture.homeClubId, fixture.awayClubId),
  }
})

/**
 * Home against away, one row per number: the post-match graphic. Each row
 * carries both figures and the home share, for the split bar.
 */
function comparison(result: MatchResult, homeId: string, awayId: string) {
  const count = (type: MatchEvent['type'], clubId: string) =>
    result.events.filter((e) => e.type === type && e.clubId === clubId).length
  const rows: { label: string; home: number; away: number; unit?: string }[] = []
  if (result.possession !== undefined) {
    rows.push({ label: 'Possession', home: Math.round(result.possession), away: 100 - Math.round(result.possession), unit: '%' })
  }
  if (result.shots) rows.push({ label: 'Shots', home: result.shots.home, away: result.shots.away })
  if (result.shotsOnTarget) {
    rows.push({ label: 'On target', home: result.shotsOnTarget.home, away: result.shotsOnTarget.away })
  }
  rows.push({ label: 'Yellow cards', home: count('yellowCard', homeId), away: count('yellowCard', awayId) })
  rows.push({ label: 'Red cards', home: count('redCard', homeId), away: count('redCard', awayId) })
  return rows.map((r) => ({ ...r, share: r.home + r.away === 0 ? 50 : (r.home / (r.home + r.away)) * 100 }))
}

/**
 * The match, live.
 *
 * The engine plays a match in one go and records every event with its minute,
 * so a result can be replayed rather than merely announced. A match you have
 * just been handed ticks through its ninety minutes in about twelve seconds:
 * the clock runs, goals land on the scoreboard in the minute they were scored,
 * and a commentary feed fills beneath it. Then the full report.
 *
 * Only for a match fresh off the week (the advance queue). One reopened from
 * the results list is history, and goes straight to the report. Skippable at
 * any point, and never shown under reduced motion, where it would be a twelve
 * second wait with nothing moving.
 */
const MINUTE_MS = 130
const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const live = ref(false)
watch(live, (on) => { matchInPlay.value = on }, { immediate: true })
const clock = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function stopLive() {
  if (timer) clearInterval(timer)
  timer = null
  live.value = false
}

watch(
  () => String(route.params.id ?? ''),
  (id) => {
    stopLive()
    if (!id || reducedMotion || !store.matchQueue.includes(id)) return
    live.value = true
    clock.value = 0
    timer = setInterval(() => {
      clock.value += 1
      if (clock.value >= fullTime.value) stopLive()
    }, MINUTE_MS)
  },
  { immediate: true },
)
onUnmounted(() => {
  stopLive()
  matchInPlay.value = false
})

/** Ninety, or later if something happened in stoppage time. */
const fullTime = computed(() =>
  Math.max(90, ...(report.value?.result.events.map((e) => e.minute) ?? [90])))

/** The score at the current minute, from the goals scored so far. */
const liveScore = computed(() => {
  const r = report.value
  if (!r) return { home: 0, away: 0 }
  let home = 0
  let away = 0
  for (const e of r.result.events) {
    if (e.minute > clock.value) continue
    const scoring = e.type === 'goal' || e.type === 'penaltyScored'
    const own = e.type === 'ownGoal'
    if (!scoring && !own) continue
    const forHome = own ? e.clubId !== r.fixture.homeClubId : e.clubId === r.fixture.homeClubId
    if (forHome) home++
    else away++
  }
  return { home, away }
})

/** Everything that has happened so far, newest first, with the breaks marked. */
const commentary = computed(() => {
  const r = report.value
  if (!r) return []
  const lines: { key: string; minute: number; text: string; kind: string; home: boolean }[] = [
    { key: 'ko', minute: 0, text: 'Kick-off.', kind: 'break', home: true },
  ]
  if (clock.value >= 45) lines.push({ key: 'ht', minute: 45, text: 'Half-time.', kind: 'break', home: true })
  r.result.events
    .filter((e) => e.minute <= clock.value && e.text)
    .forEach((e, i) => lines.push({
      key: `${i}-${e.minute}-${e.type}`,
      minute: e.minute,
      text: e.text,
      kind: e.type,
      home: e.clubId === r.fixture.homeClubId,
    }))
  return lines.sort((a, b) => b.minute - a.minute || (a.kind === 'break' ? 1 : -1))
})

/** Which side the pitch is showing. Yours first: it is your team he picked. */
const side = ref<'ours' | 'theirs'>('ours')

const VERDICT_TONE: Record<string, string> = {
  outstanding: 'var(--accent)',
  good: 'var(--accent)',
  par: 'var(--text-dim)',
  poor: 'var(--warn)',
  dismal: 'var(--danger)',
}

const EVENT_LABEL: Record<string, string> = {
  goal: 'GOAL',
  ownGoal: 'OWN GOAL',
  penaltyScored: 'PEN',
  penaltyMissed: 'PEN MISSED',
  redCard: 'RED',
  injury: 'INJURY',
}
</script>

<template>
  <div v-if="report" class="match">
    <div class="match__story">
    <!-- The scoreboard: two crests, two name plates and the score between
         them, home side first. -->
    <section class="card scoreboard">
      <div class="scoreboard__banner">
        {{ report.competition }} · Week {{ report.fixture.week }}
      </div>
      <div class="scoreboard__line">
        <span class="scoreboard__team">
          <ClubCrest :club="report.home" :size="48" />
          <span class="scoreboard__name">{{ report.home.shortName || report.home.name }}</span>
        </span>
        <span class="scoreboard__score" :class="{ 'is-live': live }">
          <span :key="`h${live ? liveScore.home : 'ft'}`" class="scoreboard__goals">{{ live ? liveScore.home : report.result.homeGoals }}</span>
          <span class="scoreboard__ft">{{ live ? `${clock}'` : 'FT' }}</span>
          <span :key="`a${live ? liveScore.away : 'ft'}`" class="scoreboard__goals">{{ live ? liveScore.away : report.result.awayGoals }}</span>
        </span>
        <span class="scoreboard__team scoreboard__team--away">
          <ClubCrest :club="report.away" :size="48" />
          <span class="scoreboard__name">{{ report.away.shortName || report.away.name }}</span>
        </span>
      </div>
      <template v-if="live">
        <div class="live-clock" aria-hidden="true">
          <span class="live-clock__fill" :style="{ width: `${(clock / fullTime) * 100}%` }" />
          <span class="live-clock__ht" />
        </div>
        <button class="btn btn--ghost btn--sm live-skip" @click="stopLive">Skip to full time</button>
      </template>
      <template v-else>
        <div v-if="report.result.penalties" class="scoreboard__pens">
          {{ report.result.penalties.home }}–{{ report.result.penalties.away }} on penalties
        </div>
        <MatchTimeline :events="report.result.events" :home-id="report.fixture.homeClubId" />
        <div class="scoreboard__verdict" :style="{ color: VERDICT_TONE[report.verdict.verdict] }">
          {{ report.verdict.headline }}
        </div>
      </template>
      <div v-if="report.result.attendance" class="scoreboard__crowd">
        {{ report.result.attendance.toLocaleString() }} in attendance
      </div>
    </section>

    <!-- The commentary, while the match is being played out. -->
    <section v-if="live" class="card live-feed" aria-live="polite">
      <div
        v-for="line in commentary"
        :key="line.key"
        class="live-feed__line"
        :class="[`is-${line.kind}`, line.home ? 'is-home' : 'is-away']"
      >
        <span class="live-feed__minute">{{ line.kind === 'break' ? '' : `${line.minute}'` }}</span>
        <span class="live-feed__text">{{ line.text }}</span>
      </div>
    </section>

    <template v-if="!live">
    <!-- Match facts, home on the left, with a split bar per row. -->
    <section class="card">
      <div class="card__head"><span class="card__title">Match facts</span></div>
      <div class="facts">
        <div v-for="row in report.stats" :key="row.label" class="facts__row">
          <span class="facts__value">{{ row.home }}{{ row.unit ?? '' }}</span>
          <span class="facts__mid">
            <span class="facts__label">{{ row.label }}</span>
            <!-- Nothing either side is nobody's share: an empty track, not a
                 half-blue one. -->
            <span class="facts__bar" :class="{ 'is-empty': row.home + row.away === 0 }">
              <span v-if="row.home + row.away > 0" class="facts__home" :style="{ width: `${row.share}%` }" />
            </span>
          </span>
          <span class="facts__value facts__value--away">{{ row.away }}{{ row.unit ?? '' }}</span>
        </div>
      </div>
    </section>

    <!-- What actually happened. -->
    <section v-if="report.notable.length" class="card">
      <div class="card__head"><span class="card__title">How it went</span></div>
      <div
        v-for="(event, i) in report.notable"
        :key="i"
        class="report-event"
        :class="{ 'report-event--away': event.clubId === report.away.id }"
      >
        <span class="report-event__minute">{{ event.minute }}'</span>
        <span class="report-event__icon" :class="`report-event__icon--${event.type}`" aria-hidden="true" />
        <span class="grow report-event__text">{{ event.text }}</span>
        <span class="report-event__type">{{ EVENT_LABEL[event.type] ?? event.type.toUpperCase() }}</span>
      </div>
    </section>

    <!-- The coach's read. The one football opinion in the game that is his. -->
    <section v-if="report.verdict.coachLine" class="card report-quote">
      <span class="report-quote__who">{{ store.headCoach?.knownAs ?? 'The head coach' }}</span>
      “{{ report.verdict.coachLine }}”
    </section>

    </template>
    </div>
    <div v-if="!live" class="match__sides">
    <!-- The side he picked, on the pitch, rated. -->
    <section v-if="report.lineup.length" class="card">
      <div class="card__head">
        <span class="card__title">Line-ups</span>
        <span v-if="report.motm && side === 'ours'" class="card__title" style="color: var(--accent)">
          Best · {{ store.player(report.motm.playerId)?.knownAs }}
        </span>
      </div>
      <div class="card__body">
        <div class="segmented mb">
          <button class="segmented__item" :class="{ 'is-active': side === 'ours' }" @click="side = 'ours'">
            {{ report.club.shortName || report.club.name }}
          </button>
          <button
            v-if="report.theirLineup.length"
            class="segmented__item"
            :class="{ 'is-active': side === 'theirs' }"
            @click="side = 'theirs'"
          >
            {{ report.opponent.shortName || report.opponent.name }}
          </button>
        </div>
        <PitchLineup
          v-if="side === 'ours'"
          :club="report.club"
          :players="report.lineup"
          :highlight="report.motm?.playerId ?? null"
          @pick="(id) => router.push(`/player/${id}`)"
        />
        <PitchLineup
          v-else
          :club="report.opponent"
          :players="report.theirLineup"
          @pick="(id) => router.push(`/player/${id}`)"
        />
      </div>
    </section>
    </div>
  </div>

  <div v-else class="empty">That match has not been played.</div>
</template>

<style scoped>
/* On a wide screen the story reads down the left and the line-ups stand on
   the right, so the pitch is not a 1,100px-wide field at the foot of a
   scroll. */
@media (min-width: 1100px) {
  .match {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(360px, 1fr);
    gap: 14px;
    align-items: start;
  }
  .match__sides { position: sticky; top: 0; }
}
.scoreboard {
  text-align: center;
  background:
    radial-gradient(ellipse 90% 80% at 50% 0%, rgba(63, 214, 122, 0.16), transparent 70%),
    var(--panel);
}
.scoreboard__banner {
  display: inline-block;
  margin-top: 12px;
  padding: 4px 18px;
  border-radius: 4px;
  background: linear-gradient(180deg, #4be08a, #23a85a);
  color: #06140b;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%);
}
.scoreboard__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 16px 10px 8px;
}
.scoreboard__team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.scoreboard__name {
  max-width: 100%;
  padding: 4px 10px;
  background: linear-gradient(180deg, #2a313b, #151a21);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-family: var(--font-display);
  font-size: 0.86rem;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scoreboard__score {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 8px;
  background: linear-gradient(180deg, #f5f7f9, #cfd6de);
  color: #0b0e12;
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
/* The score lands a beat after the panel: the one moment in the week worth
   a flourish. */
@keyframes score-in {
  0% { opacity: 0; transform: scale(0.6); }
  70% { opacity: 1; transform: scale(1.06); }
  100% { transform: scale(1); }
}
.scoreboard__score { animation: score-in 0.45s 0.15s cubic-bezier(0.3, 0.8, 0.3, 1.2) both; }
.scoreboard__score.is-live { animation: none; }
/* A goal: the number that changed pops. Keyed on the score, so it replays. */
@keyframes goal-pop {
  0% { transform: scale(1.6); color: var(--win); }
  100% { transform: scale(1); }
}
.scoreboard__score.is-live .scoreboard__goals { display: inline-block; animation: goal-pop 0.5s ease-out; }
.live-clock {
  position: relative;
  height: 4px;
  margin: 8px var(--pad) 10px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}
.live-clock__fill { display: block; height: 100%; background: var(--win); transition: width 0.13s linear; }
.live-clock__ht { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.5); }
.live-skip { margin: 0 auto 14px; }
.live-feed { padding: 6px 0; max-height: 52vh; overflow-y: auto; }
.live-feed__line {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 8px;
  padding: 7px var(--pad);
  border-bottom: 1px solid var(--hairline);
  font-size: 0.86rem;
  animation: settle 0.3s ease-out both;
}
.live-feed__line:last-child { border-bottom: 0; }
.live-feed__minute { font-family: var(--font-display); font-weight: 800; color: var(--text-dim); }
.live-feed__line.is-away .live-feed__text { color: var(--text-dim); }
.live-feed__line.is-break { font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.7rem; color: var(--text-faint); }
.live-feed__line.is-goal, .live-feed__line.is-penaltyScored, .live-feed__line.is-ownGoal {
  background: linear-gradient(90deg, rgba(63, 214, 122, 0.18), transparent);
  font-weight: 700;
}
.live-feed__line.is-goal .live-feed__text::before,
.live-feed__line.is-penaltyScored .live-feed__text::before { content: 'GOAL · '; color: var(--win); font-family: var(--font-display); font-weight: 900; }
.live-feed__line.is-redCard { background: linear-gradient(90deg, rgba(255, 90, 82, 0.18), transparent); }
.scoreboard__ft {
  padding: 3px 6px;
  border-radius: 4px;
  background: #0b0e12;
  color: var(--win);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.scoreboard__pens,
.scoreboard__crowd {
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.scoreboard__verdict {
  padding: 4px var(--pad) 6px;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.3;
}
.scoreboard__crowd { padding-bottom: 14px; }

.facts { padding: 6px var(--pad) 10px; }
.facts__row {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.facts__value {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
}
.facts__value--away { text-align: right; }
.facts__mid { display: flex; flex-direction: column; gap: 4px; }
.facts__label {
  text-align: center;
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}
.facts__bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
  overflow: hidden;
}
.facts__bar.is-empty { background: rgba(255, 255, 255, 0.12); }
.facts__home { display: block; height: 100%; background: var(--sel); }

.report-event {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px var(--pad);
  border-top: 1px solid var(--hairline);
}
.card__head + .report-event { border-top: 0; }
.report-event__minute {
  flex: 0 0 auto;
  width: 30px;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-dim);
}
.report-event__icon {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-faint);
}
.report-event__icon--goal,
.report-event__icon--penaltyScored { background: #fff; box-shadow: inset 0 0 0 3px var(--win); }
.report-event__icon--ownGoal { background: #fff; box-shadow: inset 0 0 0 3px var(--danger); }
.report-event__icon--redCard { width: 9px; border-radius: 2px; background: var(--danger); }
.report-event__icon--injury { background: var(--warn); }
.report-event__icon--penaltyMissed { background: transparent; box-shadow: inset 0 0 0 2px var(--danger); }
.report-event__text { font-size: 0.86rem; line-height: 1.35; }
.report-event--away .report-event__text { color: var(--text-dim); }
.report-event__type {
  flex: 0 0 auto;
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.report-quote {
  padding: 14px var(--pad);
  font-size: 1rem;
  font-style: italic;
  line-height: 1.45;
}
.report-quote__who {
  display: block;
  margin-bottom: 5px;
  font-family: var(--font-display);
  font-style: normal;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}
</style>
