// public/service-worker.js
//
// Scope: installability only. Caches the static app shell (HTML/CSS/JS/
// manifest/icons) so the app loads fast and qualifies as installable to
// a homescreen. Deliberately does NOT cache or intercept /api/ requests
// -- there is no offline data handling here (Josh's explicit direction:
// "No offline data handling other than reunification"). If there's no
// network, the shell may still load from cache, but every API call will
// fail exactly like it would in a normal browser tab with no connection.
// This is not a bug to fix later; it's the intended scope.
const CACHE_NAME = 'fgsd-parking-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch API requests -- always go straight to the network, no
  // cache read, no cache write. This is the line that keeps this a
  // "shell only" service worker instead of accidentally growing into
  // offline data support.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Shell assets: cache-first, falling back to network (and caching
  // what we fetch) for anything not pre-cached at install time.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
