<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { isAwayOnDuty } from '../../engine/systems/international'
import PosBadge from '../components/PosBadge.vue'
import MeterBar from '../components/MeterBar.vue'
import AppSheet from '../components/AppSheet.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS } from '../../engine/world/attributes'
import { formatRange, knowledgeLabel, starsForLeague } from '../../engine/systems/scouting'
import { SQUAD_STATUS_LABELS } from '../../engine/systems/morale'
import { suggestRenewal, type RenewalOffer } from '../../engine/systems/contracts'
import { injuryDescription } from '../../engine/systems/injuries'
import { loanSuitorsFor } from '../../engine/systems/loans'
import type { AttributeKey, Position, SquadStatus } from '../../engine/types'
import { fullName, nickname } from '../playerName'
import { clauseState, clauseUpside } from '../../engine/systems/buyBack'
import { U21_AGE } from '../../engine/systems/registration'

const route = useRoute()
const router = useRouter()
const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const player = computed(() => store.player(String(route.params.id)))
const isOurs = computed(() => player.value?.clubId === store.club?.id)
const currentClub = computed(() => (player.value?.clubId ? store.clubById(player.value.clubId) : null))
/**
 * A buy-back this club holds on him.
 *
 * Shown on his profile rather than on a screen of its own, because that is
 * where a director goes to think about a player, and a right you have to hunt
 * for is a right you will let lapse.
 */
const buyBack = computed(() => {
  const s = store.game
  const p = player.value
  if (!s || !p?.buyBack || p.buyBack.clubId !== store.club?.id) return null
  return {
    clause: p.buyBack,
    state: clauseState(p.buyBack, s.date.season),
    upside: clauseUpside(p),
  }
})

function buyBackNow() {
  const p = player.value
  if (!p) return
  const outcome = store.exerciseClause(p.id)
  notify?.(outcome.message, outcome.ok ? 'success' : 'error')
}

const report = computed(() => {
  const s = store.game
  const p = player.value
  return s && p ? s.scoutReports[p.id] ?? null : null
})

/**
 * What the player is allowed to see.
 *
 * Your own players train with your staff every day, so their attributes are
 * known. Everyone else is only ever a scout report — a range, not a number.
 * Potential stays uncertain either way, because nobody knows that.
 */
const knowsAttributes = computed(
  () => isOurs.value || store.game?.settings.revealTrueAttributes === true,
)

const abilityDisplay = computed(() => {
  const p = player.value
  if (!p) return '—'
  if (knowsAttributes.value) return String(Math.round(p.currentAbility))
  if (report.value) return formatRange(report.value.abilityRange)
  return 'Unscouted'
})

const potentialDisplay = computed(() => {
  const p = player.value
  if (!p) return '—'
  if (store.game?.settings.revealTrueAttributes) return String(Math.round(p.potentialAbility))
  if (report.value) return formatRange(report.value.potentialRange)
  if (isOurs.value) {
    // Your own coaching staff give a band, not a figure.
    const spread = p.age <= 21 ? 22 : 10
    return `${Math.max(1, Math.round(p.potentialAbility - spread))}-${Math.min(200, Math.round(p.potentialAbility + spread))}`
  }
  return 'Unknown'
})

const stars = computed(() => {
  const p = player.value
  const l = store.league
  if (!p || !l) return 0
  const ability = knowsAttributes.value
    ? p.currentAbility
    : report.value
      ? (report.value.abilityRange[0] + report.value.abilityRange[1]) / 2
      : 0
  return ability > 0 ? starsForLeague(ability, l.reputation) : 0
})

function attributeDisplay(key: AttributeKey): string {
  const p = player.value
  if (!p) return '—'
  if (knowsAttributes.value) return String(p.attributes[key])
  const estimate = report.value?.attributeEstimates[key]
  if (!estimate) return '?'
  return estimate[0] === estimate[1] ? String(estimate[0]) : `${estimate[0]}–${estimate[1]}`
}

function attributeWidth(key: AttributeKey): number {
  const p = player.value
  if (!p) return 0
  if (knowsAttributes.value) return (p.attributes[key] / 20) * 100
  const estimate = report.value?.attributeEstimates[key]
  if (!estimate) return 0
  return ((estimate[0] + estimate[1]) / 2 / 20) * 100
}

