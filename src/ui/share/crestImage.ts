import { crestSvg } from '../art/crest'

/**
 * The club's crest as a decoded image, for drawing onto a canvas.
 *
 * A canvas cannot draw an SVG string, only an image, and an image decodes
 * asynchronously. So the share screen asks for it once, repaints when it
 * lands, and the share path reads the same decoded copy back out of the cache
 * — the file somebody receives has the crest the preview showed.
 */
type ClubLike = { id: string; name: string; shortName?: string; colors: { primary: string; secondary: string } }

const cache = new Map<string, HTMLImageElement>()

export function loadCrest(club: ClubLike): Promise<HTMLImageElement | null> {
  const hit = cache.get(club.id)
  if (hit) return Promise.resolve(hit)
  if (typeof Image === 'undefined') return Promise.resolve(null)
  const svg = crestSvg({
    id: club.id,
    name: club.shortName || club.name,
    primary: club.colors.primary,
    secondary: club.colors.secondary,
  })
  return new Promise((resolve) => {
    const image = new Image(380, 434)
    image.onload = () => {
      cache.set(club.id, image)
      resolve(image)
    }
    // A crest that will not decode is a card without a crest, not a failure.
    image.onerror = () => resolve(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** The crest if it has already been decoded, without waiting. */
export function cachedCrest(clubId: string | undefined): HTMLImageElement | null {
  return clubId ? cache.get(clubId) ?? null : null
}
