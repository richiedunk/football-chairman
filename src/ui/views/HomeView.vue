<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { formatMoney, formatWage } from '../../engine/systems/valuation'
import { confidenceLabel, relationshipLabel } from '../../engine/systems/board'
import { ordinal } from '../../engine/systems/career'
import MeterBar from '../components/MeterBar.vue'
import FormRun from '../components/FormRun.vue'

const store = useGameStore()
const router = useRouter()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const club = computed(() => store.club)

const myRow = computed(() => store.table.find((r) => r.clubId === club.value?.id) ?? null)

const nextOpponent = computed(() => {
  const f = store.nextFixture
  const c = club.value
  if (!f || !c) return null
  const isHome = f.homeClubId === c.id
  const opponent = store.clubById(isHome ? f.awayClubId : f.homeClubId)
  return opponent ? { opponent, isHome, week: f.week } : null
})

const wageHeadroom = computed(() => {
  const c = club.value
  return c ? c.finances.wageBudget - store.wageBill : 0
})

const injured = computed(() => store.squad.filter((p) => p.injury).length)
const unhappy = computed(() => store.squad.filter((p) => p.morale < 35).length)
const expiring = computed(() => {
  const s = store.game
  if (!s) return 0
  return store.squad.filter((p) => p.contract && p.contract.expiresSeason <= s.date.season).length
})

async function advance() {
  const result = await store.nextWeek()
  if (!result.ok) {
    toast?.(result.reason ?? 'Cannot advance.', 'error')
    router.push('/inbox')
    return
  }
  const tick = store.lastTick
  if (tick?.sacked) {
    toast?.('You have been dismissed.', 'error')
    router.push('/career')
    return
  }
  if (tick?.seasonEnded) {
    toast?.('Season complete.', 'success')
    router.push('/career')
    return
  }
  if (tick?.playerFixtures.length) {
    const first = tick.playerFixtures[0]
    toast?.(first.result.summary, 'info')
  }
}
</script>

