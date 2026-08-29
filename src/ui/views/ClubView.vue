<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import { confidenceLabel } from '../../engine/systems/board'
import { credibilityLabel } from '../../engine/systems/media'
import { levelFor } from '../../engine/systems/career'

const store = useGameStore()
const router = useRouter()

const club = computed(() => store.club)
const level = computed(() => levelFor(store.game?.director.xp ?? 0))

const sections = computed(() => [
  { to: '/board', icon: '🏛', label: 'Board', detail: club.value ? confidenceLabel(club.value.board.confidence) : '' },
  { to: '/finance', icon: '💷', label: 'Finances', detail: formatMoney(club.value?.finances.balance ?? 0, store.currency) },
  { to: '/facilities', icon: '🏗', label: 'Facilities', detail: `${club.value?.facilities.projects.length ?? 0} project${club.value?.facilities.projects.length === 1 ? '' : 's'} under way` },
  { to: '/staff', icon: '📋', label: 'Staff', detail: store.headCoach?.knownAs ?? 'No head coach' },
  { to: '/academy', icon: '🎓', label: 'Academy', detail: `${store.academy.length} in the setup` },
  { to: '/media', icon: '📰', label: 'Media', detail: credibilityLabel(store.game?.mediaStanding.credibility ?? 0) },
  { to: '/career', icon: '📈', label: 'Your career', detail: `${level.value.title} · ${(store.game?.director.xp ?? 0).toLocaleString()} XP` },
  { to: '/settings', icon: '⚙️', label: 'Settings & saves', detail: '' },
])
</script>

<template>
  <div v-if="club">
    <div class="card">
      <div
        class="card__body"
        :style="{ background: `linear-gradient(135deg, ${club.colors.primary}22, transparent)` }"
      >
        <h1>{{ club.name }}</h1>
        <div class="small muted">
          {{ club.nickname }} · {{ club.city }} · founded {{ club.founded }}
        </div>
        <div class="chip-row mt">
          <span class="chip">{{ store.league?.name }}</span>
          <span class="chip">Rep {{ club.reputation }}</span>
          <span class="chip">{{ club.facilities.stadium.name }}</span>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Capacity</div>
          <div class="stat__value stat__value--sm">{{ club.facilities.stadium.capacity.toLocaleString() }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Fanbase</div>
          <div class="stat__value stat__value--sm">{{ club.fanbase }}/100</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="list">
        <button v-for="s in sections" :key="s.to" class="list__row" @click="router.push(s.to)">
          <span style="font-size: 1.15rem" aria-hidden="true">{{ s.icon }}</span>
          <div class="list__main">
            <div class="list__primary">{{ s.label }}</div>
            <div class="list__secondary">{{ s.detail }}</div>
          </div>
          <span class="faint">›</span>
        </button>
      </div>
    </div>

    <template v-if="club.history.length">
      <div class="section-title">History</div>
      <div class="card">
        <div class="table__scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Season</th><th>Division</th><th class="num">Pos</th>
                <th class="num">Pts</th><th>Cup</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in club.history.slice().reverse().slice(0, 12)" :key="h.season">
                <td>{{ h.season }}</td>
                <td class="truncate" style="max-width: 130px">{{ h.leagueName }}</td>
                <td class="num">{{ h.position }}</td>
                <td class="num">{{ h.points }}</td>
                <td class="truncate tiny" style="max-width: 130px">{{ h.cupResult }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
