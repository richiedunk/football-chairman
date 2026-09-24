<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/game'
import type { CupCompetition } from '../../engine/types'
import ClubCrest from './ClubCrest.vue'

/**
 * A club's road through a cup, round by round.
 *
 * The whole draw of a hundred-club cup does not fit a phone and is not what
 * anyone reads anyway. What is read is your own run: who you drew, how it
 * went, and how far there is still to go. Rounds already played carry the
 * opponent and the score; the next round is marked; the rest are the
 * remaining steps to the final, dimmed. Out is out: the run stops at the
 * round that ended it.
 */
const props = defineProps<{ competition: CupCompetition; clubId: string }>()
const store = useGameStore()

const steps = computed(() => {
  const out: {
    name: string
    state: 'won' | 'lost' | 'next' | 'ahead'
    opponent: ReturnType<typeof store.clubById>
    score: string | null
  }[] = []
  let knockedOut = false
  let nextMarked = false
  for (const round of props.competition.rounds) {
    if (knockedOut) break
    const ours = round.fixtureIds
      .map((id) => store.fixtureById(id))
      .filter((f) => f && (f.homeClubId === props.clubId || f.awayClubId === props.clubId))
    if (!ours.length) {
      // Not drawn in this round: either a bye, a round still to be drawn, or
      // the cup has not reached us yet.
      out.push({ name: round.name, state: nextMarked ? 'ahead' : 'next', opponent: null, score: null })
      nextMarked = true
      continue
    }
    const f = ours[ours.length - 1]!
    const isHome = f.homeClubId === props.clubId
    const opponent = store.clubById(isHome ? f.awayClubId : f.homeClubId)
    if (!f.result) {
      out.push({ name: round.name, state: nextMarked ? 'ahead' : 'next', opponent, score: null })
      nextMarked = true
      continue
    }
    // Over two legs, sum both; a penalty shoot-out decides a level tie.
    let us = 0
    let them = 0
    for (const leg of ours) {
      if (!leg?.result) continue
      const home = leg.homeClubId === props.clubId
      us += home ? leg.result.homeGoals : leg.result.awayGoals
      them += home ? leg.result.awayGoals : leg.result.homeGoals
    }
    let won = us > them
    let pens = ''
    if (us === them && f.result.penalties) {
      const p = f.result.penalties
      const ourPens = isHome ? p.home : p.away
      const theirPens = isHome ? p.away : p.home
      won = ourPens > theirPens
      pens = ` (${ourPens}–${theirPens}p)`
    }
    out.push({ name: round.name, state: won ? 'won' : 'lost', opponent, score: `${us}–${them}${pens}` })
    if (!won) knockedOut = true
  }
  return out
})
</script>

<template>
  <ol class="cup-run">
    <li v-for="(step, i) in steps" :key="i" class="cup-run__step" :class="`is-${step.state}`">
      <span class="cup-run__dot" aria-hidden="true" />
      <span class="cup-run__round">{{ step.name }}</span>
      <span class="cup-run__tie">
        <template v-if="step.opponent">
          <ClubCrest :club="step.opponent" :size="18" />
          <span class="truncate">{{ step.opponent.shortName || step.opponent.name }}</span>
        </template>
        <span v-else class="faint">{{ step.state === 'next' ? 'Draw to come' : '' }}</span>
      </span>
      <span v-if="step.score" class="cup-run__score">{{ step.score }}</span>
      <span v-else-if="step.state === 'next'" class="cup-run__tag">Next</span>
    </li>
  </ol>
</template>
