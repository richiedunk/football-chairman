<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { ordinal } from '../../engine/systems/career'
import { headerBand } from '../colour'
import { confidenceLabel } from '../../engine/systems/board'
import { formatMoney } from '../../engine/systems/valuation'
import { isAwayOnDuty } from '../../engine/systems/international'
import type { Fixture, MatchResult } from '../../engine/types'
import { ratingForPositionCached } from '../../engine/world/attributes'
import FormRun from '../components/FormRun.vue'
import Chevron from '../components/Chevron.vue'

/**
 * The dashboard.
 *
 * Nothing here is the same size or shape as anything else, deliberately. The
 * previous version was a stack of equally weighted cards, which is why the
 * screen felt busy: with everything boxed and everything the same, the player
 * has to read the whole page to find the one thing that changed.
 *
 * So: the standing is enormous because it is why the app gets opened, the
 * match is a raised band because it is the one scheduled event, decisions read
 * as an inbox because that is what they are, and the six departments are a
 * small chart rather than six tiles. Everything is still a tap target.
 */
const store = useGameStore()
const router = useRouter()

const club = computed(() => store.club)
const myRow = computed(() => store.table.find((r) => r.clubId === club.value?.id) ?? null)

const position = computed(() => store.leaguePosition)
const target = computed(() => club.value?.board.expectation.leaguePosition ?? 0)

/** Points clear of, or short of, the club immediately below and above. */
const gap = computed(() => {
  const table = store.table
  const i = table.findIndex((r) => r.clubId === club.value?.id)
  if (i < 0) return null
  const me = table[i]
  // Before a ball is kicked everyone is level, so "+0 on 23rd" is noise
  // dressed as information.
  if (me.played === 0) return null
  const below = table[i + 1]
  // "+0 on 22nd" is a fact, but it is not information. Say it in words or not
  // at all.
  if (below) {
    const lead = me.points - below.points
    return lead === 0
      ? `LEVEL WITH ${i + 2}${ordinal(i + 2).toUpperCase()}`
      : `+${lead} ON ${i + 2}${ordinal(i + 2).toUpperCase()}`
  }
  const above = table[i - 1]
  if (above) return `${me.points - above.points} ON ${i}${ordinal(i).toUpperCase()}`
  return null
})

// The board's confidence sits with the standing rather than in its own card,
// because position against the board's target is what actually moves it.
//
// Two signals, deliberately not merged. The bar is confidence, 0-100. The
// text is whether the target is being met. An earlier version put a marker
// for the target position on the confidence track, which looked informative
// and meant nothing: a league place and a confidence score are not the same
// scale, so the marker was somewhere arbitrary on a bar it did not belong to.
const boardTone = computed(() => {
  const c = club.value?.board.confidence ?? 0
  return c >= 60 ? 'var(--accent)' : c >= 35 ? 'var(--warn)' : 'var(--danger)'
})
const targetTone = computed(() => {
  const pos = position.value
  if (!pos || !target.value) return 'var(--text-faint)'
  if (pos <= target.value) return 'var(--accent)'
  return pos <= target.value + 3 ? 'var(--warn)' : 'var(--danger)'
})

const nextMatch = computed(() => {
  const f = store.nextFixture
  const c = club.value
  const s = store.game
  if (!f || !c || !s) return null
  const isHome = f.homeClubId === c.id
  const opponent = store.clubById(isHome ? f.awayClubId : f.homeClubId)
  if (!opponent) return null
  const rank = store.table.findIndex((r) => r.clubId === opponent.id) + 1
  const row = rank > 0 ? store.table[rank - 1] : null
  const competition =
    f.competitionType === 'league'
      ? store.leagueById(f.competitionId)?.name ?? 'League'
      : s.cups[f.competitionId]?.name ?? 'Cup'
  const round =
    f.competitionType === 'league'
      ? null
      : s.cups[f.competitionId]?.rounds.find((r) => r.round === f.round)?.name ?? null
  return {
    opponent,
    isHome,
    weeksAway: Math.max(0, f.week - s.date.week),
    competition: round ?? competition,
    standing: row ? `${rank}${ordinal(rank).toUpperCase()} · ${row.points} PTS` : null,
    // The opponent's colour, put through the same readability rule so a white
    // or yellow club is still visible against the raised band.
    colour: headerBand(opponent.colors.primary, opponent.colors.secondary).strip,
  }
})

