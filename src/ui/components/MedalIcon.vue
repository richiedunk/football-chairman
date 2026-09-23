<script setup lang="ts">
/**
 * An achievement's medal: gold for a rare one, silver for the rest, and a
 * dim outline with a lock until it is earned. On a ribbon in the club's
 * colours, because it was won there.
 */
withDefaults(defineProps<{ earned: boolean; rare?: boolean; size?: number }>(), { rare: false, size: 34 })
</script>

<template>
  <svg class="medal" :width="size" :height="size" viewBox="0 0 40 40" aria-hidden="true">
    <template v-if="earned">
      <path d="M13 2H20L17 16H10Z" fill="var(--club-strip)" />
      <path d="M27 2H20L23 16H30Z" fill="var(--club-strip-alt)" />
      <circle cx="20" cy="25" r="12" :fill="rare ? '#f5c542' : '#c9d1da'" />
      <circle cx="20" cy="25" r="9" fill="none" :stroke="rare ? '#b8891c' : '#8e98a4'" stroke-width="1.6" />
      <path d="M20 19.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L20 28.1l-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" :fill="rare ? '#b8891c' : '#8e98a4'" />
      <path d="M11 20a10 10 0 0 1 8-6" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" />
    </template>
    <template v-else>
      <circle cx="20" cy="24" r="12" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" stroke-dasharray="3 3" />
      <rect x="15.5" y="23" width="9" height="7" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <path d="M17.2 23v-2a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.6" />
    </template>
  </svg>
</template>
