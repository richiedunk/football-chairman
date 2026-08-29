<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import PlayerRow from '../components/PlayerRow.vue'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { effectiveOfferValue } from '../../engine/systems/transfers'
import type { TransferNegotiation } from '../../engine/types'

const store = useGameStore()
const router = useRouter()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const active = computed(() =>
  (store.game?.negotiations ?? []).filter(
    (n) => n.buyingClubId === store.club?.id
      && !['completed', 'rejected', 'withdrawn'].includes(n.stage),
  ),
)

const concluded = computed(() =>
  (store.game?.negotiations ?? []).filter(
    (n) => n.buyingClubId === store.club?.id
      && ['completed', 'rejected', 'withdrawn'].includes(n.stage),
  ).slice(0, 6),
)

const shortlist = computed(() =>
  (store.game?.shortlist ?? [])
    .map((id) => store.player(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p)),
)

const listed = computed(() => store.squad.filter((p) => p.listedForTransfer || p.listedForLoan))

const recentWorldTransfers = computed(() => (store.game?.completedTransfers ?? []).slice(0, 10))

const STAGE_LABELS: Record<TransferNegotiation['stage'], string> = {
  enquiry: 'Enquiry made',
  clubTalks: 'Negotiating fee',
  clubAgreed: 'Fee agreed',
  playerTalks: 'Personal terms',
  agreed: 'Completing',
  completed: 'Completed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  hijacked: 'Hijacked',
}

function improve(negotiation: TransferNegotiation) {
  const s = store.game
  if (!s) return
  // Meet the asking price outright — the fast, expensive option, which is
  // exactly the trade-off a director actually faces late in a window.
  const target = Math.round(negotiation.askingPrice)
  const club = store.club
  if (club && target > club.finances.transferBudget) {
    toast?.('That exceeds your transfer budget.', 'error')
    return
  }
  negotiation.offeredFee = target
  negotiation.respondsOnWeek = s.date.week
  negotiation.log.push({
    week: s.date.week,
    season: s.date.season,
    speaker: 'you',
    text: `Improved offer to ${formatMoney(target, s.settings.currency)}.`,
  })
  store.commit()
  toast?.('Offer improved. They will respond next week.', 'success')
}

function offerTerms(negotiation: TransferNegotiation) {
  const s = store.game
  const player = store.player(negotiation.playerId)
  if (!s || !player) return
  negotiation.playerTerms = {
    wage: Math.round(player.wageDemand * 1.05),
    expiresSeason: s.date.season + (player.age <= 24 ? 4 : 3),
    signingBonus: 0,
    releaseClause: null,
    appearanceFee: 0,
    goalBonus: 0,
    loyaltyBonus: 0,
    inNegotiation: true,
    weeksSinceRenewalRequest: 0,
  }
  negotiation.respondsOnWeek = s.date.week
  store.commit()
  toast?.(`Terms offered to ${player.knownAs}.`, 'success')
}

function withdraw(negotiation: TransferNegotiation) {
  negotiation.stage = 'withdrawn'
  store.commit()
  toast?.('Interest withdrawn.')
}
</script>

