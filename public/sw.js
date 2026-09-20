/*
 * Offline, without a build step.
 *
 * The game is a static site with no server behind it, so there is nothing to
 * be offline *from* — once the files are on the device it can be played on a
 * train. That only needs a cache, and the caching rule falls out of how the
 * build names things.
 *
 * Asset filenames carry a content hash, so a given URL's contents can never
 * change: cache-first, and a hit never needs revalidating. `index.html` is the
 * one file that changes in place and is what names the current chunks:
 * network-first, falling back to the cache only when the network is not there.
 * Getting those two the wrong way round is how a service worker pins somebody
 * to a build from six months ago.
 *
 * Deliberately not a precache manifest. Listing the build's files would mean
 * generating that list, which means a build plugin and a dependency; runtime
 * caching costs one cold visit instead and cannot go stale against the build.
 */

const CACHE = 'dof-v1'

self.addEventListener('install', (event) => {
  // Take over as soon as this version is ready rather than waiting for every
  // tab to close — a half-updated app is the thing to avoid, and there is only
  // ever one tab of a game like this.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Only this origin. A cross-origin request is somebody else's to answer.
  if (url.origin !== self.location.origin) return

  // Navigations: the network decides, the cache is the safety net. This is
  // what lets a deploy be picked up on the next launch.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        const cache = await caches.open(CACHE)
        cache.put(request, fresh.clone())
        return fresh
      } catch {
        return (await caches.match(request))
          ?? (await caches.match('./index.html'))
          ?? Response.error()
      }
    })())
    return
  }

  // Everything else is hashed and immutable: answer from the cache if it is
  // there, and put it there if it is not.
  event.respondWith((async () => {
    const hit = await caches.match(request)
    if (hit) return hit
    const fresh = await fetch(request)
    // Only keep what came back whole. A 404 or an opaque redirect cached here
    // would be served for the life of the cache.
    if (fresh.ok && fresh.type === 'basic') {
      const cache = await caches.open(CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  })())
})
