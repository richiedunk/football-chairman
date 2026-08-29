<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '../../stores/game'
import FormRun from '../components/FormRun.vue'
import { sortTable } from '../../engine/systems/board'
import { survivorsOf, tieAggregate } from '../../engine/sim/cups'

const store = useGameStore()
const route = useRoute()

const tab = ref<'table' | 'fixtures' | 'results'>('table')

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

/** The domestic cup for this division's nation, and where the player stands. */
const cup = computed(() => {
  const s = store.game
  const l = league.value
  if (!s || !l) return null
  const competition = Object.values(s.cups).find((c) => c.nationId === l.nationId)
  if (!competition) return null

  const currentRound = competition.rounds[competition.rounds.length - 1] ?? null
  const stillIn = survivorsOf(s, competition).includes(store.club?.id ?? '')
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

  return { competition, currentRound, stillIn, tie: legs[0] ?? null, legs, aggregate }
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
    </div>

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
              <td class="truncate" style="max-width: 108px">{{ short(row.clubId) }}</td>
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

    <template v-if="cup">
      <div class="section-title">{{ cup.competition.name }}</div>
      <div class="card">
        <div class="card__body">
          <div class="row row--between mb">
            <span class="small muted">
              {{ cup.competition.winnerId ? 'Winners' : cup.currentRound?.name ?? 'Not yet under way' }}
            </span>
            <span
              v-if="cup.competition.winnerId"
              class="chip chip--gold"
            >{{ store.clubById(cup.competition.winnerId)?.shortName }}</span>
            <span
              v-else
              class="chip"
              :class="cup.stillIn ? 'chip--accent' : 'chip--danger'"
            >{{ cup.stillIn ? 'Still in' : 'Out' }}</span>
          </div>
          <template v-if="cup.aggregate">
            <div class="small bold">
              {{ short(cup.aggregate.clubA) }} {{ cup.aggregate.goalsA }}–{{ cup.aggregate.goalsB }}
              {{ short(cup.aggregate.clubB) }}
              <span class="tiny faint">on aggregate</span>
            </div>
            <div v-for="leg in cup.legs" :key="leg.id" class="tiny muted">
              Leg {{ leg.legOf?.leg }} (wk {{ leg.week }}):
              {{ short(leg.homeClubId) }}
              <template v-if="leg.result">
                {{ leg.result.homeGoals }}–{{ leg.result.awayGoals }}
              </template>
              <template v-else> v </template>
              {{ short(leg.awayClubId) }}
            </div>
          </template>
          <div v-else-if="cup.tie" class="small">
            {{ short(cup.tie.homeClubId) }}
            <template v-if="cup.tie.result">
              {{ cup.tie.result.homeGoals }}–{{ cup.tie.result.awayGoals }}
              <span v-if="cup.tie.result.penalties" class="tiny faint">
                ({{ cup.tie.result.penalties.home }}–{{ cup.tie.result.penalties.away }} pens)
              </span>
            </template>
            <template v-else> v </template>
            {{ short(cup.tie.awayClubId) }}
          </div>
          <div v-else class="small muted">No tie this round.</div>
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
          <span class="faint">›</span>
        </button>
      </div>
    </div>
  </div>
</template>
