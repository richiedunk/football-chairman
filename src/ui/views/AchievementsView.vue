<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useGameStore } from '../../stores/game'
import { achievements as achievementService, capabilities } from '../../platform/services'
import type { AchievementCategory } from '../../engine/systems/achievements'

const store = useGameStore()
const notify = inject<(t: string, k?: 'info' | 'error' | 'success') => void>('notify')

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  career: 'Career',
  silverware: 'Silverware',
  squad: 'Squad',
  money: 'Money',
  stewardship: 'Stewardship',
}

const all = computed(() => store.achievementProgress)
const earned = computed(() => all.value.filter((a) => a.earned))

const grouped = computed(() => {
  const order: AchievementCategory[] = ['career', 'silverware', 'squad', 'money', 'stewardship']
  return order.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: all.value.filter((a) => a.category === category),
  })).filter((group) => group.items.length > 0)
})

const platformAvailable = computed(() => capabilities().achievements)
const opening = ref(false)

async function openPlatform() {
  opening.value = true
  const shown = await achievementService.show()
  opening.value = false
  if (!shown) notify?.('No platform achievements service is connected in this build.')
}
</script>

<template>
  <div>
    <div class="card">
      <div class="stat-grid stat-grid--2">
        <div class="stat">
          <div class="stat__label">Earned</div>
          <div class="stat__value">{{ earned.length }}<span class="faint">/{{ all.length }}</span></div>
        </div>
        <div class="stat">
          <div class="stat__label">Rare</div>
          <div class="stat__value">{{ earned.filter((a) => a.rare).length }}</div>
        </div>
      </div>
    </div>

    <div v-for="group in grouped" :key="group.category">
      <div class="section-title">{{ group.label }}</div>
      <div class="card">
        <div class="list">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="list__row list__row--static"
            :style="item.earned ? '' : 'opacity: 0.55'"
          >
            <div
              class="pos"
              style="width: 30px"
              :style="item.earned ? 'background: var(--accent-wash); color: var(--accent)' : ''"
            >{{ item.earned ? '★' : '·' }}</div>
            <div class="list__main">
              <div class="list__primary">
                {{ item.name }}
                <span v-if="item.rare" class="chip chip--gold">Rare</span>
              </div>
              <div class="list__secondary" style="white-space: normal">{{ item.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="btn-row mt" style="padding-bottom: 8px">
      <button
        v-if="platformAvailable"
        class="btn btn--ghost"
        :disabled="opening"
        @click="openPlatform()"
      >Open platform achievements</button>
    </div>
  </div>
</template>