const visibleGroups = computed(() =>
  ATTRIBUTE_GROUPS.filter((g) =>
    g.label === 'Goalkeeping' ? player.value?.position === 'GK' : player.value?.position !== 'GK',
  ),
)

const avgRating = computed(() => {
  const st = player.value?.stats
  return st && st.appearances > 0 ? (st.ratingSum / st.appearances).toFixed(2) : '—'
})

const contractYears = computed(() => {
  const s = store.game
  const p = player.value
  if (!s || !p?.contract) return null
  return p.contract.expiresSeason - s.date.season
})

// --- Renewal sheet ---------------------------------------------------------
const renewOpen = ref(false)
const offer = ref<RenewalOffer | null>(null)
const renewMessage = ref('')

function openRenewal() {
  const s = store.game
  const c = store.club
  const p = player.value
  if (!s || !c || !p) return
  offer.value = suggestRenewal(s, c, p)
  renewMessage.value = ''
  renewOpen.value = true
}

function submitRenewal() {
  const p = player.value
  if (!p || !offer.value) return
  const response = store.renew(p.id, offer.value)
  renewMessage.value = response.message
  if (response.accepted) {
    notify?.(`${p.knownAs} has signed.`, 'success')
    renewOpen.value = false
  } else if (response.counter) {
    offer.value = response.counter
  }
}

// --- Loan sheets -----------------------------------------------------------
const loanOutOpen = ref(false)
const loanInOpen = ref(false)
const wageShare = ref(0.5)
const loanSeasons = ref(1)
const chosenSuitor = ref<string | null>(null)

const suitors = computed(() => {
  const s = store.game
  const p = player.value
  if (!s || !p) return []
  return loanSuitorsFor(s, p)
})

const PLAYING_TIME_LABELS: Record<string, string> = {
  starter: 'Would start',
  rotation: 'In and out of the side',
  squad: 'Squad player at best',
}

function openLoanOut() {
  chosenSuitor.value = suitors.value[0]?.club.id ?? null
  wageShare.value = 0.5
  loanSeasons.value = 1
  loanOutOpen.value = true
}

function submitLoanOut() {
  const p = player.value
  if (!p || !chosenSuitor.value) return
  const result = store.loanOut(p.id, chosenSuitor.value, wageShare.value, loanSeasons.value)
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) loanOutOpen.value = false
}

function submitLoanIn() {
  const p = player.value
  if (!p) return
  const result = store.loanIn(p.id, wageShare.value)
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) {
    loanInOpen.value = false
    router.push('/squad')
  }
}

function doRecall() {
  const p = player.value
  if (!p) return
  const result = store.recall(p.id)
  notify?.(result.message, result.ok ? 'success' : 'error')
}

// --- Bid sheet -------------------------------------------------------------
const bidOpen = ref(false)
const bidAmount = ref(0)

function openBid() {
  const p = player.value
  if (!p) return
  const estimate = report.value?.estimatedFee[1] ?? p.value * 1.3
  bidAmount.value = Math.round(estimate / 10_000) * 10_000
  bidOpen.value = true
}

function submitBid() {
  const p = player.value
  if (!p) return
  const result = store.bid(p.id, bidAmount.value)
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) {
    bidOpen.value = false
    router.push('/transfers')
  }
}

const statuses: SquadStatus[] = ['star', 'firstTeam', 'rotation', 'backup', 'prospect', 'surplus']

function setStatus(status: SquadStatus) {
  const p = player.value
  if (!p) return
  store.setSquadStatus(p.id, status)
}

function doRelease() {
  const p = player.value
  if (!p) return
  const result = store.release(p.id)
  notify?.(result.message, result.ok ? 'success' : 'error')
  if (result.ok) router.back()
}

/**
 * Back to the academy.
 *
 * Only offered where it is allowed and where it is the point: a senior player
 * still young enough to go back, whose squad place is worth more to somebody
 * else than his development is to you.
 */
const canDemote = computed(() => {
  const p = player.value
  return Boolean(isOurs.value && p && !p.isAcademy && p.age <= U21_AGE)
})

function doDemote() {
  const p = player.value
  if (!p) return
  notifyResult(store.demote(p.id))
}

