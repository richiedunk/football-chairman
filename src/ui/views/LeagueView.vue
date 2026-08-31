<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import FormRun from '../components/FormRun.vue'
import { sortTable } from '../../engine/systems/board'
import { survivorsOf, tieAggregate } from '../../engine/sim/cups'
import Chevron from '../components/Chevron.vue'
import { CATEGORY_LABELS } from '../../engine/systems/inbox'
import { FIRST_MATCH_WEEK } from '../../engine/sim/schedule'
import { followLink } from '../link'
import type { CupCompetition } from '../../engine/types'

const store = useGameStore()
const router = useRouter()
const route = useRoute()

const tab = ref<'table' | 'fixtures' | 'results' | 'news'>('table')

const league = computed(() => {
  const id = route.params.id ? String(route.params.id) : store.club?.leagueId
  return id ? store.leagueById(id) : null
})

const table = computed(() => {
  const l = league.value
  const s = store.game
  if (!l || !s) return []
  return sortTable(s.tables[l.id] ?? [])
})

function rowClass(index: number, clubId: string) {
  const l = league.value
  if (!l) return ''
  const classes: string[] = []
  if (clubId === store.club?.id) classes.push('is-player-club')
  const position = index + 1
  if (l.promotionPlaces > 0 && position <= l.promotionPlaces) classes.push('is-promotion')
  else if (l.playoffPlaces > 0 && position <= l.promotionPlaces + l.playoffPlaces) classes.push('is-playoff')
  if (l.relegationPlaces > 0 && position > table.value.length - l.relegationPlaces) classes.push('is-relegation')
  return classes.join(' ')
}

const fixtures = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return []
  return s.fixtures
    .filter((f) => f.competitionId === l.id && f.season === s.date.season && !f.result)
    .sort((a, b) => a.week - b.week)
    .slice(0, 40)
})

const results = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return []
  return s.fixtures
    .filter((f) => f.competitionId === l.id && f.season === s.date.season && f.result)
    .sort((a, b) => b.week - a.week)
    .slice(0, 40)
})

/**
 * Where the player's club stands in one knockout competition.
 *
 * Written against a competition rather than looking one up, because the same
 * card now serves the domestic cup and the continental competitions, and a
 * European tie reads exactly the same as a cup tie: who, what round, what the
 * aggregate is and whether you are still in it.
 */
function standingIn(competition: CupCompetition) {
  const s = store.game
  if (!s) return null

  const currentRound = competition.rounds[competition.rounds.length - 1] ?? null
  // Whether your club was ever in it at all. Without this a competition your
  // club never qualified for was marked "Out", which reads as having been
  // knocked out of something you were never in.
  const entered = competition.entrantIds.includes(store.club?.id ?? '')
  const stillIn = entered && survivorsOf(s, competition).includes(store.club?.id ?? '')
  // A two-legged round has two fixtures for the club, so the card shows the
  // tie rather than a single match.
  const legs = currentRound
    ? s.fixtures.filter(
        (f) =>
          currentRound.fixtureIds.includes(f.id)
          && (f.homeClubId === store.club?.id || f.awayClubId === store.club?.id),
      )
    : []

  const aggregate = currentRound?.twoLegged && legs.length > 0
    ? tieAggregate(
        s.fixtures.filter(
          (f) =>
            currentRound.fixtureIds.includes(f.id)
            && f.legOf?.tieId === legs[0].legOf?.tieId,
        ),
      )
    : null

  return { competition, currentRound, entered, stillIn, tie: legs[0] ?? null, legs, aggregate }
}

/** The domestic cup for this division's nation. */
const cup = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return null
  const competition = Object.values(s.cups).find((c) => c.nationId === l.nationId)
  return competition ? standingIn(competition) : null
})

/**
 * Continental competitions for this division's confederation.
 *
 * Shown whether or not your club is in one — the competition your rivals are
 * playing in is exactly the thing a qualification place is for, and a season
 * spent watching it from outside is part of what makes finishing fifth sting.
 */
const continental = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return []
  const confederation = s.nations[l.nationId]?.confederation
  if (!confederation) return []

  // Only where it belongs. A division that awards no European place is four
  // tiers below anyone who could qualify, and putting the European Cup on its
  // table is clutter — unless your own club is somehow in it, in which case it
  // is the most important thing on the screen.
  const ourClub = store.club?.id
  return Object.values(s.cups)
    .filter((c) => c.type === 'continental' && c.confederation === confederation)
    .filter((c) => l.continentalPlaces.length > 0
      || (ourClub ? c.entrantIds.includes(ourClub) : false))
    .sort((a, b) => (a.tier === 'elite' ? -1 : 1) - (b.tier === 'elite' ? -1 : 1))
    .map((c) => standingIn(c))
    .filter((c): c is NonNullable<ReturnType<typeof standingIn>> => c !== null)
})

