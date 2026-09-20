<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { formatMoney } from '../../engine/systems/valuation'
import {
  DATA_REFRESH_WEEKS, modelNoise, requiredEdgeFraction, shortlistSize,
} from '../../engine/systems/dataDepartment'
import { philosophyOf } from '../../engine/systems/recruitment'
import MeterBar from '../components/MeterBar.vue'
import AppDocument from '../components/AppDocument.vue'
import Chevron from '../components/Chevron.vue'
import { listName } from '../playerName'

/**
 * What the model thinks.
 *
 * An edge, not an answer. Every row says what the market wants, what the model
 * thinks he is worth, and how far the department stands behind it — and the
 * confidence figure is the one that matters, because a badly funded department
 * is not a quiet one, it is a wrong one.
 */
const store = useGameStore()
const router = useRouter()

const level = computed(() => store.club?.facilities.dataDepartment ?? 1)

const findings = computed(() =>
  (store.game?.dataFindings ?? [])
    .map((finding) => {
      const player = store.player(finding.playerId)
      if (!player) return null
      const club = player.clubId ? store.clubById(player.clubId) : null
      return {
        finding,
        player,
        clubName: club?.name ?? 'Free agent',
        edge: finding.modelValue - finding.marketValue,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null))

/**
 * When the model last ran, and how long ago that was.
 *
 * It runs every four weeks. Until now the screen presented its output as
 * though it were true this morning, which is the difference between a
 * document and a dashboard: a dashboard is current by definition, a report is
 * current as of the day it was filed. The engine has always stamped each
 * finding with the week it was made and the UI threw it away.
 */
const run = computed(() => {
  const s = store.game
  const latest = (s?.dataFindings ?? []).reduce<{ week: number; season: number } | null>(
    (best, f) => (!best || f.season > best.season || (f.season === best.season && f.week > best.week)
      ? { week: f.week, season: f.season }
      : best),
    null,
  )
  if (!s || !latest) return null
  const weeksAgo = (s.date.season - latest.season) * 52 + (s.date.week - latest.week)
  return { ...latest, weeksAgo }
})

/**
 * What the market has done since the report was filed.
 *
 * The finding records what the selling club wanted *at the time*. Four weeks
 * later that number may have moved, and if it has moved up the edge the model
 * found may be gone — which is a thing the reader has to be told, because the
 * document itself cannot know it. This is the behavioural difference the
 * register is for: a document can be out of date, and this one says by how
 * much.
 */
function drift(finding: { playerId: string; marketValue: number; modelValue: number }) {
  const player = store.player(finding.playerId)
  if (!player) return null
  const now = player.value
  const moved = now - finding.marketValue
  // A few percent is the market breathing, not news.
  if (Math.abs(moved) < finding.marketValue * 0.08) return null
  const gone = now >= finding.modelValue
  return { now, moved, gone }
}

/** How wrong a department this size can be, said plainly. */
const errorBand = computed(() => Math.round(modelNoise(level.value) * 100))
/** The bar it has to clear before it will name anybody, at this size. */
const requiredEdge = computed(() => Math.round(requiredEdgeFraction(level.value) * 100))

function tone(confidence: number): string {
  if (confidence >= 0.6) return 'var(--accent)'
  if (confidence >= 0.35) return 'var(--warn)'
  return 'var(--danger)'
}
</script>

<template>
  <div v-if="store.club">
    <div class="section-title">The model</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Department</span>
          <span class="bold num">Level {{ level }} of 20</span>
        </div>
        <MeterBar :value="level" :max="20" />
        <p class="small muted" style="margin: 0">
          It runs every {{ DATA_REFRESH_WEEKS }} weeks and can carry
          {{ shortlistSize(level) }} names. Its valuations are out by about
          {{ errorBand }}% either way at this size, so it only speaks up when it
          sees an edge of {{ requiredEdge }}% or more — a smaller department says
          less rather than guessing. What it does say is usually right; what
          money buys is how much it sees.
        </p>
        <p class="small muted" style="margin: 0">
          It looks for players your policy would actually sign:
          <span class="bold">{{ philosophyOf(store.club).name.toLowerCase() }}</span>.
        </p>
      </div>
    </div>

    <div class="section-title">Underpriced, it reckons</div>
    <div class="card">
      <!-- The run, as the document it is: filed by a department, on a date,
           and superseded by the next one rather than updated in place. -->
      <div v-if="run" class="card__body" style="padding-bottom: 6px">
        <AppDocument
          author="Data Department"
          :filed="`WEEK ${run.week} · ${run.season}`"
          :stamp="run.weeksAgo <= 0 ? 'This week\u2019s run' : `Run ${run.weeksAgo} week${run.weeksAgo === 1 ? '' : 's'} ago`"
          :status="run.weeksAgo >= DATA_REFRESH_WEEKS ? 'A NEW RUN IS DUE' : undefined"
          status-warn
        />
      </div>
      <div v-if="findings.length === 0" class="empty">
        Nothing this run. The model does not invent names to fill a list.
      </div>
      <div v-else class="list">
        <button
          v-for="row in findings"
          :key="row.finding.playerId"
          class="list__row"
          @click="router.push(`/player/${row.player.id}`)"
        >
          <div class="list__main">
            <div class="list__primary">{{ listName(row.player) }}</div>
            <div class="list__secondary num">
              {{ row.player.position }} · {{ row.player.age }} · {{ row.clubName.toUpperCase() }}
            </div>
            <div class="small" style="white-space: normal; margin-top: 4px; color: var(--text-dim)">
              {{ row.finding.rationale }}
            </div>
            <div class="tiny num" style="margin-top: 4px">
              MARKET {{ formatMoney(row.finding.marketValue, store.currency) }}
              · MODEL {{ formatMoney(row.finding.modelValue, store.currency) }}
              · <span :style="{ color: tone(row.finding.confidence) }">
                {{ Math.round(row.finding.confidence * 100) }}% CONFIDENT
              </span>
            </div>
            <!-- The price the report quotes is the price on the day it was
                 filed. If it has moved since, the reader is the only one who
                 can know that — the document cannot. -->
            <div v-if="drift(row.finding)" class="doc__moved num">
              <template v-if="drift(row.finding)!.gone">
                MARKET HAS CAUGHT UP — {{ formatMoney(drift(row.finding)!.now, store.currency) }} NOW.
                THE EDGE IS GONE
              </template>
              <template v-else>
                MARKET NOW {{ formatMoney(drift(row.finding)!.now, store.currency) }},
                {{ drift(row.finding)!.moved > 0 ? 'UP' : 'DOWN' }} SINCE FILING
              </template>
            </div>
          </div>
          <Chevron />
        </button>
      </div>
    </div>

    <p class="tiny faint center mt">
      An edge is not a certainty. The further a player has to climb, the less
      anyone can promise — and no amount of investment changes that, only how
      honestly the department says so.
    </p>
  </div>
</template>