/**
 * Retraining, and the positions worth offering him.
 *
 * Goalkeeping is excluded in both directions — it is a different job — and
 * the list leads with the roles next to the one he already plays, because
 * those are the conversions that keep most of the player.
 */
const retrainOpen = ref(false)
const retrainTo = ref<Position | ''>('')

const OUTFIELD: Position[] = ['DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST']

const retrainOptions = computed<Position[]>(() => {
  const p = player.value
  if (!p || p.position === 'GK') return []
  const adjacent = new Set(p.altPositions)
  return OUTFIELD
    .filter((pos) => pos !== p.position)
    .sort((a, b) => Number(adjacent.has(b)) - Number(adjacent.has(a)))
})

function notifyResult(result: { ok: boolean; message: string }) {
  notify?.(result.message, result.ok ? 'success' : 'error')
}

function doRetrain() {
  const p = player.value
  const to = retrainTo.value
  if (!p || !to) return
  notifyResult(store.retrain(p.id, to))
  retrainOpen.value = false
  retrainTo.value = ''
}

/**
 * His international standing, in the two forms a director cares about: how
 * many times his country has picked him, and whether the market is currently
 * paying for a summer he had. The second is the number that decides whether
 * now is the moment to sell, and it is shown as a fading thing rather than a
 * badge because that is what it is.
 */
const awayNow = computed(() => {
  const s = store.game
  return Boolean(s && player.value && isAwayOnDuty(player.value, s.date.week))
})

const internationalLine = computed(() => {
  const p = player.value
  if (!p) return null
  const caps = p.caps ?? 0
  const stock = p.tournamentStock ?? 0
  if (!caps && !stock) return null
  const bits: string[] = []
  if (caps) {
    const nation = store.game?.nations[p.nationalityId]?.name ?? 'his country'
    bits.push(`${caps} cap${caps === 1 ? '' : 's'} for ${nation}`)
  }
  if (stock >= 0.02) bits.push(`priced up ${Math.round(stock * 100)}% on his tournament`)
  return bits.join(' · ')
})
</script>

