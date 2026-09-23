<script setup lang="ts">
/**
 * A floodlit ground at night, drawn rather than photographed: two pylons
 * with their lamp banks lit, the beams falling onto the pitch, and the roof
 * line of the stands in silhouette. Decoration for the screens that are a
 * moment rather than a tool — the title, the season's end.
 *
 * All of it is shapes and gradients, so it costs a few hundred bytes, scales
 * to any width, and never needs an asset that could fail to load.
 */
</script>

<template>
  <svg class="stadium-scene" viewBox="0 0 400 240" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs>
      <radialGradient id="ss-lamp" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="0.25" stop-color="#e8f2ff" stop-opacity="0.8" />
        <stop offset="1" stop-color="#bcd8ff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ss-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e6f0ff" stop-opacity="0.22" />
        <stop offset="1" stop-color="#e6f0ff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="ss-pitch" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2e7a3a" />
        <stop offset="1" stop-color="#11301a" />
      </linearGradient>
      <linearGradient id="ss-stand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1b2129" />
        <stop offset="1" stop-color="#0b0e12" />
      </linearGradient>
    </defs>

    <!-- Beams -->
    <path d="M44 36L-40 240H170Z" fill="url(#ss-beam)" />
    <path d="M356 36L440 240H230Z" fill="url(#ss-beam)" />

    <!-- The far stand, with a roof line and a lit concourse. -->
    <path d="M0 150L30 128H370L400 150V178H0Z" fill="url(#ss-stand)" />
    <path d="M30 128H370" stroke="#3a4450" stroke-width="1.2" />
    <g fill="#ffd98a" opacity="0.35">
      <rect x="40" y="140" width="320" height="1.2" />
      <rect x="40" y="152" width="320" height="1" opacity="0.6" />
    </g>
    <!-- The crowd, as a speckle of light. -->
    <g fill="#c9d3de" opacity="0.18">
      <circle v-for="i in 60" :key="i" :cx="30 + ((i * 53) % 340)" :cy="158 + ((i * 7) % 16)" r="0.9" />
    </g>

    <!-- Pitch, in perspective. -->
    <path d="M-20 240L40 178H360L420 240Z" fill="url(#ss-pitch)" />
    <g stroke="rgba(255,255,255,0.35)" stroke-width="0.8" fill="none">
      <path d="M40 178H360" />
      <path d="M200 178V240" />
      <ellipse cx="200" cy="206" rx="34" ry="10" />
    </g>
    <g fill="rgba(0,0,0,0.12)">
      <path d="M40 178L-20 240H30L80 178Z" />
      <path d="M120 178L90 240H140L160 178Z" />
      <path d="M240 178L260 240H310L280 178Z" />
      <path d="M320 178L370 240H420L360 178Z" />
    </g>

    <!-- Pylons -->
    <g stroke="#2a323c" stroke-width="2.2" fill="none">
      <path d="M44 42L36 150M44 42L52 150M38 90H50M37 120H51" />
      <path d="M356 42L348 150M356 42L364 150M350 90H362M349 120H363" />
    </g>
    <g fill="#3a4450">
      <rect x="30" y="24" width="28" height="16" rx="1.5" />
      <rect x="342" y="24" width="28" height="16" rx="1.5" />
    </g>
    <g fill="#f4f8ff">
      <rect v-for="i in 8" :key="`l${i}`" :x="32 + ((i - 1) % 4) * 6.5" :y="26 + Math.floor((i - 1) / 4) * 6.5" width="4.5" height="4.5" rx="0.8" />
      <rect v-for="i in 8" :key="`r${i}`" :x="344 + ((i - 1) % 4) * 6.5" :y="26 + Math.floor((i - 1) / 4) * 6.5" width="4.5" height="4.5" rx="0.8" />
    </g>
    <circle cx="44" cy="32" r="34" fill="url(#ss-lamp)" opacity="0.8" />
    <circle cx="356" cy="32" r="34" fill="url(#ss-lamp)" opacity="0.8" />
  </svg>
</template>