<template>
  <div>
    <div class="card">
      <div class="card__body row row--between">
        <div>
          <div class="small muted">Transfer budget</div>
          <div class="bold num">{{ formatMoney(store.club?.finances.transferBudget ?? 0, store.currency) }}</div>
        </div>
        <div class="right">
          <div class="small muted">Wage headroom</div>
          <div class="bold num">
            {{ formatWage((store.club?.finances.wageBudget ?? 0) - store.wageBill, store.currency) }}
          </div>
        </div>
      </div>
      <div class="card__body" style="border-top: 1px solid var(--border)">
        <span class="chip" :class="store.transferWindow.open ? 'chip--accent' : ''">
          {{ store.transferWindow.label }}
        </span>
      </div>
    </div>

    <div class="btn-row mb">
      <button class="btn btn--primary" @click="router.push('/search')">Find players</button>
      <button class="btn btn--ghost" @click="router.push('/scouting')">Scouting</button>
    </div>

    <template v-if="active.length">
      <div class="section-title">Live negotiations</div>
      <div v-for="n in active" :key="n.id" class="card">
        <div class="card__head">
          <div class="grow truncate">
            <span class="bold">{{ store.player(n.playerId)?.knownAs ?? 'Unknown' }}</span>
          </div>
          <span class="chip chip--info">{{ STAGE_LABELS[n.stage] }}</span>
        </div>
        <div class="card__body">
          <div class="row row--between small">
            <span class="muted">Your offer</span>
            <span class="num">{{ formatMoney(n.offeredFee, store.currency) }}</span>
          </div>
          <div class="row row--between small">
            <span class="muted">They want</span>
            <span class="num">{{ formatMoney(n.askingPrice, store.currency) }}</span>
          </div>
          <div v-if="n.playerTerms" class="row row--between small">
            <span class="muted">Wage offered</span>
            <span class="num">{{ formatWage(n.playerTerms.wage, store.currency) }}/wk</span>
          </div>
          <div v-if="n.competingClubIds.length" class="chip chip--warn mt">
            {{ n.competingClubIds.length }} rival{{ n.competingClubIds.length === 1 ? '' : 's' }} interested
          </div>

          <div class="divider" />
          <div class="stack">
            <div v-for="(entry, i) in n.log.slice(-4)" :key="i" class="tiny">
              <span class="faint">wk{{ entry.week }} · {{ entry.speaker }}:</span> {{ entry.text }}
            </div>
          </div>

          <div class="btn-row mt">
            <button
              v-if="n.stage === 'clubTalks' || n.stage === 'enquiry'"
              class="btn btn--primary btn--sm"
              @click="improve(n)"
            >Meet asking price</button>
            <button
              v-if="n.stage === 'playerTalks' && !n.playerTerms"
              class="btn btn--primary btn--sm"
              @click="offerTerms(n)"
            >Offer terms</button>
            <button class="btn btn--ghost btn--sm" @click="withdraw(n)">Withdraw</button>
          </div>
          <div class="tiny faint mt">
            Effective value of your package: {{ formatMoney(effectiveOfferValue(n), store.currency) }}
          </div>
        </div>
      </div>
    </template>

    <template v-if="shortlist.length">
      <div class="section-title">Shortlist</div>
      <div class="card">
        <div class="list">
          <PlayerRow v-for="p in shortlist" :key="p.id" :player="p" trail="value" />
        </div>
      </div>
    </template>

    <template v-if="listed.length">
      <div class="section-title">Available for transfer</div>
      <div class="card">
        <div class="list">
          <PlayerRow v-for="p in listed" :key="p.id" :player="p" trail="value" />
        </div>
      </div>
    </template>

    <template v-if="concluded.length">
      <div class="section-title">Concluded</div>
      <div class="card">
        <div class="list">
          <div v-for="n in concluded" :key="n.id" class="list__row list__row--static">
            <div class="list__main">
              <div class="list__primary">{{ store.player(n.playerId)?.knownAs ?? 'Unknown' }}</div>
              <div class="list__secondary">{{ n.log[n.log.length - 1]?.text ?? STAGE_LABELS[n.stage] }}</div>
            </div>
            <span class="chip" :class="n.stage === 'completed' ? 'chip--accent' : 'chip--danger'">
              {{ STAGE_LABELS[n.stage] }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div class="section-title">Around the world</div>
    <div class="card">
      <div class="list">
        <div v-for="t in recentWorldTransfers" :key="t.id" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ t.playerName }}</div>
            <div class="list__secondary">{{ t.fromClubName }} → {{ t.toClubName }}</div>
          </div>
          <div class="list__trail">
            <div class="list__value">{{ t.fee > 0 ? formatMoney(t.fee, store.currency) : 'Free' }}</div>
            <div class="list__sub">wk {{ t.week }}</div>
          </div>
        </div>
        <div v-if="!recentWorldTransfers.length" class="empty">No transfers yet.</div>
      </div>
    </div>
  </div>
</template>
