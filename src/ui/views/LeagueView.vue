<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '../../stores/game'
import FormRun from '../components/FormRun.vue'
import { sortTable } from '../../engine/systems/board'

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
