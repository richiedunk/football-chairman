<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import MeterBar from '../components/MeterBar.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { ledgerBalance, ledgerExpenditure, ledgerIncome, weeklyRevenue } from '../../engine/systems/finance'
import { committedWages, expiringContracts } from '../../engine/systems/contracts'
import {
  projectedSquadCost, SANCTION_LABELS, SQUAD_COST_LIMIT, underEmbargo,
} from '../../engine/systems/regulation'

const LIMIT_PERCENT = Math.round(SQUAD_COST_LIMIT * 100)

const store = useGameStore()
const club = computed(() => store.club)
const ledger = computed(() => club.value?.finances.season ?? null)

const incomeLines = computed(() => {
  const l = ledger.value
  if (!l) return []
  return [
    { label: 'Matchday', value: l.matchdayIncome },
    { label: 'TV & central', value: l.tvIncome },
    { label: 'Sponsorship', value: l.sponsorshipIncome },
    { label: 'Prize money', value: l.prizeMoney },
    { label: 'Player sales', value: l.transfersOut },
    { label: 'Other', value: l.otherIncome },
  ].filter((x) => x.value > 0)
})

const costLines = computed(() => {
  const l = ledger.value
  if (!l) return []
  return [
    { label: 'Player wages', value: l.wagesPaid },
    { label: 'Staff wages', value: l.staffWages },
    { label: 'Transfer fees paid', value: l.transfersIn },
    { label: 'Agent fees', value: l.agentFees },
    { label: 'Construction', value: l.facilitiesSpend },
    { label: 'Interest', value: l.interestPaid },
    { label: 'Running costs', value: l.otherCosts },
  ].filter((x) => x.value > 0)
})

const squadCost = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? projectedSquadCost(s, c) : null
})

const ratioPercent = computed(() => {
  const a = squadCost.value
  if (!a || !Number.isFinite(a.ratio)) return null
  return Math.round(a.ratio * 100)
})

const sanctions = computed(() => club.value?.finances.regulation.sanctions ?? [])
const embargoed = computed(() => (club.value ? underEmbargo(club.value) : false))

const wageTable = computed(() =>
  store.squad
    .filter((p) => p.contract)
    .slice()
    .sort((a, b) => (b.contract?.wage ?? 0) - (a.contract?.wage ?? 0))
    .slice(0, 12),
)

const expiring = computed(() => {
  const s = store.game
  const c = club.value
  return s && c ? expiringContracts(s, c, 1) : []
})

const committed = computed(() => {
  const s = store.game
  const c = club.value
  if (!s || !c) return []
  return [1, 2, 3].map((n) => ({ seasons: n, wages: committedWages(s, c, n) }))
})
</script>

