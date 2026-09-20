<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import {
  influenceWord, readRoom, renewalAppetite, roomLabel, roomMeter, roomSummary,
} from '../../engine/systems/dressingRoom'
import MeterBar from '../components/MeterBar.vue'
import Chevron from '../components/Chevron.vue'
import { listName } from '../playerName'
import { onARun, runWord } from '../../engine/systems/snub'

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

/**
 * The men who have not been picked, and for how long.
 *
 * The room is a consequence of decisions, and this is the decision the
 * director did not make: somebody else picked the side, and these are the
 * players paying for it. They belong here rather than on the squad list,
 * because a run of omissions is a fact about the room rather than about any
 * one player's numbers.
 */
const snubbed = computed(() => {
  const s = store.game
  const club = store.club
  return s && club ? onARun(s, club).slice(0, 5) : []
})

/**
 * Morale in words, for the same reason the influence figures are words: this
 * screen is a person telling you about the room, and a person does not quote
 * you a number out of a hundred.
 */
function moraleWord(morale: number): string {
  if (morale >= 70) return 'taking it well'
  if (morale >= 50) return 'not happy'
  if (morale >= 30) return 'unhappy'
  return 'finished with it'
}

/** The tone on a 0-100 meter. The scale lives with the labels, not here. */
const meter = computed(() => (room.value ? roomMeter(room.value.tone) : 50))

/**
 * Whoever is telling you. The head coach if there is one, since he is in there
 * daily and already has a voice in this game; the player liaison otherwise,
 * which is the role the inbox already sends this kind of message under.
 */
const liaison = computed(() => store.headCoach?.knownAs ?? 'Player Liaison')

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
        <!-- Attributed, because there is no document in football called "the
             dressing room" and nobody reads a room off a dashboard. Somebody
             who is in there every day tells you about it. -->
        <div class="room__from num">{{ liaison }} · THIS WEEK</div>
        <p class="room__read">{{ roomSummary(room) }}</p>
        <div class="row row--between">
          <span class="small muted">Atmosphere</span>
          <span class="bold">{{ roomLabel(room.tone) }}</span>
        </div>
        <MeterBar :value="meter" :max="100" />
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
      <div class="section-title">Who he says is setting it</div>
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
            <span class="list__value pos-val">{{ influenceWord(row.influence) }}</span>
            <Chevron />
          </button>
        </div>
      </div>
    </template>

    <template v-if="snubbed.length">
      <div class="section-title">Not being picked</div>
      <div class="card">
        <div class="list">
          <button
            v-for="p in snubbed"
            :key="p.id"
            class="list__row"
            @click="router.push(`/player/${p.id}`)"
          >
            <div class="list__main">
              <div class="list__primary">{{ listName(p) }}</div>
              <div class="list__secondary num">
                {{ p.position }} · {{ p.age }} · {{ moraleWord(p.morale).toUpperCase() }}
              </div>
            </div>
            <span class="list__value neg-val">{{ runWord(p.snubbedRun ?? 0) }}</span>
            <Chevron />
          </button>
        </div>
      </div>
      <p class="small muted" style="padding: 0 var(--pad)">
        The coach picks the team. A man with a claim on the side who keeps watching it from
        the bench is a man whose morale, and whose value, you are spending.
      </p>
    </template>

    <template v-if="room.draggers.length">
      <div class="section-title">And who is not</div>
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
            <span class="list__value neg-val">{{ influenceWord(row.influence) }}</span>
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
