/* Service worker for the Becoming Engine schedule PWA.
 *
 * Strategy:
 *   - app shell (HTML/CSS/JS/manifest/icons): cache-first, so the app
 *     opens instantly + works offline after first visit.
 *   - schedule.json: network-first with cache fallback, so updates
 *     pushed to GitHub propagate on the next online launch but the
 *     last-good schedule still loads when offline.
 *
 * Bump CACHE_VERSION when shipping breaking changes to the app shell
 * — old caches get cleaned up on the next activate.
 */

const CACHE_VERSION = 'be-mobile-v4';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // schedule.json: always try the network first so GitHub-pushed
  // updates are picked up; fall back to the cache only if offline.
  if (url.pathname.endsWith('/schedule.json')) {
    event.respondWith(
      fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // App-shell files + everything else: cache-first, fall through to
  // network and cache the response for next time.
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((res) => {
        // Only cache successful, same-origin GETs.
        if (event.request.method === 'GET' &&
            res.ok &&
            url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
