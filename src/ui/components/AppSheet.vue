<script setup lang="ts">
/**
 * Modal sheet. Closes on backdrop tap and on Escape; the panel itself stops
 * propagation so a tap inside never dismisses it.
 */
defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="overlay" @click="emit('close')">
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
      @click.stop
      @keydown.esc="emit('close')"
    >
      <div class="sheet__head">
        <div class="row row--between">
          <div class="grow">
            <h2>{{ title }}</h2>
            <div v-if="subtitle" class="small muted">{{ subtitle }}</div>
          </div>
          <button class="btn btn--ghost btn--sm" @click="emit('close')">Close</button>
        </div>
      </div>
      <div class="sheet__body"><slot /></div>
      <div v-if="$slots.footer" class="sheet__foot"><slot name="footer" /></div>
    </div>
  </div>
</template>
