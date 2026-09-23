<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import PosBadge from '../components/PosBadge.vue'
import PersonFace from '../components/PersonFace.vue'
import MeterBar from '../components/MeterBar.vue'
import AppDocument from '../components/AppDocument.vue'
import { formatWage } from '../../engine/systems/valuation'
import { NON_HOMEGROWN_LIMIT, SQUAD_LIMIT } from '../../engine/systems/registration'
import { underEmbargo } from '../../engine/systems/regulation'
import type { Player } from '../../engine/types'
import { listName } from '../playerName'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const view = computed(() => store.registration)
const open = computed(() => store.registrationOpen)
const nationAdjective = computed(() => store.nation?.adjective ?? 'homegrown')

/**
 * Who the list is filed with, and when.
 *
 * A squad list is not a control panel, it is a document lodged with the
 * competition — the engine has always treated it as one, freezing it the week
 * the window shuts and leaving an injury in February as a problem you solve
 * from what you already named. The screen said so in a paragraph at the
 * bottom. Now the form says it: an author, a date, and a status that can read
 * "lodged", which is the one thing a live panel can never say about itself.
 */
const filedWith = computed(() => store.league?.name ?? 'The League')
const filed = computed(() => {
  const d = store.game?.date
  return d ? `WEEK ${d.week} · ${d.season}/${String((d.season + 1) % 100).padStart(2, '0')}` : ''
})

type Tab = 'list' | 'omitted' | 'exempt'
const tab = ref<Tab>('list')

const byAbility = (a: Player, b: Player) => b.currentAbility - a.currentAbility

const omitted = computed(() => (view.value?.unregistered ?? []).slice().sort(byAbility))
const exempt = computed(() => (view.value?.exempt ?? []).slice().sort(byAbility))
const named = computed(() => (view.value?.registered ?? []).slice().sort(byAbility))

/** The strongest player currently left out — the headline cost of the list. */
const bestOmitted = computed(() => omitted.value[0] ?? null)

const embargoed = computed(() => (store.club ? underEmbargo(store.club) : false))

function add(player: Player) {
  const result = store.register(player.id)
  // Only the refusal needs saying. A successful registration shows itself:
  // the player moves from one list to the other in front of you.
  if (!result.ok) notify?.(result.message ?? 'He cannot be registered.', 'error')
}

function remove(player: Player) {
  const result = store.unregister(player.id)
  if (!result.ok) notify?.(result.message ?? 'He cannot be removed.', 'error')
}

function autoPick() {
  store.autoPickSquad()
}
</script>

<template>
  <div v-if="view">
    <div class="card">
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Places</div>
          <div class="stat__value">{{ view.placesUsed }}<span class="faint">/{{ SQUAD_LIMIT }}</span></div>
        </div>
        <div class="stat">
          <div class="stat__label">{{ nationAdjective }}-trained</div>
          <div class="stat__value">{{ view.homegrown }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Trained abroad</div>
          <div class="stat__value" :class="{ 'stat__value--warn': view.nonHomegrownFree === 0 }">
            {{ view.nonHomegrown }}<span class="faint">/{{ NON_HOMEGROWN_LIMIT }}</span>
          </div>
        </div>
      </div>
      <div class="card__body">
        <div class="row row--between" style="margin-bottom: 5px">
          <span class="small muted">Foreign-trained places used</span>
          <span class="small num">{{ view.nonHomegrownFree }} left</span>
        </div>
        <MeterBar :value="view.nonHomegrown" :max="NON_HOMEGROWN_LIMIT" invert />
      </div>
    </div>

    <div class="card">
      <div class="card__body">
        <AppDocument
          :author="filedWith"
          :filed="filed"
          stamp="Squad list, as lodged"
          :status="open ? 'THE WINDOW IS OPEN' : 'LODGED — CANNOT BE CHANGED'"
          :status-warn="!open"
          style="margin-bottom: 10px"
        />
        <p class="small" style="margin: 0 0 6px">
          You may name {{ SQUAD_LIMIT }} senior players, of whom at most
          {{ NON_HOMEGROWN_LIMIT }} may have been trained outside the country. Anyone
          under 21 plays without taking a place. A senior player left off the list
          cannot be selected at all until the window reopens.
        </p>
        <p v-if="open" class="tiny muted" style="margin: 0">
          It can still be amended until the window shuts.
        </p>
        <p v-else class="tiny" style="margin: 0; color: var(--warn)">
          Nothing on it can be changed until the window reopens. A list is superseded, not
          edited.
        </p>
      </div>
    </div>

    <div
      v-if="embargoed"
      class="card"
      style="background: var(--danger-wash)"
    >
      <div class="card__body">
        <div class="bold small" style="color: var(--danger)">Registration embargo in force</div>
        <div class="tiny muted">
          The club breached the squad-cost rules. Anyone signed since cannot be added to
          this list, however much you paid for him.
        </div>
      </div>
    </div>

    <div
      v-if="bestOmitted"
      class="card"
      style="background: var(--danger-wash)"
    >
      <div class="card__body">
        <div class="bold small" style="color: var(--danger)">
          {{ omitted.length }} senior player{{ omitted.length === 1 ? '' : 's' }} unavailable
        </div>
        <div class="tiny muted">
          {{ bestOmitted.knownAs }} is the best of them, and he cannot be picked while he is
          off the list.
        </div>
      </div>
    </div>

    <div class="segmented mb">
      <button class="segmented__item" :class="{ 'is-active': tab === 'list' }" @click="tab = 'list'">
        Squad list ({{ named.length }})
      </button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'omitted' }" @click="tab = 'omitted'">
        Left out ({{ omitted.length }})
      </button>
      <button class="segmented__item" :class="{ 'is-active': tab === 'exempt' }" @click="tab = 'exempt'">
        Under 21 ({{ exempt.length }})
      </button>
    </div>

    <div class="card">
      <div class="list">
        <div
          v-for="p in (tab === 'list' ? named : tab === 'omitted' ? omitted : exempt)"
          :key="p.id"
          class="list__row list__row--static"
        >
          <span class="row-face">
              <PersonFace :person="p" :club="store.club" :size="40" />
              <PosBadge :position="p.position" class="row-face__pos" />
            </span>
          <div class="list__main">
            <div class="list__primary">
              {{ listName(p) }}
              <span
                v-if="tab !== 'exempt'"
                class="chip"
                :class="store.isHomegrown(p.id) ? 'chip--accent' : 'chip--info'"
              >{{ store.isHomegrown(p.id) ? 'Homegrown' : 'Abroad' }}</span>
            </div>
            <div class="list__secondary num">
              {{ p.age }} · {{ formatWage(p.contract?.wage ?? 0, store.currency) }}/wk
              <span v-if="tab === 'exempt'"> · eligible without a place</span>
            </div>
          </div>
          <button
            v-if="tab === 'list' && open"
            class="btn btn--ghost btn--sm"
            @click="remove(p)"
          >Remove</button>
          <button
            v-else-if="tab === 'omitted' && open"
            class="btn btn--sm"
            @click="add(p)"
          >Register</button>
        </div>
        <div v-if="tab === 'omitted' && omitted.length === 0" class="empty">
          Everyone who needs a place has one.
        </div>
        <div v-if="tab === 'exempt' && exempt.length === 0" class="empty">
          No under-21s at the club.
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button class="btn btn--ghost" :disabled="!open" @click="autoPick()">
        Let the secretary pick
      </button>
    </div>
  </div>
  <div v-else class="empty">No squad to register.</div>
</template>
