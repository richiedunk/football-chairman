<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import AppSheet from '../components/AppSheet.vue'
import MeterBar from '../components/MeterBar.vue'
import PlayerRow from '../components/PlayerRow.vue'
import {
  assignScout, describeAssignment, knowledgeLabel, unassignScout,
} from '../../engine/systems/scouting'
import { staffEffectiveness } from '../../engine/world/staffGen'
import { facilityGrade } from '../../engine/systems/facilities'
import type { Staff } from '../../engine/types'

const store = useGameStore()

const scouts = computed(() => store.staff.filter((s) => s.role === 'scout'))
const editing = ref<Staff | null>(null)

const assignType = ref<'league' | 'nation' | 'position'>('league')
const targetId = ref('')
const minAbility = ref(80)
const maxAge = ref(30)
const positionTarget = ref('ST')

const leagues = computed(() => Object.values(store.game?.leagues ?? {}))
const nations = computed(() => Object.values(store.game?.nations ?? {}))

const reports = computed(() => {
  const s = store.game
  if (!s) return []
  return Object.values(s.scoutReports)
    .map((r) => ({ report: r, player: s.players[r.playerId] }))
    .filter((e) => e.player && e.player.clubId !== s.playerClubId)
    .sort((a, b) => b.report.recommendation - a.report.recommendation)
    .slice(0, 30)
})

function openEditor(scout: Staff) {
  editing.value = scout
  const current = scout.assignment
  assignType.value = (current?.type === 'player' ? 'league' : current?.type) ?? 'league'
  targetId.value = current?.targetId ?? store.club?.leagueId ?? ''
  minAbility.value = current?.minAbility ?? 80
  maxAge.value = current?.maxAge ?? 30
}

/**
 * Call him back in.
 *
 * A scout with no brief is not idle — he watches whatever is in front of him
 * and files nothing specific — but it is the only way to stop paying attention
 * to a league you have finished with, and until now there was no way to do it
 * short of giving him another job.
 */
function recall() {
  const scout = editing.value
  if (!scout) return
  unassignScout(scout)
  store.commit()
  editing.value = null
}

function apply() {
  const scout = editing.value
  if (!scout) return
  assignScout(scout, {
    type: assignType.value,
    targetId: assignType.value === 'position' ? positionTarget.value : targetId.value,
    position: assignType.value === 'position' ? (positionTarget.value as never) : undefined,
    minAbility: minAbility.value,
    maxAge: maxAge.value,
  })
  store.commit()
  editing.value = null
}
</script>

<template>
  <div>

    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Scouting network</span>
          <span class="chip">{{ facilityGrade(store.club?.facilities.scoutingNetwork ?? 1) }}</span>
        </div>
        <MeterBar :value="store.club?.facilities.scoutingNetwork ?? 0" :max="20" />
        <div class="row row--between mb mt">
          <span class="small muted">Data department</span>
          <span class="chip">{{ facilityGrade(store.club?.facilities.dataDepartment ?? 1) }}</span>
        </div>
        <MeterBar :value="store.club?.facilities.dataDepartment ?? 0" :max="20" />
        <p class="tiny faint mt">
          The network decides how much ground your scouts cover. The data department decides how
          tight their estimates are. They are not interchangeable.
        </p>
      </div>
    </div>

    <div class="section-title">Your scouts</div>
    <div class="card">
      <div class="list">
        <button v-for="scout in scouts" :key="scout.id" class="list__row" @click="openEditor(scout)">
          <div class="list__main">
            <div class="list__primary">{{ scout.knownAs }}</div>
            <div class="list__secondary">
              {{ describeAssignment(store.game!, scout) }}
              <template v-if="scout.assignment">
                · {{ scout.assignment.weeksOnAssignment }}w
              </template>
            </div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ staffEffectiveness(scout) }}</div>
            <div class="list__sub">judgement</div>
          </div>
        </button>
        <div v-if="!scouts.length" class="empty">
          You have no scouts. Hire one from the staff screen — recruiting blind is how directors
          get sacked.
        </div>
      </div>
    </div>

    <div class="section-title">Reports on file</div>
    <div class="card">
      <div class="list">
        <div v-for="entry in reports" :key="entry.report.playerId">
          <PlayerRow :player="entry.player!" trail="none" />
          <div class="card__body" style="padding-top: 0">
            <div class="row row--between tiny">
              <span class="faint">{{ knowledgeLabel(entry.report.knowledge) }} knowledge</span>
              <span class="num">
                {{ entry.report.abilityRange[0] }}–{{ entry.report.abilityRange[1] }}
                <span class="faint">now</span>
                · {{ entry.report.potentialRange[0] }}–{{ entry.report.potentialRange[1] }}
                <span class="faint">ceiling</span>
              </span>
            </div>
            <MeterBar :value="entry.report.knowledge" :semantic="false" />
            <p class="tiny muted" style="margin-top: 6px">{{ entry.report.verdict }}</p>
          </div>
        </div>
        <div v-if="!reports.length" class="empty">
          No reports yet. Give your scouts a brief and check back in a few weeks.
        </div>
      </div>
    </div>

    <AppSheet
      v-if="editing"
      :title="`Brief ${editing.knownAs}`"
      subtitle="What should he be looking for?"
      @close="editing = null"
    >
      <div class="field">
        <label class="field__label">Search</label>
        <div class="segmented">
          <button class="segmented__item" :class="{ 'is-active': assignType === 'league' }" @click="assignType = 'league'">A division</button>
          <button class="segmented__item" :class="{ 'is-active': assignType === 'nation' }" @click="assignType = 'nation'">A country</button>
          <button class="segmented__item" :class="{ 'is-active': assignType === 'position' }" @click="assignType = 'position'">A position</button>
        </div>
      </div>

      <div v-if="assignType === 'league'" class="field">
        <label class="field__label">Division</label>
        <select v-model="targetId" class="select">
          <option v-for="l in leagues" :key="l.id" :value="l.id">
            {{ store.game?.nations[l.nationId]?.code }} — {{ l.name }}
          </option>
        </select>
      </div>

      <div v-else-if="assignType === 'nation'" class="field">
        <label class="field__label">Country</label>
        <select v-model="targetId" class="select">
          <option v-for="n in nations" :key="n.id" :value="n.id">{{ n.name }}</option>
        </select>
      </div>

      <div v-else class="field">
        <label class="field__label">Position</label>
        <select v-model="positionTarget" class="select">
          <option v-for="p in ['GK','DC','DL','DR','DM','MC','ML','MR','AM','ST']" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>

      <div class="field">
        <label class="field__label">Minimum standard — {{ minAbility }}</label>
        <input v-model.number="minAbility" class="slider" type="range" min="40" max="180" step="5" />
        <div class="field__hint">
          Set this too high and he will file nothing. Too low and he will waste months on players
          you would never sign.
        </div>
      </div>

      <div class="field">
        <label class="field__label">Maximum age — {{ maxAge }}</label>
        <input v-model.number="maxAge" class="slider" type="range" min="17" max="38" />
      </div>

      <template #footer>
        <button class="btn btn--primary btn--block" @click="apply">Send him out</button>
        <button
          v-if="editing.assignment"
          class="btn btn--ghost btn--block"
          @click="recall"
        >Call him back — no brief</button>
      </template>
    </AppSheet>
  </div>
</template>
