<script setup lang="ts">
/**
 * A document, as the thing a department filed.
 *
 * The second register. A scout report was the only screen in the game that
 * read as authored — it has a letterhead, a date and a revision number, and
 * the revision is the part that changes what the reader understands rather
 * than how it looks. Everything else a department produces was rendered as
 * the club's own system: live, unattributed, and true as of now.
 *
 * Most of it is not true as of now. The data department runs every four weeks
 * and its list is as old as its last run. The squad list is lodged with the
 * league and cannot be changed until the window reopens. Both already behave
 * exactly like documents in the engine and neither looked like one, so the
 * reader had to be told in a paragraph what the form of the thing could have
 * said on its own.
 *
 * The idiom is structural rather than typographic, because the design system
 * has two faces and no third: a letterhead with a rule under it, a filing
 * stamp in mono, and the body below. `status` is the one thing a document can
 * say that a live panel cannot — that it is out of date, or that it is closed.
 */
defineProps<{
  /** Who filed it. An unfilled post still has a desk, so this is never blank. */
  author: string
  /** When, in game time. Mono, right of the letterhead. */
  filed: string
  /** The stamp: which revision, what run, what reference. */
  stamp?: string
  /** The one thing a live panel cannot say. Rendered beside the stamp. */
  status?: string
  /** Amber rather than grey, for a status the reader should act on. */
  statusWarn?: boolean
}>()
</script>

<template>
  <div class="doc">
    <div class="doc__head">
      <div class="doc__author">{{ author }}</div>
      <div class="doc__filed num">{{ filed }}</div>
    </div>

    <div v-if="stamp || status" class="doc__stamp num">
      <span v-if="stamp">{{ stamp }}</span>
      <span v-if="status" :class="statusWarn ? 'doc__status--warn' : 'doc__status'">
        <template v-if="stamp"> · </template>{{ status }}
      </span>
    </div>

    <slot />
  </div>
</template>
