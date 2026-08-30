<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { headerBand } from '../colour'
import { manOfTheMatch, matchVerdict } from '../../engine/systems/matchReport'
import type { MatchEvent } from '../../engine/types'

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
    ourShots: isHome ? result.shots.home : result.shots.away,
    theirShots: isHome ? result.shots.away : result.shots.home,
    ourOnTarget: isHome ? result.shotsOnTarget.home : result.shotsOnTarget.away,
    ourPossession: isHome ? result.possession : 100 - result.possession,
    ourColour: headerBand(club.colors.primary, club.colors.secondary).strip,
    theirColour: headerBand(opponent.colors.primary, opponent.colors.secondary).strip,
  }
})

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

function ratingTone(rating: number): string {
  if (rating >= 7.5) return 'var(--accent)'
  if (rating >= 6.5) return 'var(--text)'
  if (rating >= 5.5) return 'var(--text-dim)'
  return 'var(--danger)'
}
</script>

<template>
  <div v-if="report" class="dash">
    <!-- The scoreline, at a size that makes it the point of the screen. -->
    <section class="report-score">
      <div class="report-score__meta">
        {{ report.competition.toUpperCase() }} · {{ report.isHome ? 'HOME' : 'AWAY' }} ·
        W{{ report.fixture.week }}
      </div>
      <div class="report-score__line">
        <span class="report-score__side">
          <span class="report-score__bar" :style="{ background: report.ourColour }" />
          <span class="report-score__club">{{ report.club.shortName || report.club.name }}</span>
        </span>
        <span class="report-score__goals">
          {{ report.ourGoals }}<span class="report-score__dash">–</span>{{ report.theirGoals }}
        </span>
        <span class="report-score__side report-score__side--right">
          <span class="report-score__club">{{ report.opponent.shortName || report.opponent.name }}</span>
          <span class="report-score__bar" :style="{ background: report.theirColour }" />
        </span>
      </div>
      <div
        v-if="report.result.penalties"
        class="report-score__meta"
        style="text-align: center"
      >
        {{ report.result.penalties.home }}–{{ report.result.penalties.away }} ON PENALTIES
      </div>
      <div
        class="report-score__verdict"
        :style="{ color: VERDICT_TONE[report.verdict.verdict] }"
      >{{ report.verdict.headline }}</div>
    </section>

    <!-- The three numbers that say how the game went. -->
    <div class="report-stats">
      <div class="report-stats__cell">
        <div class="report-stats__value">{{ Math.round(report.ourPossession) }}<span class="report-stats__unit">%</span></div>
        <div class="report-stats__label">POSSESSION</div>
      </div>
      <div class="report-stats__cell">
        <div class="report-stats__value">{{ report.ourShots }}<span class="report-stats__unit">/{{ report.theirShots }}</span></div>
        <div class="report-stats__label">SHOTS</div>
      </div>
      <div class="report-stats__cell">
        <div class="report-stats__value">{{ report.result.attendance.toLocaleString() }}</div>
        <div class="report-stats__label">ATTENDANCE</div>
      </div>
    </div>

    <!-- What actually happened. -->
    <template v-if="report.notable.length">
      <div class="card__head"><span class="card__title">How it went</span></div>
      <div
        v-for="(event, i) in report.notable"
        :key="i"
        class="report-event"
      >
        <span class="report-event__minute">{{ event.minute }}'</span>
        <span
          class="report-event__bar"
          :style="{ background: event.clubId === report.club.id ? report.ourColour : report.theirColour }"
        />
        <span class="grow report-event__text">{{ event.text }}</span>
        <span
          class="report-event__type"
          :style="{ color: ['redCard', 'injury', 'ownGoal', 'penaltyMissed'].includes(event.type) ? 'var(--danger)' : 'var(--text-faint)' }"
        >{{ EVENT_LABEL[event.type] ?? event.type.toUpperCase() }}</span>
      </div>
    </template>

    <!-- The coach's read. The one football opinion in the game that is his. -->
    <template v-if="report.verdict.coachLine">
      <div class="card__head">
        <span class="card__title">{{ store.headCoach?.knownAs ?? 'The head coach' }}</span>
      </div>
      <div class="report-quote">“{{ report.verdict.coachLine }}”</div>
    </template>

    <!-- Ratings, best first, because the question is who played well. -->
    <template v-if="report.lineup.length">
      <div class="card__head">
        <span class="card__title">Ratings</span>
        <span v-if="report.motm" class="card__title" style="color: var(--accent)">
          {{ store.player(report.motm.playerId)?.knownAs }}
        </span>
      </div>
      <button
        v-for="row in report.lineup"
        :key="row.player.id"
        class="report-rating"
        @click="router.push(`/player/${row.player.id}`)"
      >
        <span class="report-rating__value" :style="{ color: ratingTone(row.rating) }">
          {{ row.rating.toFixed(1) }}
        </span>
        <span class="grow truncate">{{ row.player.knownAs }}</span>
        <span class="report-rating__pos">{{ row.player.position }}</span>
        <span
          v-if="report.motm && row.player.id === report.motm.playerId"
          class="chip chip--accent"
        >Best</span>
      </button>
    </template>
  </div>

  <div v-else class="empty">That match has not been played.</div>