// Who genuinely cannot play: injured or suspended. Match sharpness is not a
// fitness doubt — it is how long since someone played — and reading it as one
// reported most of the squad as doubtful every September.
const injured = computed(
  () => store.squad.filter((p) => p.injury && p.injury.weeksRemaining > 0).length,
)
const suspended = computed(() => store.squad.filter((p) => p.suspendedWeeks > 0).length)
// Away with their country belongs in the same line, because it is the same
// problem on Saturday — and it is the one the coach will bring up first, since
// it is the one nobody at the club decided.
const away = computed(() => {
  const s = store.game
  if (!s) return 0
  return store.squad.filter((p) => isAwayOnDuty(p, s.date.week)).length
})
/**
 * The headline for a result in the feed.
 *
 * Most of these carry a written verdict, but not all of them: a match played
 * before the director took this job was simulated in bulk and stripped down to
 * its score, and a fixture from an older save may have been too. Falling
 * straight through to `summary` left those rows blank — a result with no words
 * and no scoreline, which reads as a bug because it is one.
 */
function resultLine(entry: { fixture: Fixture; result: MatchResult }): string {
  if (entry.result.summary) return entry.result.summary
  const c = club.value
  const home = store.clubById(entry.fixture.homeClubId)
  const away = store.clubById(entry.fixture.awayClubId)
  const isHome = entry.fixture.homeClubId === c?.id
  const us = isHome ? entry.result.homeGoals : entry.result.awayGoals
  const them = isHome ? entry.result.awayGoals : entry.result.homeGoals
  const verdict = us > them ? 'Beat' : us < them ? 'Lost to' : 'Drew with'
  const opponent = (isHome ? away : home)?.name ?? 'them'
  return `${verdict} ${opponent}, ${us}-${them}`
}

const unavailable = computed(() => {
  const bits: string[] = []
  if (injured.value) bits.push(`${injured.value} OUT`)
  if (suspended.value) bits.push(`${suspended.value} SUSPENDED`)
  if (away.value) bits.push(`${away.value} AWAY`)
  return bits.join(' · ')
})

/**
 * What is actually waiting. Urgent items first, then unread decisions, then
 * the standing hazards — expiring contracts and a room going sour — which are
 * not inbox items but are the two things most worth acting on early.
 */
const waiting = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []

  const items: { key: string; title: string; detail: string; tone: string; to: string }[] = []

  for (const item of store.inbox) {
    if (!item.decision || item.decision.chosenId) continue
    const expires = item.expiresWeek ? Math.max(0, item.expiresWeek - s.date.week) : null
    items.push({
      key: item.id,
      title: item.subject,
      detail: item.urgent
        ? expires !== null
          ? `${expires} WEEK${expires === 1 ? '' : 'S'} TO ANSWER`
          : 'NEEDS AN ANSWER'
        : item.from.toUpperCase(),
      tone: item.urgent ? 'var(--danger)' : 'var(--warn)',
      to: '/inbox',
    })
  }

  // Deadline day itself is not a decision — the offers on it are, and they
  // are gone at the end of the week. The advance button warns that the window
  // is closing; this is the way in to do something about it.
  if (store.isDeadline && store.deadlineOffers.length) {
    items.push({
      key: 'deadline',
      title: `${store.deadlineOffers.length} deadline-day offer${store.deadlineOffers.length === 1 ? '' : 's'}`,
      detail: 'GONE WHEN THE WINDOW SHUTS TONIGHT',
      tone: 'var(--danger)',
      to: '/deadline',
    })
  }

  const expiring = store.squad.filter(
    (p) => p.contract && p.contract.expiresSeason <= s.date.season,
  ).length
  if (expiring) {
    items.push({
      key: 'expiring',
      title: `${expiring} contract${expiring === 1 ? '' : 's'} expiring`,
      detail: 'THEY LEAVE FOR NOTHING IF NOTHING IS AGREED',
      tone: 'var(--warn)',
      to: '/squad',
    })
  }

  const unhappy = store.squad.filter((p) => p.morale < 35).length
  if (unhappy) {
    items.push({
      key: 'unhappy',
      title: `${unhappy} unhappy player${unhappy === 1 ? '' : 's'}`,
      detail: 'LOW MORALE DRAGS FORM AND INVITES THE PRESS',
      tone: 'var(--text-fainter)',
      to: '/squad',
    })
  }

  return items.slice(0, 4)
})

/**
 * The estate: six things you invest in, as one chart rather than six tiles.
 *
 * Same numbers, a quarter of the height, and a weak department is visible
 * without having to know that 31 out of 99 is bad. Squad and coach are derived
 * rather than owned, because what you have built is not the same as what you
 * have bought.
 */