<template>
  <div v-if="club && ledger">
    <h1 class="mb">Finances</h1>

    <div class="card">
      <div class="stat-grid">
        <div class="stat">
          <div class="stat__label">Balance</div>
          <div class="stat__value" :class="club.finances.balance < 0 ? 'neg-val' : ''">
            {{ formatMoney(club.finances.balance, store.currency) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Debt</div>
          <div class="stat__value" :class="club.finances.debt > 0 ? 'neg-val' : ''">
            {{ formatMoney(club.finances.debt, store.currency) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Transfer budget</div>
          <div class="stat__value stat__value--sm">{{ formatMoney(club.finances.transferBudget, store.currency) }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Weekly revenue</div>
          <div class="stat__value stat__value--sm">
            {{ formatMoney(weeklyRevenue(store.game!, club), store.currency) }}
          </div>
        </div>
      </div>
      <div v-if="club.finances.inCrisis" class="card__body" style="background: rgba(248,113,113,0.1)">
        <div class="small bold" style="color: var(--danger)">Transfer embargo in force</div>
        <div class="tiny muted">
          The club cannot cover its outgoings. Sell players or cut wages before you can sign anyone.
        </div>
      </div>
    </div>

    <div class="section-title">Squad-cost ratio</div>
    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">Projected for this season</span>
          <span
            class="bold num"
            :style="ratioPercent !== null && ratioPercent > LIMIT_PERCENT ? 'color: var(--danger)' : ''"
          >{{ ratioPercent === null ? '—' : `${ratioPercent}%` }} / {{ LIMIT_PERCENT }}%</span>
        </div>
        <MeterBar :value="ratioPercent ?? 0" :max="LIMIT_PERCENT" invert />
        <p class="tiny muted" style="margin: 8px 0 0">
          Wages, transfer fees written down and agent fees, against revenue plus profit on
          player sales. Go over and the league sanctions the club.
        </p>
      </div>
      <div v-if="squadCost" class="divider" />
      <div v-if="squadCost" class="card__body">
        <div
          v-for="line in squadCost.components.filter((c) => c.amount > 0)"
          :key="line.label"
          class="row row--between small"
          style="margin-bottom: 3px"
        >
          <span class="muted">{{ line.income ? '+' : '−' }} {{ line.label }}</span>
          <span class="num">{{ formatMoney(line.amount, store.currency) }}</span>
        </div>
      </div>
      <div
        v-if="embargoed"
        class="card__body"
        style="background: rgba(248,113,113,0.1)"
      >
        <div class="small bold" style="color: var(--danger)">Registration embargo</div>
        <div class="tiny muted">
          You may sign players. You may not add anyone signed since the embargo to the
          squad list, so they cannot be selected until it is lifted.
        </div>
      </div>
    </div>

    <div v-if="sanctions.length" class="card">
      <div class="card__head"><span class="card__title">On record</span></div>
      <div class="list">
        <div v-for="s in sanctions" :key="s.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">
              {{ SANCTION_LABELS[s.kind] }}
              <span v-if="s.kind === 'fine'" class="chip chip--warn">
                {{ formatMoney(s.amount, store.currency) }}
              </span>
              <span v-else-if="s.kind === 'pointsDeduction'" class="chip chip--danger">
                −{{ s.amount }} pts
              </span>
              <span v-if="s.seasonsRemaining > 0" class="chip chip--info">Active</span>
            </div>
            <div class="list__secondary" style="white-space: normal">
              {{ s.season }}/{{ (s.season + 1) % 100 }} — {{ s.reason }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">Wage bill</div>
    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="small muted">This week</span>
          <span class="bold num">
            {{ formatWage(store.wageBill, store.currency) }} / {{ formatWage(club.finances.wageBudget, store.currency) }}
          </span>
        </div>
        <MeterBar :value="store.wageBill" :max="club.finances.wageBudget" invert />
        <div class="divider" />
        <div class="tiny faint bold mb" style="text-transform: uppercase; letter-spacing: 0.05em">
          Committed beyond this season
        </div>
        <div v-for="c in committed" :key="c.seasons" class="row row--between small">
          <span class="muted">Still on the books in {{ c.seasons }} season{{ c.seasons === 1 ? '' : 's' }}</span>
          <span class="num">{{ formatWage(c.wages, store.currency) }}/wk</span>
        </div>
      </div>
    </div>

    <div class="section-title">This season's books</div>
    <div class="card">
      <div class="card__body">
        <div class="row row--between mb">
          <span class="bold small">Income</span>
          <span class="bold num pos-val">{{ formatMoney(ledgerIncome(ledger), store.currency) }}</span>
        </div>
        <div v-for="line in incomeLines" :key="line.label" class="row row--between small">
          <span class="muted">{{ line.label }}</span>
          <span class="num">{{ formatMoney(line.value, store.currency) }}</span>
        </div>

        <div class="divider" />

        <div class="row row--between mb">
          <span class="bold small">Expenditure</span>
          <span class="bold num neg-val">{{ formatMoney(ledgerExpenditure(ledger), store.currency) }}</span>
        </div>
        <div v-for="line in costLines" :key="line.label" class="row row--between small">
          <span class="muted">{{ line.label }}</span>
          <span class="num">{{ formatMoney(line.value, store.currency) }}</span>
        </div>

        <div class="divider" />
        <div class="row row--between">
          <span class="bold">Net</span>
          <span class="bold num" :class="ledgerBalance(ledger) >= 0 ? 'pos-val' : 'neg-val'">
            {{ formatMoney(ledgerBalance(ledger), store.currency) }}
          </span>
        </div>
      </div>
    </div>

    <template v-if="expiring.length">
      <div class="section-title">Expiring contracts</div>
      <div class="card">
        <div class="list">
          <button
            v-for="e in expiring"
            :key="e.player.id"
            class="list__row"
            @click="$router.push(`/player/${e.player.id}`)"
          >
            <div class="list__main">
              <div class="list__primary">{{ e.player.knownAs }}</div>
              <div class="list__secondary">
                {{ e.seasonsLeft <= 0 ? 'Expires this season' : `${e.seasonsLeft} season left` }}
                · worth {{ formatMoney(e.player.value, store.currency) }}
              </div>
            </div>
            <span class="chip" :class="e.seasonsLeft <= 0 ? 'chip--danger' : 'chip--warn'">
              {{ e.seasonsLeft <= 0 ? 'Free agent' : 'Act soon' }}
            </span>
          </button>
        </div>
      </div>
    </template>

    <div class="section-title">Highest earners</div>
    <div class="card">
      <div class="list">
        <button
          v-for="p in wageTable"
          :key="p.id"
          class="list__row"
          @click="$router.push(`/player/${p.id}`)"
        >
          <div class="list__main">
            <div class="list__primary">{{ p.knownAs }}</div>
            <div class="list__secondary">
              {{ Math.round(((p.contract?.wage ?? 0) / club.finances.wageBudget) * 100) }}% of the budget
            </div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ formatWage(p.contract?.wage ?? 0, store.currency) }}</div>
            <div class="list__sub">{{ p.stats.appearances }} apps</div>
          </div>
        </button>
      </div>
    </div>

    <div class="section-title">Commercial</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between small">
          <span class="muted">Shirt sponsor</span>
          <span>{{ club.finances.sponsorship.shirtSponsor }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Value</span>
          <span class="num">{{ formatMoney(club.finances.sponsorship.shirtValuePerSeason, store.currency) }}/season</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Kit supplier</span>
          <span>{{ club.finances.sponsorship.kitSupplier }}</span>
        </div>
        <div class="row row--between small">
          <span class="muted">Deals expire</span>
          <span class="num">{{ club.finances.sponsorship.expiresSeason }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
