<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import PlayerRow from '../components/PlayerRow.vue'
import { formatMoney } from '../../engine/systems/valuation'
import {
  agentFee, relationshipMultiplier, STANDING_LABELS, STANDING_NOTES, standingFor,
} from '../../engine/systems/agents'
import type { Agent } from '../../engine/types'

const store = useGameStore()
const router = useRouter()

const agents = computed(() => store.agents)
const introductions = computed(() => store.agentIntroductions)

const expanded = ref<string | null>(null)
function toggle(agent: Agent) {
  expanded.value = expanded.value === agent.id ? null : agent.id
}

const STANDING_CLASS: Record<string, string> = {
  trusted: 'chip--accent',
  warm: 'chip--info',
  neutral: '',
  strained: 'chip--warn',
  hostile: 'chip--danger',
}

/** What his cut would be on a £20k-a-week deal, as a comparable figure. */
function sampleFee(agent: Agent) {
  return agentFee(agent, 20_000 * 52)
}

function ourClients(agent: Agent) {
  const club = store.club
  if (!club) return []
  return store.agentClients(agent.id).filter((p) => p.clubId === club.id)
}
</script>

<template>
  <div>
    <div class="card">
      <div class="card__body">
        <p class="small" style="margin: 0">
          Agents represent blocs of players and deal with you again every window. How you
          treat one client is priced into the next deal — squeeze a fee, freeze a player out
          or let a contract run down and it costs you for seasons.
        </p>
      </div>
    </div>

    <template v-if="introductions.length">
      <div class="section-title">Quietly offered to you</div>
      <div class="card">
        <div class="list">
          <div v-for="intro in introductions" :key="intro.player.id" class="list__row list__row--static">
            <div class="list__main">
              <div class="list__primary">
                {{ intro.player.knownAs }}
                <span class="chip chip--accent">{{ intro.agent.name }}</span>
              </div>
              <div class="list__secondary" style="white-space: normal">{{ intro.note }}</div>
            </div>
            <button class="btn btn--ghost btn--sm" @click="router.push(`/player/${intro.player.id}`)">
              Look
            </button>
          </div>
        </div>
      </div>
    </template>

    <div class="section-title">Agents you deal with</div>
    <div class="card">
      <div class="list">
        <template v-for="agent in agents" :key="agent.id">
          <button class="list__row" style="width: 100%; text-align: left" @click="toggle(agent)">
            <div class="list__main">
              <div class="list__primary">
                {{ agent.name }}
                <span class="chip" :class="STANDING_CLASS[standingFor(agent.relationship)]">
                  {{ STANDING_LABELS[standingFor(agent.relationship)] }}
                </span>
              </div>
              <div class="list__secondary">
                {{ agent.clientIds.length }} client{{ agent.clientIds.length === 1 ? '' : 's' }}
                <span v-if="ourClients(agent).length"> · {{ ourClients(agent).length }} of yours</span>
              </div>
            </div>
            <span class="faint">{{ expanded === agent.id ? '▾' : '▸' }}</span>
          </button>

          <div v-if="expanded === agent.id" class="list__row list__row--static" style="display: block">
            <p class="tiny muted" style="white-space: normal; margin: 0 0 8px">
              {{ STANDING_NOTES[standingFor(agent.relationship)] }}
            </p>
            <div class="row row--between tiny" style="margin-bottom: 4px">
              <span class="muted">Relationship</span>
              <span class="num">{{ Math.round(agent.relationship) }}/100</span>
            </div>
            <MeterBar :value="agent.relationship" :max="100" />
            <div class="row row--between tiny mt">
              <span class="muted">His cut on a {{ formatMoney(20_000, store.currency) }}/wk deal</span>
              <span class="num">{{ formatMoney(sampleFee(agent), store.currency) }}</span>
            </div>
            <div class="row row--between tiny">
              <span class="muted">Versus a neutral standing</span>
              <span class="num">{{ Math.round(relationshipMultiplier(agent) * 100) }}%</span>
            </div>

            <div v-if="ourClients(agent).length" class="tiny faint bold mt" style="text-transform: uppercase; letter-spacing: 0.05em">
              His clients at your club
            </div>
            <PlayerRow
              v-for="p in ourClients(agent)"
              :key="p.id"
              :player="p"
              trail="wage"
            />
          </div>
        </template>
        <div v-if="agents.length === 0" class="empty">You have not dealt with any agents yet.</div>
      </div>
    </div>
  </div>
</template>