<template>
  <div v-if="club">
    <!-- Standing -->
    <div class="card">
      <div class="stat-grid stat-grid--3">
        <div class="stat">
          <div class="stat__label">Position</div>
          <div class="stat__value">
            {{ store.leaguePosition || '—' }}<span class="tiny faint">{{ store.leaguePosition ? ordinal(store.leaguePosition) : '' }}</span>
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">Points</div>
          <div class="stat__value">{{ myRow?.points ?? 0 }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Played</div>
          <div class="stat__value">{{ myRow?.played ?? 0 }}</div>
        </div>
      </div>
      <div class="card__body row row--between">
        <div class="small muted">Board target: {{ club.board.expectation.leaguePosition }}{{ ordinal(club.board.expectation.leaguePosition) }}</div>
        <FormRun :form="myRow?.form ?? []" />
      </div>
    </div>

    <!-- Next match -->
    <div class="card">
      <div class="card__head"><span class="card__title">Next fixture</span></div>
      <div class="card__body">
        <template v-if="nextOpponent">
          <div class="row row--between">
            <div class="grow">
              <div class="bold">
                {{ nextOpponent.isHome ? 'vs' : 'away to' }} {{ nextOpponent.opponent.name }}
              </div>
              <div class="small muted">
                Week {{ nextOpponent.week }} · {{ nextOpponent.opponent.reputation > club.reputation ? 'Tougher opposition' : 'Winnable' }}
              </div>
            </div>
            <FormRun :form="store.table.find((r) => r.clubId === nextOpponent!.opponent.id)?.form ?? []" />
          </div>
        </template>
        <div v-else class="small muted">No fixtures remaining this season.</div>
      </div>
    </div>

    <!-- Things needing attention -->
    <div class="section-title">Needs attention</div>
    <div class="card">
      <div class="list">
        <button v-if="store.pendingDecisions > 0" class="list__row" @click="router.push('/inbox')">
          <div class="list__main">
            <div class="list__primary">{{ store.pendingDecisions }} decision{{ store.pendingDecisions === 1 ? '' : 's' }} outstanding</div>
            <div class="list__secondary">The week cannot advance until urgent ones are answered</div>
          </div>
          <span class="chip chip--danger">Act</span>
        </button>
        <button v-if="expiring > 0" class="list__row" @click="router.push('/squad')">
          <div class="list__main">
            <div class="list__primary">{{ expiring }} contract{{ expiring === 1 ? '' : 's' }} expiring</div>
            <div class="list__secondary">They leave for nothing if nothing is agreed</div>
          </div>
          <span class="chip chip--warn">Renew</span>
        </button>
        <button v-if="unhappy > 0" class="list__row" @click="router.push('/squad')">
          <div class="list__main">
            <div class="list__primary">{{ unhappy }} unhappy player{{ unhappy === 1 ? '' : 's' }}</div>
            <div class="list__secondary">Low morale drags form down and invites press interest</div>
          </div>
          <span class="chip chip--warn">Review</span>
        </button>
        <div v-if="injured > 0" class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">{{ injured }} injured</div>
            <div class="list__secondary">Unavailable for selection</div>
          </div>
        </div>
        <div
          v-if="!store.pendingDecisions && !expiring && !unhappy && !injured"
          class="empty"
        >Nothing pressing. A rare week.</div>
      </div>
    </div>

    <!-- Key numbers -->
    <div class="section-title">The numbers</div>
    <div class="card">
      <div class="card__body stack">
        <div class="row row--between">
          <span class="small muted">Balance</span>
          <span class="bold num" :class="club.finances.balance < 0 ? 'neg-val' : ''">
            {{ formatMoney(club.finances.balance, store.currency) }}
          </span>
        </div>
        <div>
          <div class="row row--between" style="margin-bottom: 5px">
            <span class="small muted">Wage bill</span>
            <span class="small num">
              {{ formatWage(store.wageBill, store.currency) }} of {{ formatWage(club.finances.wageBudget, store.currency) }}
            </span>
          </div>
          <MeterBar :value="store.wageBill" :max="club.finances.wageBudget" invert />
          <div class="tiny faint" style="margin-top: 4px">
            {{ wageHeadroom >= 0 ? `${formatWage(wageHeadroom, store.currency)} of headroom` : `${formatWage(-wageHeadroom, store.currency)} over budget` }}
          </div>
        </div>
        <div class="row row--between">
          <span class="small muted">Transfer budget</span>
          <span class="bold num">{{ formatMoney(club.finances.transferBudget, store.currency) }}</span>
        </div>
        <div v-if="club.finances.debt > 0" class="row row--between">
          <span class="small muted">Debt</span>
          <span class="bold num neg-val">{{ formatMoney(club.finances.debt, store.currency) }}</span>
        </div>
      </div>
    </div>

    <!-- Relationships -->
    <div class="section-title">Standing</div>
    <div class="card">
      <div class="list">
        <button class="list__row" @click="router.push('/board')">
          <div class="list__main">
            <div class="list__primary">Board</div>
            <div class="list__secondary">{{ confidenceLabel(club.board.confidence) }}</div>
          </div>
          <div style="width: 74px"><MeterBar :value="club.board.confidence" /></div>
        </button>
        <button class="list__row" @click="router.push('/staff')">
          <div class="list__main">
            <div class="list__primary">Head coach</div>
            <div class="list__secondary">
              {{ store.headCoach?.knownAs ?? 'Vacant — appoint one' }}
              <template v-if="store.headCoach?.coachProfile">
                · {{ relationshipLabel(store.headCoach.coachProfile.dofRelationship) }}
              </template>
            </div>
          </div>
          <div style="width: 74px">
            <MeterBar :value="store.headCoach?.coachProfile?.dofRelationship ?? 0" />
          </div>
        </button>
        <button class="list__row" @click="router.push('/media')">
          <div class="list__main">
            <div class="list__primary">Press</div>
            <div class="list__secondary">Credibility {{ Math.round(store.game?.mediaStanding.credibility ?? 0) }}</div>
          </div>
          <div style="width: 74px"><MeterBar :value="store.game?.mediaStanding.credibility ?? 0" /></div>
        </button>
        <div class="list__row list__row--static">
          <div class="list__main">
            <div class="list__primary">Supporters</div>
            <div class="list__secondary">{{ club.fanMood >= 65 ? 'Behind you' : club.fanMood >= 40 ? 'Restless' : 'Turning' }}</div>
          </div>
          <div style="width: 74px"><MeterBar :value="club.fanMood" /></div>
        </div>
      </div>
    </div>

    <!-- Recent results -->
    <template v-if="store.recentResults.length">
      <div class="section-title">Recent results</div>
      <div class="card">
        <div class="list">
          <div
            v-for="entry in store.recentResults.slice(0, 5)"
            :key="entry.fixture.id"
            class="list__row list__row--static"
          >
            <div class="list__main">
              <div class="list__primary">{{ entry.result.summary }}</div>
              <div class="list__secondary">
                Week {{ entry.fixture.week }} · {{ entry.result.attendance.toLocaleString() }} in
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="mt" style="padding-bottom: 8px">
      <div class="btn-row">
        <button class="btn btn--ghost" @click="store.advanceUntilNextMatch()">To next match</button>
        <button class="btn btn--primary" :disabled="store.busy" @click="advance">Advance week</button>
      </div>
      <p v-if="store.blockers.length" class="tiny center mt" style="color: var(--warn)">
        {{ store.blockers.length }} urgent decision{{ store.blockers.length === 1 ? '' : 's' }} must be answered first.
      </p>
    </div>
  </div>
  <div v-else class="empty">No club loaded.</div>
</template>
