<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { philosophyOf } from '../../engine/systems/recruitment'
import { formatMoney } from '../../engine/systems/valuation'
import { confidenceLabel } from '../../engine/systems/board'
import { credibilityLabel } from '../../engine/systems/media'
import { levelFor } from '../../engine/systems/career'
import Chevron from '../components/Chevron.vue'

const store = useGameStore()
const router = useRouter()

const club = computed(() => store.club)
const level = computed(() => levelFor(store.game?.director.xp ?? 0))
const registered = computed(() => {
  const r = store.registration
  return r ? `${r.placesUsed}/${r.placesUsed + r.placesFree}` : '—'
})

/**
 * Everything that is not one of the five tabs.
 *
 * The bar carries home, squad, market, inbox and league; this is where the
 * other dozen screens live, and the dashboard links straight here. The icons
 * are stroked paths rather than emoji — emoji are full-colour cartoons in a
 * palette this app does not have, and they were the last of the old look.
 */
const ICONS: Record<string, string> = {
  board: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  finance: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  stadium: 'M2 9c0-2.2 4.5-4 10-4s10 1.8 10 4M2 9v6c0 2.2 4.5 4 10 4s10-1.8 10-4V9M2 9c0 2.2 4.5 4 10 4s10-1.8 10-4',
  facilities: 'M3 21h18M6 21V9l6-4 6 4v12M10 21v-5h4v5',
  staff: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM22 21v-2a4 4 0 00-3-3.87',
  academy: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5',
  media: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  registration: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  agents: 'M20 21v-2a4 4 0 00-3-3.87M4 21v-2a4 4 0 013-3.87M12 3a4 4 0 100 8 4 4 0 000-8zM12 15v6',
  career: 'M3 3v18h18M18 9l-5 5-3-3-4 4',
  achievements: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.2 13.9L7 22l5-3 5 3-1.2-8.1',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H2a2 2 0 110-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 3.7 1.7 1.7 0 0010 2.2V2a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H22a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
}

const earnedMilestones = computed(
  () => store.achievementProgress.filter((a) => a.earned).length,
)

const sections = computed(() => [
  { to: '/board', icon: 'board', label: 'Board', detail: club.value ? confidenceLabel(club.value.board.confidence) : '' },
  { to: '/finance', icon: 'finance', label: 'Finances', detail: formatMoney(club.value?.finances.balance ?? 0, store.currency) },
  { to: '/stadium', icon: 'stadium', label: 'Stadium', detail: club.value?.facilities.stadiumProject?.description ?? `${club.value?.facilities.stadium.capacity.toLocaleString()} places` },
  { to: '/facilities', icon: 'facilities', label: 'Facilities', detail: `${club.value?.facilities.projects.length ?? 0} project${club.value?.facilities.projects.length === 1 ? '' : 's'} under way` },
  { to: '/staff', icon: 'staff', label: 'Staff', detail: store.headCoach?.knownAs ?? 'No head coach' },
  { to: '/recruitment', icon: 'agents', label: 'Recruitment policy', detail: club.value ? philosophyOf(club.value).name : '' },
  { to: '/data', icon: 'scouting', label: 'Data department', detail: `${store.game?.dataFindings?.length ?? 0} name${(store.game?.dataFindings?.length ?? 0) === 1 ? '' : 's'} on the list` },
  { to: '/academy', icon: 'academy', label: 'Academy', detail: `${store.academy.length} in the setup` },
  { to: '/registration', icon: 'registration', label: 'Squad registration', detail: `${registered.value} named` },
  { to: '/agents', icon: 'agents', label: 'Agents', detail: `${store.agents.length} on the circuit` },
  { to: '/media', icon: 'media', label: 'Media', detail: credibilityLabel(store.game?.mediaStanding.credibility ?? 0) },
  { to: '/career', icon: 'career', label: 'Your career', detail: `${level.value.title} · ${(store.game?.director.xp ?? 0).toLocaleString()} XP` },
  // Milestones lost their tab when the bar came down to five, and a record of
  // what you have done is exactly the sort of thing that should be findable.
  { to: '/achievements', icon: 'achievements', label: 'Milestones', detail: `${earnedMilestones.value} of ${store.achievementProgress.length}` },
  { to: '/settings', icon: 'settings', label: 'Settings & saves', detail: '' },
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
          <span class="row-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="ICONS[s.icon]" />
            </svg>
          </span>
          <div class="list__main">
            <div class="list__primary">{{ s.label }}</div>
            <div class="list__secondary">{{ s.detail }}</div>
          </div>
          <Chevron />
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
                <td class="name truncate" style="max-width: 130px">{{ h.leagueName }}</td>
                <td class="num">{{ h.position }}</td>
                <td class="num">{{ h.points }}</td>
                <td class="name truncate tiny" style="max-width: 130px">{{ h.cupResult }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
