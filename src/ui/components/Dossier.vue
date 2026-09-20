<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from './MeterBar.vue'
import AppDocument from './AppDocument.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import type { ScoutReport } from '../../engine/types'

/**
 * A scout report, as the document it is.
 *
 * The register this belongs to is not "a person talking to you" — a scout does
 * not chat, he files. So it has a letterhead, it is dated, it is signed, it
 * cannot be replied to, and it carries a revision number.
 *
 * The revision is the part that changes what the reader understands rather
 * than how it looks. A range on its own says nothing about how it was arrived
 * at; the same range on a third report, narrower than the second, says that
 * weeks of a scout's time bought it. That is the whole economy of scouting and
 * the UI used to throw it away every time a report was replaced.
 */

const props = defineProps<{ report: ScoutReport }>()

const store = useGameStore()

const scout = computed(() => store.staffById(props.report.scoutId))

/** Who filed it. A document has an author, and an unfilled post still has a desk. */
const author = computed(() => scout.value?.knownAs ?? 'Scouting Department')

const filed = computed(() => `WEEK ${props.report.weekFiled} · ${props.report.seasonFiled}`)

const ordinal = computed(() => {
  const n = props.report.revision
  const suffix = n % 100 >= 11 && n % 100 <= 13
    ? 'th'
    : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
})

/**
 * What changed since the last look.
 *
 * Only shown when a previous revision exists and the range actually moved.
 * "Unchanged since the second report" is worth saying — it means a week of
 * watching taught the scout nothing — but saying it about a first report is
 * saying nothing at all.
 */
const change = computed(() => {
  const previous = props.report.previousAbilityRange
  if (!previous) return null
  const [lo, hi] = props.report.abilityRange
  const width = hi - lo
  const was = previous[1] - previous[0]
  const from = `${Math.round(previous[0])}–${Math.round(previous[1])}`
  if (Math.round(width) < Math.round(was)) return { label: 'NARROWED FROM', from }
  if (Math.round(width) > Math.round(was)) return { label: 'WIDENED FROM', from }
  return { label: 'UNCHANGED FROM', from }
})

const range = computed(() => {
  const [lo, hi] = props.report.abilityRange
  return `${Math.round(lo)}–${Math.round(hi)}`
})
</script>

<template>
  <AppDocument
    class="dossier"
    :author="author"
    :filed="filed"
    :stamp="`${ordinal} report`"
    :status="report.stale ? 'DUE A FRESH LOOK' : undefined"
    status-warn
  >
    <p class="dossier__verdict">{{ report.verdict }}</p>

    <div class="dossier__reading">
      <div class="row row--between small">
        <span class="muted">Ability, as reported</span>
        <span class="num bold">{{ range }}</span>
      </div>
      <!-- The line the revision number exists for. -->
      <div v-if="change" class="dossier__change num">
        {{ change.label }} {{ change.from }}
      </div>
    </div>

    <div class="row row--between small">
      <span class="muted">Estimated fee</span>
      <span class="num">
        {{ formatMoney(report.estimatedFee[0], store.currency) }}–{{ formatMoney(report.estimatedFee[1], store.currency) }}
      </span>
    </div>
    <div class="row row--between small">
      <span class="muted">Estimated wage</span>
      <span class="num">
        {{ formatWage(report.estimatedWage[0], store.currency) }}–{{ formatWage(report.estimatedWage[1], store.currency) }}/wk
      </span>
    </div>

    <div class="mt">
      <div class="row row--between" style="margin-bottom: 4px">
        <span class="small muted">Recommendation</span>
        <span class="small num">{{ report.recommendation }}/100</span>
      </div>
      <MeterBar :value="report.recommendation" />
    </div>
  </AppDocument>
</template>
