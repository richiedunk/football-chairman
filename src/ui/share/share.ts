import { canShareNatively, shareNatively } from '../../platform/native'
import { cardToBlob } from './render'
import type { ShareCard } from '../../engine/systems/shareCard'

/**
 * Getting a card out of the game.
 *
 * Four routes to the same place, tried in order, because no single one of them
 * works everywhere the game runs:
 *
 * 1. **The Web Share API with a file.** The only route that puts the picture
 *    itself into the share sheet. Works in Safari, in Chrome on Android and
 *    inside the iOS WebView, which is most of the audience.
 * 2. **The Web Share API with text and a link.** Where files are refused but
 *    sharing is not.
 * 3. **The platform's own sheet**, through `platform/native.ts`. The Android
 *    WebView has no `navigator.share` at all, so on a native build this is the
 *    only sheet there is. Text and a link only.
 *
 *    Asked for by capability rather than by operating system. Nothing in this
 *    file knows what Capacitor is or which platform it is running on, which is
 *    the rule the rest of the codebase already keeps and this file briefly
 *    did not.
 * 4. **Download the file and copy the link.** The desktop answer, and the
 *    final fallback everywhere.
 *
 * Every route reports which one it took, and the screen says so. A share sheet
 * that silently degrades into a download is the kind of thing that reads as
 * the feature being broken.
 *
 * Nothing here throws. A share that fails because the user dismissed the sheet
 * is the most common outcome of all and is not an error.
 */

export type ShareRoute = 'file' | 'link' | 'native' | 'download' | 'cancelled' | 'failed'

export interface ShareResult {
  route: ShareRoute
  /** What to tell the person, in one line. */
  message: string
}

export interface ShareRequest {
  card: ShareCard
  /** The text that travels with the picture. */
  text: string
  /** A challenge link, when the card carries one. */
  url?: string
  /** Suggested file name, without an extension. */
  filename: string
}

/**
 * Whether anything beyond a download is available.
 *
 * Asked by the screen so the button can say "Share" or "Save image" up front
 * rather than promising a sheet that will not open.
 */
export function canShare(): boolean {
  if (canShareNatively()) return true
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function shareCard(request: ShareRequest): Promise<ShareResult> {
  const blob = await cardToBlob(request.card, {
    codeLabel: request.card.challenge ? 'CHALLENGE' : undefined,
  })

  if (blob && (await tryShareFile(blob, request))) {
    return { route: 'file', message: 'Shared.' }
  }

  const textShare = await tryShareText(request)
  if (textShare) return textShare

  return downloadAndCopy(blob, request)
}

/** Route 1: the picture in the share sheet. */
async function tryShareFile(blob: Blob, request: ShareRequest): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  try {
    const file = new File([blob], `${request.filename}.png`, { type: 'image/png' })
    // `canShare` must be consulted first: sharing files is refused outright on
    // several platforms, and calling `share` anyway rejects in a way that is
    // indistinguishable from the user cancelling.
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return false
    }
    await navigator.share({
      files: [file],
      title: request.card.title,
      text: request.url ? `${request.text}\n${request.url}` : request.text,
    })
    return true
  } catch {
    return false
  }
}

/** Routes 2 and 3: text and a link, through whichever sheet exists. */
async function tryShareText(request: ShareRequest): Promise<ShareResult | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: request.card.title,
        text: request.text,
        url: request.url,
      })
      return { route: 'link', message: 'Shared without the image.' }
    } catch {
      // Falls through: in the Android WebView this rejects for want of support
      // rather than because the person changed their mind, and the platform
      // sheet below is the route that actually works there.
    }
  }

  const outcome = await shareNatively({
    title: request.card.title,
    text: request.text,
    url: request.url,
  })
  if (outcome === 'shared') return { route: 'native', message: 'Shared without the image.' }
  // Dismissed is an answer, not a failure. Saving a file to the device after
  // somebody has closed the share sheet is doing the thing they just declined.
  if (outcome === 'cancelled') return { route: 'cancelled', message: '' }

  return null
}

/** Route 4: save the picture, put the link on the clipboard. */
async function downloadAndCopy(
  blob: Blob | null,
  request: ShareRequest,
): Promise<ShareResult> {
  const copied = request.url ? await copyText(request.url) : false

  if (!blob) {
    return copied
      ? { route: 'link', message: 'Link copied.' }
      : { route: 'failed', message: 'Could not build the card.' }
  }

  try {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${request.filename}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoking immediately cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return {
      route: 'download',
      message: copied ? 'Image saved, link copied.' : 'Image saved.',
    }
  } catch {
    return { route: 'failed', message: 'Could not save the card.' }
  }
}

/**
 * Put text on the clipboard.
 *
 * The modern call needs a secure context and a permission that is not always
 * granted, so the deprecated one is kept as the fallback — this runs on a
 * static bundle that may well be opened over plain HTTP from a file server.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * Read text back off the clipboard, for pasting a challenge in.
 *
 * Returns null rather than throwing when the permission is refused, which on
 * Safari is the usual answer — the screen keeps its text field for exactly
 * that reason and this is only ever a shortcut.
 */
export async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText()
  } catch {
    // The permission was refused, or there is no clipboard to read.
  }
  return null
}

/** The public site, for every build that has no usable origin of its own. */
export const PUBLIC_ORIGIN = 'https://undisclosedfootball.com'

/** Addresses that only reach the machine already looking at them. */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/**
 * Where a challenge link should point.
 *
 * An address is only worth sending if somebody else could open it, and that
 * is a question about the address rather than about the platform.
 *
 * Two kinds fail it. A page loaded from disk has no origin worth sending —
 * Electron reports `file://`, other engines report the string "null", and
 * either would have been concatenated into a link reading
 * `file:///#/?challenge=…` without anything throwing, because both are
 * perfectly valid strings. And a page served from a loopback address is
 * reachable only by the person already looking at it, which covers
 * `https://localhost` in the phone builds and a developer's own preview
 * equally.
 *
 * Checking the address rather than asking which operating system this is
 * means a shell nobody has written yet gets the right answer for free.
 */
export function shareOrigin(): string {
  if (typeof window === 'undefined') return PUBLIC_ORIGIN
  return originFrom(window.location)
}

/**
 * The decision, without a browser.
 *
 * Split out so it can be tested. The whole point of this function is what it
 * does on the protocols the test runner does not have — `file:` and
 * `capacitor:` — so a version reachable only through a real `window` is a
 * version whose interesting cases are never checked.
 */
export function originFrom(
  location: { protocol: string; origin: string; pathname: string },
): string {
  const { protocol, origin, pathname } = location
  if (protocol !== 'http:' && protocol !== 'https:') return PUBLIC_ORIGIN
  if (LOOPBACK.test(origin)) return PUBLIC_ORIGIN
  return origin + pathname.replace(/index\.html$/, '')
}