const estate = computed(() => {
  const c = club.value
  if (!c) return []
  const f = c.facilities

  // Squad strength is the best eighteen fit players in their own positions,
  // not a squad average: a bloated squad of reserves should not read as a
  // strong one, and eighteen is what actually gets on a teamsheet.
  const rated = store.squad
    .filter((p) => !p.injury)
    .map((p) => ratingForPositionCached(p.attributes, p.position))
    .sort((a, b) => b - a)
    .slice(0, 18)
  const squadStrength = rated.length
    ? Math.round(rated.reduce((sum, r) => sum + r, 0) / rated.length)
    : 0

  // Facility levels run 1-20; the chart runs 0-100, so they are scaled rather
  // than shown raw. A player who has seen "Training 14" in the facilities
  // screen should still recognise it here as roughly seventy.
  const level = (n: number) => Math.round(Math.min(20, Math.max(0, n)) * 5)

  return [
    { key: 'squad', label: 'SQUAD', value: squadStrength, to: '/squad' },
    // The head coach is staff rather than estate, and he already has a screen
    // of his own. A neglected medical centre is the opposite: invisible until
    // players start breaking, which is exactly what a glanceable bar is for.
    { key: 'medical', label: 'MEDICAL', value: level(f.medicalCentre), to: '/facilities' },
    { key: 'youth', label: 'YOUTH', value: level(f.youthFacilities), to: '/academy' },
    { key: 'train', label: 'TRAIN', value: level(f.trainingGround), to: '/facilities' },
    { key: 'scout', label: 'SCOUT', value: level(f.scoutingNetwork), to: '/scouting' },
    { key: 'data', label: 'DATA', value: level(f.dataDepartment), to: '/facilities' },
  ]
})

function barColour(value: number): string {
  return value >= 60 ? 'var(--accent)' : value >= 40 ? 'var(--warn)' : 'var(--danger)'
}

/**
 * The places you go that are not one of the five tabs.
 *
 * Chosen by how often a director actually needs them rather than by tidiness:
 * the boardroom and the staff room are where the two hardest decisions live,
 * and both were buried. Each carries a line of live state, so the row is worth
 * reading even when you are not going anywhere.
 */
const hub = computed(() => {
  const c = club.value
  if (!c) return []
  const coach = store.headCoach
  const projects = c.facilities.projects.length
  return [
    {
      to: '/board',
      label: 'Boardroom',
      note: confidenceLabel(c.board.confidence),
      icon: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
    },
    {
      to: '/staff',
      label: 'Staff',
      note: coach?.knownAs ?? 'No head coach',
      icon: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM22 21v-2a4 4 0 00-3-3.87',
    },
    {
      to: '/facilities',
      label: 'Facilities',
      note: projects ? `${projects} under way` : 'Nothing under way',
      icon: 'M3 21h18M6 21V9l6-4 6 4v12M10 21v-5h4v5',
    },
    {
      to: '/finance',
      label: 'Finances',
      note: formatMoney(c.finances.balance, store.currency),
      icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    },
    {
      to: '/academy',
      label: 'Academy',
      note: `${store.academy.length} in the setup`,
      icon: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5',
    },
    {
      to: '/club',
      label: 'Everything',
      note: 'Media, career, saves',
      icon: 'M4 6h16M4 12h16M4 18h16',
    },
  ]
})
</script>

