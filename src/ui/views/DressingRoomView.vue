<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import {
  readRoom, renewalAppetite, roomLabel, roomMeter, roomSummary,
} from '../../engine/systems/dressingRoom'
import MeterBar from '../components/MeterBar.vue'
import Chevron from '../components/Chevron.vue'
import { listName } from '../playerName'

/**
 * The room.
 *
 * Information and consequences, never man-management. There is nothing to
 * press here that speaks to a player — the only actions this screen leads to
 * are the ones a director actually has, and they all live somewhere else: sell
 * him, do not renew him, sign a different sort of professional, or deal with
 * the coach.
 */
const store = useGameStore()
const router = useRouter()

const room = computed(() => {
  const s = store.game
  const club = store.club
  return s && club ? readRoom(s, club) : null
})

/** The tone on a 0-100 meter. The scale lives with the labels, not here. */
const meter = computed(() => (room.value ? roomMeter(room.value.tone) : 50))

const renewalEffect = computed(() => {
  if (!room.value) return 0
  return Math.round((renewalAppetite(room.value.tone) - 1) * 100)
})
</script>

<template>
  <div v-if="room && store.club">
    <div class="section-title">The room</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Atmosphere</span>
          <span class="bold">{{ roomLabel(room.tone) }}</span>
        </div>
        <MeterBar :value="meter" :max="100" />
        <p class="small" style="margin: 0">{{ roomSummary(room) }}</p>
        <p v-if="renewalEffect !== 0" class="small" style="margin: 0"
           :class="renewalEffect > 0 ? '' : 'neg-val'">
          <template v-if="renewalEffect > 0">
            Players are about {{ renewalEffect }}% easier to re-sign than the money alone
            would suggest.
          </template>
          <template v-else>
            Players want about {{ -renewalEffect }}% more than the money alone would
            suggest before they will re-sign. A squad nobody wants to be in is a squad
            nobody re-signs for.
          </template>
        </p>
      </div>
    </div>

    <template v-if="room.setters.length">
      <div class="section-title">Setting the standard</div>
      <div class="card">
        <div class="list">
          <button
            v-for="row in room.setters.slice(0, 5)"
            :key="row.player.id"
            class="list__row"
            @click="router.push(`/player/${row.player.id}`)"
          >
            <div class="list__main">
              <div class="list__primary">{{ listName(row.player) }}</div>
              <div class="list__secondary num">
                {{ row.player.position }} · {{ row.player.age }} ·
                {{ row.player.traits.join(', ').toUpperCase() || 'NO TRAITS' }}
              </div>
            </div>
            <span class="list__value pos-val num">+{{ row.influence.toFixed(1) }}</span>
            <Chevron />
          </button>
        </div>
      </div>
    </template>

    <template v-if="room.draggers.length">
      <div class="section-title">Dragging it down</div>
      <div class="card">
        <div class="list">
          <button
            v-for="row in room.draggers.slice(0, 5)"
            :key="row.player.id"
            class="list__row"
            @click="router.push(`/player/${row.player.id}`)"
          >
            <div class="list__main">
              <div class="list__primary">{{ listName(row.player) }}</div>
              <div class="list__secondary num">
                {{ row.player.position }} · {{ row.player.age }} ·
                {{ row.player.traits.join(', ').toUpperCase() || 'NO TRAITS' }}
              </div>
            </div>
            <span class="list__value neg-val num">{{ row.influence.toFixed(1) }}</span>
            <Chevron />
          </button>
        </div>
      </div>
    </template>

    <div v-if="!room.setters.length && !room.draggers.length" class="card">
      <div class="empty">Nobody in this squad sets the tone, for better or worse.</div>
    </div>

    <p class="tiny faint center mt">
      Nothing on this screen is something you say to a player. What you can do
      about a room is sell someone, decline to renew someone, sign a different
      kind of professional, or deal with the head coach.
    </p>
  </div>
</template>
