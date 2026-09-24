import { ref } from 'vue'

/**
 * Whether a match is being played out on screen right now.
 *
 * Set by the match report while it replays a result minute by minute, and
 * read by the advance button, whose second line otherwise names the result —
 * which would give away the score while the clock is still on 30 minutes.
 */
export const matchInPlay = ref(false)