<template>
  <div v-if="club" class="dash">
    <!-- The standing. Nothing on the screen competes with it. -->
    <section class="dash-standing">
      <button class="dash-standing__top" @click="router.push('/league')">
        <div class="row" style="gap: 14px; align-items: flex-start">
          <div class="dash-standing__figure">
            <span class="dash-standing__pos">{{ position || '—' }}</span>
            <span v-if="position" class="dash-standing__ord">{{ ordinal(position) }}</span>
          </div>
          <div class="col" style="gap: 7px; padding-top: 4px">
            <div class="dash-standing__meta">
              {{ myRow?.points ?? 0 }} PTS<template v-if="gap"> · <span class="faint">{{ gap }}</span></template>
            </div>
            <FormRun :form="myRow?.form ?? []" />
          </div>
        </div>
        <Chevron style="margin-top: 5px" />
      </button>

      <button class="dash-board" @click="router.push('/board')">
        <span class="dash-board__label">BOARD</span>
        <div class="dash-board__track">
          <div
            class="dash-board__fill"
            :style="{ width: `${club.board.confidence}%`, background: boardTone }"
          />
        </div>
        <span class="dash-board__value" :style="{ color: targetTone }">
          TARGET {{ target }}{{ ordinal(target).toUpperCase() }}
        </span>
        <Chevron :size="13" />
      </button>
    </section>

    <!-- The one scheduled event of the week, so it looks like an event. -->
    <button v-if="nextMatch" class="dash-match" @click="router.push('/league')">
      <span class="dash-match__colour" :style="{ background: nextMatch.colour }" />
      <span class="grow">
        <span class="dash-match__when">
          {{ nextMatch.weeksAway <= 0 ? 'THIS WEEK' : nextMatch.weeksAway === 1 ? 'NEXT WEEK' : `IN ${nextMatch.weeksAway} WEEKS` }}
          · {{ nextMatch.isHome ? 'HOME' : 'AWAY' }}
        </span>
        <span class="dash-match__who">{{ nextMatch.opponent.name }}</span>
      </span>
      <span class="dash-match__trail">
        {{ nextMatch.standing ?? nextMatch.competition }}<br>
        <span class="dash-fitness" :style="{ color: unavailable ? 'var(--danger)' : 'var(--text-faint)' }">
          {{ unavailable || 'FULLY FIT' }}
        </span>
      </span>
      <Chevron />
    </button>

    <!-- Decisions, as an inbox rather than a grid. -->
    <div class="card__head" style="padding-top: 16px">
      <span class="card__title">Waiting on you</span>
      <span class="card__title" :style="{ color: waiting.length ? 'var(--danger)' : undefined }">
        {{ waiting.length }}
      </span>
    </div>
    <button
      v-for="item in waiting"
      :key="item.key"
      class="dash-item"
      @click="router.push(item.to)"
    >
      <span class="dash-item__severity" :style="{ background: item.tone }" />
      <span class="grow">
        <span class="dash-item__title">{{ item.title }}</span>
        <span class="dash-item__detail">{{ item.detail }}</span>
      </span>
      <Chevron :size="14" />
    </button>
    <div v-if="!waiting.length" class="dash-item" style="cursor: default">
      <span class="dash-item__severity" style="background: var(--border-strong)" />
      <span class="grow">
        <span class="dash-item__title muted">Nothing pressing</span>
        <span class="dash-item__detail">A RARE WEEK</span>
      </span>
    </div>

    <!-- The estate: six departments as one chart, six tap targets. -->
    <div class="card__head" style="padding-top: 18px">
      <span class="card__title">Your estate</span>
      <button class="card__title" style="background: none; border: 0; cursor: pointer" @click="router.push('/club')">
        EVERYTHING ELSE
      </button>
    </div>
    <div class="estate">
      <button
        v-for="d in estate"
        :key="d.key"
        class="estate__col"
        :aria-label="`${d.label} ${d.value} out of 100`"
        @click="router.push(d.to)"
      >
        <span class="estate__value" :style="{ color: d.value >= 60 ? 'var(--text)' : 'var(--text-dim)' }">
          {{ d.value }}
        </span>
        <span class="estate__track">
          <span
            class="estate__fill"
            :style="{ height: `${Math.max(3, d.value)}%`, background: barColour(d.value) }"
          />
        </span>
        <span class="estate__label">{{ d.label }}</span>
      </button>
    </div>

    <!-- The rest of the club. The five tabs cover the daily loop; this is
         everything else, named and one tap away, because the alternative is
         remembering that a Facilities screen exists at all. -->
    <div class="card__head" style="padding-top: 18px">
      <span class="card__title">Run the club</span>
    </div>
    <div class="hub">
      <button v-for="place in hub" :key="place.to" class="hub__item" @click="router.push(place.to)">
        <span class="hub__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="place.icon" />
          </svg>
        </span>
        <span class="hub__label">{{ place.label }}</span>
        <span v-if="place.note" class="hub__note">{{ place.note }}</span>
      </button>
    </div>

    <!-- Recent results, as a list of scorelines rather than a card of cards. -->
    <template v-if="store.recentResults.length">
      <div class="card__head" style="padding-top: 18px">
        <span class="card__title">Recent</span>
      </div>
      <div class="list">
        <button
          v-for="entry in store.recentResults.slice(0, 4)"
          :key="entry.fixture.id"
          class="list__row"
          @click="router.push(`/match/${entry.fixture.id}`)"
        >
          <div class="list__main">
            <div class="list__primary">{{ resultLine(entry) }}</div>
            <div class="list__secondary">
              W{{ entry.fixture.week }} ·
              {{ entry.fixture.competitionType === 'league'
                ? 'LEAGUE'
                : (store.game?.cups[entry.fixture.competitionId]?.name ?? 'CUP').toUpperCase() }}
              <template v-if="entry.result.attendance">
                · {{ entry.result.attendance.toLocaleString() }} IN
              </template>
            </div>
          </div>
          <Chevron :size="14" />
        </button>
      </div>
    </template>
  </div>
  <div v-else class="empty">No club loaded.</div>
</template>