</template>

<style scoped>
.report-score {
  padding: 20px var(--pad) 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.report-score__meta {
  font-family: var(--font-num);
  font-size: 0.6rem;
  letter-spacing: 0.11em;
  color: var(--text-faint);
}
.report-score__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.report-score__side {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.report-score__side--right { justify-content: flex-end; }
.report-score__bar {
  flex: 0 0 auto;
  width: 3px;
  height: 26px;
  border-radius: 2px;
}
.report-score__club {
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-score__goals {
  flex: 0 0 auto;
  font-family: var(--font-num);
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
}
.report-score__dash { color: var(--text-fainter); padding: 0 3px; }
.report-score__verdict {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.report-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--hairline);
  border-bottom: 1px solid var(--border);
}
.report-stats__cell { background: var(--bg); padding: 11px var(--pad); }
.report-stats__value {
  font-family: var(--font-num);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.report-stats__unit { color: var(--text-faint); font-size: 0.8rem; font-weight: 500; }
.report-stats__label {
  font-family: var(--font-num);
  font-size: 0.55rem;
  letter-spacing: 0.11em;
  color: var(--text-faint);
  margin-top: 3px;
}

.report-event {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px var(--pad);
  border-top: 1px solid var(--hairline);
  font-size: 0.84rem;
}
.report-event__minute {
  flex: 0 0 auto;
  width: 30px;
  padding-top: 2px;
  font-family: var(--font-num);
  font-size: 0.7rem;
  color: var(--text-faint);
}
.report-event__bar {
  flex: 0 0 auto;
  width: 3px;
  align-self: stretch;
  min-height: 18px;
  border-radius: 2px;
}
.report-event__text { line-height: 1.35; }
.report-event__type {
  flex: 0 0 auto;
  align-self: flex-start;
  padding-top: 2px;
  font-family: var(--font-num);
  font-size: 0.58rem;
  letter-spacing: 0.08em;
}

.report-quote {
  padding: 4px var(--pad) 14px;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--text);
}

.report-rating {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: var(--tap);
  padding: 8px var(--pad);
  background: none;
  border: 0;
  border-top: 1px solid var(--hairline);
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-size: 0.88rem;
}
.report-rating:active { background: var(--bg-raised); }
.report-rating__value {
  flex: 0 0 auto;
  width: 30px;
  font-family: var(--font-num);
  font-size: 0.92rem;
  font-weight: 700;
}
.report-rating__pos {
  flex: 0 0 auto;
  font-family: var(--font-num);
  font-size: 0.62rem;
  color: var(--text-faint);
}
</style>