/** Every knockout competition worth showing on this division's screen. */
const cupCards = computed(() => {
  const domestic = cup.value ? [cup.value] : []
  return [...domestic, ...continental.value]
})

/** Which clubs from this division are in Europe, and in which competition. */
const qualified = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return []
  const out: { clubId: string; competition: string }[] = []
  for (const entry of continental.value) {
    for (const clubId of entry.competition.entrantIds) {
      if (l.clubIds.includes(clubId)) out.push({ clubId, competition: entry.competition.name })
    }
  }
  return out
})

const otherLeagues = computed(() => {
  const s = store.game
  if (!s) return []
  return Object.values(s.leagues).sort((a, b) => {
    if (a.nationId !== b.nationId) return b.reputation - a.reputation
    return a.tier - b.tier
  })
})

function short(clubId: string) {
  return store.clubById(clubId)?.shortName ?? '—'
}

/**
 * What has happened in this division.
 *
 * The feed has been written to from nine places since the game was built and
 * displayed by nothing at all — the same shape as a qualification place that
 * leads nowhere. It belongs here rather than in the inbox: the inbox is for
 * things addressed to you, and a rival being taken over is not addressed to
 * anyone. It is news about this league, so it sits beside this league's table.
 */
const news = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return []
  return s.newsFeed.filter((item) => item.leagueId === l.id).slice(0, 40)
})

/** True before a ball is kicked, so a table of zeroes explains itself. */
const notStarted = computed(() => table.value.every((row) => row.played === 0))
</script>

