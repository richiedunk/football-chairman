<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import ClubCrest from '../components/ClubCrest.vue'
import PitchLineup from '../components/PitchLineup.vue'
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

  const lineup = (isHome ? result.homeLineup : result.awayLineup)
    .map((id) => ({ player: store.player(id), rating: result.ratings[id] }))
    .filter((row): row is { player: NonNullable<typeof row.player>; rating: number } =>
      Boolean(row.player) && row.rating !== undefined)
    .sort((a, b) => b.rating - a.rating)

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
        <span class="scoreboard__score">
          <span>{{ report.result.homeGoals }}</span>
          <span class="scoreboard__ft">FT</span>
          <span>{{ report.result.awayGoals }}</span>
        </span>
        <span class="scoreboard__team scoreboard__team--away">
          <ClubCrest :club="report.away" :size="48" />
          <span class="scoreboard__name">{{ report.away.shortName || report.away.name }}</span>
        </span>
      </div>
      <div v-if="report.result.penalties" class="scoreboard__pens">
        {{ report.result.penalties.home }}–{{ report.result.penalties.away }} on penalties
      </div>
      <div class="scoreboard__verdict" :style="{ color: VERDICT_TONE[report.verdict.verdict] }">
        {{ report.verdict.headline }}
      </div>
      <div v-if="report.result.attendance" class="scoreboard__crowd">
        {{ report.result.attendance.toLocaleString() }} in attendance
      </div>
    </section>

    <!-- Match facts, home on the left, with a split bar per row. -->
    <section class="card">
      <div class="card__head"><span class="card__title">Match facts</span></div>
      <div class="facts">
        <div v-for="row in report.stats" :key="row.label" class="facts__row">
          <span class="facts__value">{{ row.home }}{{ row.unit ?? '' }}</span>
          <span class="facts__mid">
            <span class="facts__label">{{ row.label }}</span>
            <span class="facts__bar">
              <span class="facts__home" :style="{ width: `${row.share}%` }" />
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

    <!-- The side he picked, on the pitch, rated. -->
    <section v-if="report.lineup.length" class="card">
      <div class="card__head">
        <span class="card__title">Your side</span>
        <span v-if="report.motm" class="card__title" style="color: var(--accent)">
          Best · {{ store.player(report.motm.playerId)?.knownAs }}
        </span>
      </div>
      <div class="card__body">
        <PitchLineup
          :club="report.club"
          :players="report.lineup"
          :highlight="report.motm?.playerId ?? null"
          @pick="(id) => router.push(`/player/${id}`)"
        />
      </div>
    </section>
  </div>

  <div v-else class="empty">That match has not been played.</div>
</template>

<style scoped>
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
