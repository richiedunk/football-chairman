<script setup lang="ts">
/**
 * The disclosure chevron. One component so every "this row goes somewhere"
 * arrow in the app has the same weight and size — mixing a text glyph with a
 * stroked path is the sort of small inconsistency that makes a screen feel
 * unfinished without anyone being able to say why.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 15 })
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="var(--text-fainter)" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round"
    style="flex: 0 0 auto" aria-hidden="true"
  ><path d="M9 18l6-6-6-6" /></svg>
</template>