<template>
  <div v-if="league">
    <div class="row row--between mb">
      <h1 class="truncate">{{ league.name }}</h1>
      <span class="chip">{{ store.game?.nations[league.nationId]?.code }}</span>
    </div>

    <div class="segmented mb">
      <button class="segmented__item" :class="{ 'is-active': tab === 'table' }" @click="tab = 'table'">Table</button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'results' }" @click="tab = 'results'">Results</button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'fixtures' }" @click="tab = 'fixtures'">Fixtures</button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'news' }" @click="tab = 'news'">News</button>
    </div>

    <template v-if="tab === 'news'">
      <div v-if="!news.length" class="empty">Nothing has happened here yet.</div>
      <div v-else class="list">
        <button
          v-for="item in news"
          :key="item.id"
          class="list__row"
          :disabled="!item.link"
          @click="item.link && followLink(router, item.link)"
        >
          <div class="list__main">
            <div class="list__primary" style="white-space: normal">{{ item.text }}</div>
            <div class="list__secondary num">
              S{{ item.season }} W{{ item.week }} · {{ CATEGORY_LABELS[item.category] }}
            </div>
          </div>
          <Chevron v-if="item.link" :size="14" />
        </button>
      </div>
    </template>

    <p v-if="tab === 'table' && notStarted" class="tiny faint" style="margin: -2px 0 8px">
      Nobody has kicked a ball yet — the season starts in week {{ FIRST_MATCH_WEEK }}.
    </p>

    <div v-if="tab === 'table'" class="card">
      <div class="table__scroll">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 22px">#</th>
              <th>Club</th>
              <th class="num">P</th>
              <th class="num">W</th>
              <th class="num">D</th>
              <th class="num">L</th>
              <th class="num">GD</th>
              <th class="num">Pts</th>
              <th>Form</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in table" :key="row.clubId" :class="rowClass(i, row.clubId)">
              <td class="num">{{ i + 1 }}</td>
              <td class="name truncate" style="max-width: 112px">{{ short(row.clubId) }}</td>
              <td class="num">{{ row.played }}</td>
              <td class="num">{{ row.won }}</td>
              <td class="num">{{ row.drawn }}</td>
              <td class="num">{{ row.lost }}</td>
              <td class="num">{{ row.goalsFor - row.goalsAgainst > 0 ? '+' : '' }}{{ row.goalsFor - row.goalsAgainst }}</td>
              <td class="num bold">{{ row.points }}</td>
              <td><FormRun :form="row.form" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card__body tiny faint">
        <span style="color: var(--accent)">▌</span> Promotion
        <span v-if="league.playoffPlaces" style="color: var(--info); margin-left: 8px">▌</span>
        <span v-if="league.playoffPlaces">Play-offs</span>
        <span style="color: var(--danger); margin-left: 8px">▌</span> Relegation
      </div>
    </div>

    <div v-else-if="tab === 'results'" class="card">
      <div class="list">
        <div v-for="f in results" :key="f.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">
              {{ short(f.homeClubId) }} {{ f.result?.homeGoals }}–{{ f.result?.awayGoals }} {{ short(f.awayClubId) }}
            </div>
            <div class="list__secondary">Week {{ f.week }}</div>
          </div>
        </div>
        <div v-if="!results.length" class="empty">No matches played yet.</div>
      </div>
    </div>

    <div v-else class="card">
      <div class="list">
        <div v-for="f in fixtures" :key="f.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ short(f.homeClubId) }} v {{ short(f.awayClubId) }}</div>
            <div class="list__secondary">Week {{ f.week }}</div>
          </div>
        </div>
        <div v-if="!fixtures.length" class="empty">No fixtures remaining.</div>
      </div>
    </div>

    <template v-for="entry in cupCards" :key="entry.competition.id">
      <div class="section-title">{{ entry.competition.name }}</div>
      <div class="card">
        <div class="card__body">
          <div class="row row--between mb">
            <span class="small muted">
              {{ entry.competition.winnerId ? 'Winners' : entry.currentRound?.name ?? 'Not yet under way' }}
            </span>
            <span
              v-if="entry.competition.winnerId"
              class="chip chip--gold"
            >{{ store.clubById(entry.competition.winnerId)?.shortName }}</span>
            <span
              v-else-if="entry.entered"
              class="chip"
              :class="entry.stillIn ? 'chip--accent' : 'chip--danger'"
            >{{ entry.stillIn ? 'Still in' : 'Out' }}</span>
          </div>
          <template v-if="entry.aggregate">
            <div class="small bold">
              {{ short(entry.aggregate.clubA) }} {{ entry.aggregate.goalsA }}–{{ entry.aggregate.goalsB }}
              {{ short(entry.aggregate.clubB) }}
              <span class="tiny faint">on aggregate</span>
            </div>
            <div v-for="leg in entry.legs" :key="leg.id" class="tiny muted">
              Leg {{ leg.legOf?.leg }} (wk {{ leg.week }}):
              {{ short(leg.homeClubId) }}
              <template v-if="leg.result">
                {{ leg.result.homeGoals }}–{{ leg.result.awayGoals }}
              </template>
              <template v-else> v </template>
              {{ short(leg.awayClubId) }}
            </div>
          </template>
          <div v-else-if="entry.tie" class="small">
            {{ short(entry.tie.homeClubId) }}
            <template v-if="entry.tie.result">
              {{ entry.tie.result.homeGoals }}–{{ entry.tie.result.awayGoals }}
              <span v-if="entry.tie.result.penalties" class="tiny faint">
                ({{ entry.tie.result.penalties.home }}–{{ entry.tie.result.penalties.away }} pens)
              </span>
            </template>
            <template v-else> v </template>
            {{ short(entry.tie.awayClubId) }}
          </div>
          <div v-else-if="!entry.entered" class="small muted">
            {{ entry.competition.entrantIds.length }} clubs are in it. You are not.
          </div>
          <div v-else class="small muted">No tie this round.</div>
        </div>
      </div>
    </template>

    <template v-if="qualified.length">
      <div class="section-title">In continental competition</div>
      <div class="card">
        <div class="list">
          <button
            v-for="q in qualified"
            :key="q.clubId + q.competition"
            class="list__row"
            @click="$router.push('/club')"
          >
            <div class="list__main">
              <div class="list__primary">{{ store.clubById(q.clubId)?.name }}</div>
              <div class="list__secondary">{{ q.competition }}</div>
            </div>
          </button>
        </div>
      </div>
    </template>

    <div class="section-title">Other divisions</div>
    <div class="card">
      <div class="list">
        <button
          v-for="l in otherLeagues"
          :key="l.id"
          class="list__row"
          @click="$router.push(`/league/${l.id}`)"
        >
          <div class="list__main">
            <div class="list__primary">{{ l.name }}</div>
            <div class="list__secondary">
              {{ store.game?.nations[l.nationId]?.name }} · tier {{ l.tier }} · {{ l.clubIds.length }} clubs
            </div>
          </div>
          <Chevron />
        </button>
      </div>
    </div>
  </div>
</template>
