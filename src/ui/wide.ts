import { onUnmounted, readonly, ref } from 'vue'

/**
 * Is there room for two things at once?
 *
 * The app is designed portrait-first and stays that way: a phone gets the
 * phone. Above this width there is room for a navigation rail *and* a list
 * *and* what the list is about, which is the arrangement every desktop client
 * of this shape has settled on, and the one the game needs to exist on a
 * monitor rather than as a phone-shaped strip down the middle of one.
 *
 * 900px, chosen from the parts rather than from a device list: the rail is
 * 208px, a list column reads well at about 320px, and a detail pane needs the
 * same 390px the phone gets. That comes to 918px with the gutters, so below
 * 900 the honest answer is that there is not room and the phone layout is
 * better than a cramped imitation of a desktop one.
 *
 * A media query rather than a width: `matchMedia` fires once when the answer
 * changes, where a resize listener fires continuously and re-renders the whole
 * shell on every pixel of a window drag.
 */
const WIDE_QUERY = '(min-width: 900px)'

export function useWide() {
  const wide = ref(matches())

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const query = window.matchMedia(WIDE_QUERY)
    const onChange = (event: MediaQueryListEvent) => { wide.value = event.matches }
    query.addEventListener('change', onChange)
    onUnmounted(() => query.removeEventListener('change', onChange))
  }

  return readonly(wide)
}

/**
 * The answer right now.
 *
 * Guarded because the same bundle is imported by tests running in Node, where
 * there is no window to ask and the answer is always the phone.
 */
function matches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(WIDE_QUERY).matches
}
