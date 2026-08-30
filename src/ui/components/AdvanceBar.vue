<script setup lang="ts">
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/game'
import { advanceIntent } from '../advance'

/**
 * The one button that is always in the same place.
 *
 * It lives in the shell rather than in the home view so it cannot move, and
 * so it is never inside a scrolling region — the primary action of a game
 * played in one hand should not require a scroll to reach.
 */
const store = useGameStore()
const router = useRouter()
const toast = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('toast')

const intent = computed(() => {
  const s = store.game
  const c = store.club
  const fixture = store.nextFixture

  let next: ReturnType<typeof describeFixture> = null
  function describeFixture() {
    if (!fixture || !s || !c) return null
    const isHome = fixture.homeClubId === c.id
    const opponent = store.clubById(isHome ? fixture.awayClubId : fixture.homeClubId)
    if (!opponent) return null
    return {
      inWeeks: Math.max(0, fixture.week - s.date.week),
      // The short name, because "Wolverhampton Wanderers" does not fit on a
      // button and nobody says it out loud either.
      opponent: opponent.shortName || opponent.name,
      isHome,
      competition:
        fixture.competitionType === 'league'
          ? store.leagueById(fixture.competitionId)?.name ?? 'League'
          : s.cups[fixture.competitionId]?.name ?? 'Cup',
    }
  }
  next = describeFixture()

  return advanceIntent({
    blockers: store.blockers.length,
    isDeadlineWeek: store.isDeadline,
    openDeadlineOffers: store.deadlineOffers.length,
    phase: s?.phase ?? 'preseason',
    nextFixture: next,
    out: store.squad.filter((p) => p.injury && p.injury.weeksRemaining > 0).length,
    suspended: store.squad.filter((p) => p.suspendedWeeks > 0).length,
  })
})

async function press() {
  const to = intent.value.route
  if (to) {
    router.push(to)
    return
  }

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
    toast?.(tick.playerFixtures[0].result.summary, 'info')
  }
}
</script>

<template>
  <div class="advance-bar">
    <button
      class="advance"
      :class="{
        'advance--blocked': intent.tone === 'warn',
        'advance--deadline': intent.tone === 'danger',
      }"
      :disabled="store.busy"
      @click="press"
    >
      <span class="advance__label">
        {{ intent.label }}
        <svg
          v-if="!intent.route"
          width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true"
        ><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
      <span class="advance__sub">{{ intent.detail }}</span>
    </button>
  </div>
</template>
