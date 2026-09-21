<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import type { VerdictKind } from '../../engine/systems/successor'

/**
 * What became of them.
 *
 * The verdicts arrive one at a time in the inbox, a season apart, which is the
 * right way to *receive* them and a bad way to hold them: by the time there
 * are six they are scattered across five years of messages. This is the page
 * they collect on.
 *
 * It is deliberately a record rather than a dashboard. No totals, no "transfer
 * success rate", no grade. The game's whole argument is that you decided under
 * fog and the answer arrived years later, and scoring that out of ten would
 * turn a set of consequences into a report card.
 */
const store = useGameStore()
const router = useRouter()

const verdicts = computed(() => store.verdicts)
const currency = computed(() => store.currency)

const KIND_LABEL: Record<VerdictKind, string> = {
  soldAtLoss: 'Sold at a loss',
  sold: 'Sold on',
  released: 'Released',
  retired: 'Retired',
  thriving: 'Moved up',
  stillThere: 'Still there',
}

const KIND_CLASS: Record<VerdictKind, string> = {
  soldAtLoss: 'chip--danger',
  sold: '',
  released: 'chip--warn',
  retired: '',
  thriving: 'chip--accent',
  stillThere: 'chip--info',
}

/** Grouped by the club you signed them for, newest spell first. */
const byClub = computed(() => {
  const groups = new Map<string, { clubName: string; items: typeof verdicts.value }>()
  for (const verdict of verdicts.value) {
    const group = groups.get(verdict.clubId)
      ?? { clubName: verdict.clubName, items: [] as typeof verdicts.value }
    group.items.push(verdict)
    groups.set(verdict.clubId, group)
  }
  return [...groups.values()]
})

function open(playerId: string): void {
  if (store.player(playerId)) router.push(`/player/${playerId}`)
}
</script>

<template>
  <div>
    <div v-if="!verdicts.length" class="card">
      <div class="card__body">
        <p class="small muted" style="margin: 0">
          Nothing yet. Once you have left a club, you start hearing what
          happened to the players you bought for it.
        </p>
      </div>
    </div>

    <template v-for="group in byClub" :key="group.clubName">
      <div class="section-title">{{ group.clubName }}</div>
      <div class="card">
        <div class="list">
          <button
            v-for="verdict in group.items"
            :key="verdict.playerId"
            class="list__row"
            style="width: 100%; text-align: left"
            @click="open(verdict.playerId)"
          >
            <div class="list__main">
              <div class="list__primary">
                {{ verdict.playerName }}
                <span class="chip" :class="KIND_CLASS[verdict.kind]">
                  {{ KIND_LABEL[verdict.kind] }}
                </span>
              </div>
              <div class="list__secondary" style="white-space: normal">{{ verdict.line }}</div>
            </div>
            <div class="mono tiny faint" style="text-align: right; flex-shrink: 0">
              <div>{{ formatMoney(verdict.paid, currency) }}</div>
              <div>{{ verdict.signedSeason }}</div>
            </div>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