<template>
  <div v-if="player">
    <!-- Identity -->
    <div class="card">
      <div class="card__body">
        <div class="row" style="gap: 12px">
          <PosBadge :position="player.position" />
          <div class="grow">
            <h1 style="font-size: 1.2rem">{{ fullName(player) }}</h1>
            <div class="small muted">
              <!-- The nickname only when it is a real one. A profile that
                   solemnly reports Bruno Fernandes is known as "Bruno
                   Fernandes" is noise wearing the clothes of detail. -->
              <template v-if="nickname(player)">“{{ nickname(player) }}” · </template>
              {{ player.age }}y · {{ store.game?.nations[player.nationalityId]?.name }}
            </div>
            <div class="tiny faint">
              {{ currentClub?.name ?? 'Free agent' }}
              <template v-if="player.altPositions.length">
                · also {{ player.altPositions.join(', ') }}
              </template>
            </div>
          </div>
        </div>

        <div v-if="player.injury" class="chip chip--danger mt">
          {{ injuryDescription(player.injury) }}
        </div>
        <div v-if="awayNow" class="chip chip--warn mt">
          Away with {{ store.game?.nations[player.nationalityId]?.name }}
        </div>
        <div v-if="internationalLine" class="chip chip--info mt">
          {{ internationalLine }}
        </div>
        <div v-if="player.loanClubId" class="chip chip--info mt">
          On loan at {{ store.clubById(player.loanClubId)?.name }}
          <template v-if="player.loanWageShare > 0">
            — you cover {{ Math.round(player.loanWageShare * 100) }}% of his wage
          </template>
        </div>
        <div v-if="player.traits.length" class="chip-row mt">
          <span v-for="t in player.traits" :key="t" class="chip">{{ t.replace(/([A-Z])/g, ' $1').toLowerCase() }}</span>
        </div>
      </div>

      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Ability</div>
          <div class="stat__value stat__value--sm">{{ abilityDisplay }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Potential</div>
          <div class="stat__value stat__value--sm">{{ potentialDisplay }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">For this level</div>
          <div class="stat__value stat__value--sm">{{ stars ? `${stars}★` : '—' }}</div>
        </div>
      </div>
    </div>

    <!-- Scout report for players who are not ours -->
    <div v-if="!isOurs" class="card">
      <div class="card__head">
        <span class="card__title">Scout report</span>
        <span class="chip" :class="report ? 'chip--info' : ''">
          {{ report ? knowledgeLabel(report.knowledge) : 'Not scouted' }}
        </span>
      </div>
      <div class="card__body">
        <template v-if="report">
          <p class="small">{{ report.verdict }}</p>
          <div v-if="report.stale" class="chip chip--warn mb">Report is out of date</div>
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
        </template>
        <p v-else class="small muted">
          Your scouts have not watched this player. Send one to build a picture before committing money.
        </p>
      </div>
    </div>

    <!-- Attributes -->
    <div v-if="knowsAttributes || report?.attributeEstimates" class="card">
      <div class="card__head"><span class="card__title">Attributes</span></div>
      <div class="card__body">
        <div v-for="group in visibleGroups" :key="group.label" class="mb">
          <div class="tiny faint bold" style="text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px">
            {{ group.label }}
          </div>
          <div v-for="key in group.keys" :key="key" class="row" style="gap: 8px; margin-bottom: 4px">
            <span class="small muted" style="width: 92px; flex: 0 0 auto">{{ ATTRIBUTE_LABELS[key] }}</span>
            <div class="grow"><MeterBar :value="attributeWidth(key)" :semantic="false" /></div>
            <span class="tiny num" style="width: 44px; text-align: right">{{ attributeDisplay(key) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Condition -->
    <div v-if="isOurs" class="card">
      <div class="card__head"><span class="card__title">Condition</span></div>
      <div class="card__body stack">
        <div>
          <div class="row row--between"><span class="small muted">Morale</span><span class="small num">{{ Math.round(player.morale) }}</span></div>
          <MeterBar :value="player.morale" />
        </div>
        <div>
          <div class="row row--between"><span class="small muted">Form</span><span class="small num">{{ Math.round(player.form) }}</span></div>
          <MeterBar :value="player.form" />
        </div>
        <div>
          <div class="row row--between"><span class="small muted">Match fitness</span><span class="small num">{{ Math.round(player.fitness) }}</span></div>
          <MeterBar :value="player.fitness" />
        </div>
        <div>
          <div class="row row--between"><span class="small muted">Injury risk</span><span class="small num">{{ Math.round(player.injuryProneness) }}</span></div>
          <MeterBar :value="player.injuryProneness" invert />
        </div>
      </div>
    </div>

    <!-- Contract -->
    <div class="card">
      <div class="card__head"><span class="card__title">Contract & value</span></div>
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Market value</span>
          <span class="bold num">{{ formatMoney(player.value, store.currency) }}</span>
        </div>
        <div v-if="player.contract" class="row row--between">
          <span class="small muted">Wage</span>
          <span class="bold num">{{ formatWage(player.contract.wage, store.currency) }}/wk</span>
        </div>
        <div v-if="contractYears !== null" class="row row--between">
          <span class="small muted">Expires</span>
          <span class="bold num" :class="contractYears <= 0 ? 'neg-val' : contractYears === 1 ? '' : ''">
            {{ contractYears <= 0 ? 'End of this season' : `${contractYears} season${contractYears === 1 ? '' : 's'}` }}
          </span>
        </div>
        <div v-if="player.contract?.releaseClause" class="row row--between">
          <span class="small muted">Release clause</span>
          <span class="num">{{ formatMoney(player.contract.releaseClause, store.currency) }}</span>
        </div>
        <div v-if="isOurs" class="row row--between">
          <span class="small muted">Squad role</span>
          <span class="chip">{{ SQUAD_STATUS_LABELS[player.squadStatus] }}</span>
        </div>
      </div>
    </div>

    <!-- A buy-back we hold on a player who is somebody else's now -->
    <div v-if="buyBack" class="card">
      <div class="card__head"><span class="card__title">Our buy-back</span></div>
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">We can buy him back for</span>
          <span class="bold num">{{ formatMoney(buyBack.clause.price, store.currency) }}</span>
        </div>
        <div class="row row--between">
          <span class="small muted">We sold him for</span>
          <span class="num">{{ formatMoney(buyBack.clause.soldFor, store.currency) }}</span>
        </div>
        <div class="row row--between">
          <span class="small muted">He is worth</span>
          <span class="bold num" :class="buyBack.upside > 0 ? 'pos-val' : 'neg-val'">
            {{ formatMoney(player.value, store.currency) }}
          </span>
        </div>
        <div class="small" :class="buyBack.upside > 0 ? '' : 'muted'">
          <template v-if="buyBack.state === 'waiting'">
            Opens in {{ buyBack.clause.fromSeason }}, and runs to the end of
            {{ buyBack.clause.untilSeason }}.
          </template>
          <template v-else-if="buyBack.state === 'live'">
            Live until the end of {{ buyBack.clause.untilSeason }}.
            <template v-if="buyBack.upside > 0">
              Exercising it is worth {{ formatMoney(buyBack.upside, store.currency) }} against
              what he would cost on the open market.
            </template>
            <template v-else>
              He has not kicked on the way we hoped — buying him back at the agreed price
              would be paying over the odds out of sentiment.
            </template>
          </template>
          <template v-else>It has lapsed.</template>
        </div>
        <button
          v-if="buyBack.state === 'live'"
          class="btn btn--primary btn--block"
          @click="buyBackNow"
        >Buy him back for {{ formatMoney(buyBack.clause.price, store.currency) }}</button>
      </div>
    </div>

    <!-- Season -->
    <div class="card">
      <div class="card__head"><span class="card__title">This season</span></div>
      <div class="stat-grid stat-grid--3">
        <div class="stat"><div class="stat__label">Apps</div><div class="stat__value">{{ player.stats.appearances }}</div></div>
        <div class="stat"><div class="stat__label">Goals</div><div class="stat__value">{{ player.stats.goals }}</div></div>
        <div class="stat"><div class="stat__label">Assists</div><div class="stat__value">{{ player.stats.assists }}</div></div>
        <div class="stat"><div class="stat__label">Avg rating</div><div class="stat__value stat__value--sm">{{ avgRating }}</div></div>
        <div class="stat"><div class="stat__label">Cards</div><div class="stat__value stat__value--sm">{{ player.stats.yellowCards }}y {{ player.stats.redCards }}r</div></div>
        <div class="stat"><div class="stat__label">MOTM</div><div class="stat__value stat__value--sm">{{ player.stats.motmAwards }}</div></div>
      </div>
    </div>

    <!-- Actions -->
    <div class="section-title">Actions</div>
    <div class="card">
      <div class="card__body col">
        <template v-if="isOurs">
          <button class="btn btn--primary btn--block" @click="openRenewal">Offer new contract</button>
          <button
            class="btn btn--ghost btn--block"
            @click="store.setTransferListed(player.id, !player.listedForTransfer)"
          >
            {{ player.listedForTransfer ? 'Remove from transfer list' : 'List for transfer' }}
          </button>
          <button
            v-if="player.loanClubId"
            class="btn btn--ghost btn--block"
            @click="doRecall"
          >
            Recall from {{ store.clubById(player.loanClubId)?.name }}
          </button>
          <button
            v-else
            class="btn btn--ghost btn--block"
            :disabled="!store.transferWindow.open"
            @click="openLoanOut"
          >
            {{ store.transferWindow.open ? 'Send out on loan' : 'Loans: window closed' }}
          </button>
          <button
            class="btn btn--ghost btn--block"
            @click="store.setLoanListed(player.id, !player.listedForLoan)"
          >
            {{ player.listedForLoan ? 'Remove from loan list' : 'Make available for loan' }}
          </button>
          <div>
            <div class="field__label">Tell him his role</div>
            <div class="table__scroll">
              <div class="segmented" style="min-width: 460px">
                <button
                  v-for="s in statuses"
                  :key="s"
                  class="segmented__item"
                  :class="{ 'is-active': player.desiredStatus === s }"
                  @click="setStatus(s)"
                >{{ SQUAD_STATUS_LABELS[s] }}</button>
              </div>
            </div>
            <div class="field__hint">
              A promise you break is remembered. Under-promising keeps him quiet but cheap to replace.
            </div>
          </div>
          <button
            v-if="!player.isAcademy && player.position !== 'GK'"
            class="btn btn--ghost btn--block"
            @click="retrainOpen = true"
          >
            Retrain in a new position
          </button>
          <button
            v-if="canDemote"
            class="btn btn--ghost btn--block"
            @click="doDemote"
          >
            Send back to the academy
          </button>
          <button class="btn btn--danger btn--block" @click="doRelease">Release (pay up contract)</button>
        </template>

        <template v-else>
          <button
            class="btn btn--block"
            :class="store.isShortlisted(player.id) ? 'btn--ghost' : 'btn--primary'"
            @click="store.toggleShortlist(player.id)"
          >
            {{ store.isShortlisted(player.id) ? 'Remove from shortlist' : 'Add to shortlist' }}
          </button>
          <button
            class="btn btn--block"
            :disabled="!store.transferWindow.open"
            @click="openBid"
          >
            {{ store.transferWindow.open ? 'Make an offer' : 'Window closed' }}
          </button>
          <button
            v-if="player.clubId"
            class="btn btn--ghost btn--block"
            :disabled="!store.transferWindow.open"
            @click="wageShare = 0.5; loanInOpen = true"
          >
            Ask to take him on loan
          </button>
        </template>
      </div>
    </div>

    <!-- Renewal sheet -->
    <AppSheet
      v-if="renewOpen && offer"
      :title="`New deal for ${player.knownAs}`"
      :subtitle="`Currently on ${formatWage(player.contract?.wage ?? 0, store.currency)}/wk`"
      @close="renewOpen = false"
    >
      <div class="field">
        <label class="field__label">Weekly wage — {{ formatWage(offer.wage, store.currency) }}</label>
        <input
          v-model.number="offer.wage"
          class="slider"
          type="range"
          :min="200"
          :max="Math.max(2000, Math.round(player.wageDemand * 2.2))"
          :step="50"
        />
        <div class="field__hint">He is asking around {{ formatWage(player.wageDemand, store.currency) }}.</div>
      </div>
      <div class="field">
        <label class="field__label">Length — {{ offer.seasons }} season{{ offer.seasons === 1 ? '' : 's' }}</label>
        <input v-model.number="offer.seasons" class="slider" type="range" min="1" max="5" step="1" />
        <div class="field__hint">
          Longer deals protect his sale value. On a player past 30 they become a liability you cannot shift.
        </div>
      </div>
      <div class="field">
        <label class="field__label">Role promised</label>
        <select v-model="offer.promisedStatus" class="select">
          <option v-for="s in statuses" :key="s" :value="s">{{ SQUAD_STATUS_LABELS[s] }}</option>
        </select>
      </div>
      <div v-if="renewMessage" class="small mt" style="color: var(--warn)">{{ renewMessage }}</div>

      <template #footer>
        <button class="btn btn--primary btn--block" @click="submitRenewal">Offer contract</button>
      </template>
    </AppSheet>

    <!-- Loan out -->
    <AppSheet
      v-if="retrainOpen"
      :title="`Retrain ${player.knownAs}`"
      subtitle="Permanent, and it costs him something"
      @close="retrainOpen = false"
    >
      <div class="field">
        <label class="field__label">
          He plays {{ player.position }} now, and can already fill
          {{ player.altPositions.length ? player.altPositions.join(', ') : 'nothing else' }}
        </label>
        <div class="table__scroll">
          <div class="segmented" style="min-width: 560px">
            <button
              v-for="pos in retrainOptions"
              :key="pos"
              class="segmented__item"
              :class="{ 'is-active': retrainTo === pos }"
              @click="retrainTo = pos"
            >{{ pos }}</button>
          </div>
        </div>
        <div class="field__hint">
          The coaches rebuild him for the new role. He comes out of it a little under
          what he was worth in the old one and keeps {{ player.position }} as a position
          he can still cover. It cannot be undone, and there is no way back to a
          rating he has not earned in the new job — the coaching staff get some of it
          back over a season, and that is the whole bet.
        </div>
      </div>

      <template #footer>
        <button
          class="btn btn--primary btn--block"
          :disabled="!retrainTo"
          @click="doRetrain"
        >{{ retrainTo ? `Retrain him as a ${retrainTo}` : 'Choose a position' }}</button>
      </template>
    </AppSheet>

    <AppSheet
      v-if="loanOutOpen"
      :title="`Loan out ${player.knownAs}`"
      subtitle="A player who does not play does not develop"
      @close="loanOutOpen = false"
    >
      <div v-if="suitors.length === 0" class="empty">
        Nobody wants him. Either he is not good enough for anyone, or he is too
        good for anyone to get a game out of.
      </div>

      <template v-else>
        <div class="field">
          <label class="field__label">Where to</label>
          <div class="list" style="max-height: 220px; overflow-y: auto">
            <button
              v-for="s in suitors"
              :key="s.club.id"
              class="list__row"
              :style="chosenSuitor === s.club.id ? 'background: var(--accent-wash)' : ''"
              @click="chosenSuitor = s.club.id"
            >
              <div class="list__main">
                <div class="list__primary">{{ s.club.name }}</div>
                <div class="list__secondary">
                  {{ store.leagueById(s.club.leagueId)?.name }} ·
                  {{ PLAYING_TIME_LABELS[s.playingTime] }}
                </div>
              </div>
              <span
                class="chip"
                :class="s.playingTime === 'starter' ? 'chip--accent' : s.playingTime === 'rotation' ? '' : 'chip--warn'"
              >{{ Math.round(s.interest * 100) }}%</span>
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field__label">
            You keep paying {{ Math.round(wageShare * 100) }}% of his wage
            ({{ formatWage(Math.round((player.contract?.wage ?? 0) * wageShare), store.currency) }}/wk)
          </label>
          <input v-model.number="wageShare" class="slider" type="range" min="0" max="1" step="0.05" />
          <div class="field__hint">
            Covering more of the wage is what persuades a smaller club to take him.
            You are paying for his development.
          </div>
        </div>

        <div class="field">
          <label class="field__label">Length — {{ loanSeasons }} season{{ loanSeasons === 1 ? '' : 's' }}</label>
          <input v-model.number="loanSeasons" class="slider" type="range" min="1" max="2" />
        </div>
      </template>

      <template #footer>
        <button
          class="btn btn--primary btn--block"
          :disabled="!chosenSuitor"
          @click="submitLoanOut"
        >Agree the loan</button>
      </template>
    </AppSheet>

    <!-- Loan in -->
    <AppSheet
      v-if="loanInOpen"
      :title="`Borrow ${player.knownAs}`"
      :subtitle="currentClub?.name"
      @close="loanInOpen = false"
    >
      <div class="field">
        <label class="field__label">
          His club keeps paying {{ Math.round(wageShare * 100) }}% —
          you pay {{ formatWage(Math.round((player.contract?.wage ?? 0) * (1 - wageShare)), store.currency) }}/wk
        </label>
        <input v-model.number="wageShare" class="slider" type="range" min="0" max="1" step="0.05" />
        <div class="field__hint">
          Taking more of the wage off their hands makes them far more likely to agree.
        </div>
      </div>
      <p class="tiny faint">
        A club will not loan out a player who is central to them, however much
        you offer to pay.
      </p>
      <template #footer>
        <button class="btn btn--primary btn--block" @click="submitLoanIn">Make the approach</button>
      </template>
    </AppSheet>

    <!-- Bid sheet -->
    <AppSheet
      v-if="bidOpen"
      :title="`Offer for ${player.knownAs}`"
      :subtitle="currentClub?.name"
      @close="bidOpen = false"
    >
      <div class="field">
        <label class="field__label">Fee — {{ formatMoney(bidAmount, store.currency) }}</label>
        <input
          v-model.number="bidAmount"
          class="slider"
          type="range"
          :min="0"
          :max="Math.max(1_000_000, Math.round(player.value * 3))"
          :step="10_000"
        />
        <div class="field__hint">
          Your budget is {{ formatMoney(store.club?.finances.transferBudget ?? 0, store.currency) }}.
          <template v-if="report">
            Scouts estimate they want {{ formatMoney(report.estimatedFee[0], store.currency) }}–{{ formatMoney(report.estimatedFee[1], store.currency) }}.
          </template>
          <template v-else>You have no scout report — you are bidding blind.</template>
        </div>
      </div>
      <template #footer>
        <button class="btn btn--primary btn--block" @click="submitBid">Make enquiry</button>
      </template>
    </AppSheet>
  </div>
  <div v-else class="empty">Player not found.</div>
</template>
