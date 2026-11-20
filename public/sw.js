/*
 * The Freery service worker.
 *
 * It only helps the counter open like an app on a staff phone. It never
 * caches an API response, because a stale passenger count is worse than no
 * passenger count at all. The counting itself always goes to the server.
 *
 * It never caches a page either. A page that is served from the cache would
 * be an old page, and an old page is an old console: the administrator would
 * be clicking buttons that no longer work the way they did yesterday. Pages
 * always come from the network, and the network has the new build.
 *
 * The version in the cache name is bumped whenever the app changes, so the
 * old files are dropped the next time the worker wakes up.
 */

const CACHE = "freery-shell-v2";

const SHELL = ["/manifest.webmanifest", "/logo/freery-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API. The numbers must always come from the server.
  if (url.pathname.startsWith("/api/")) return;

  // Static files: serve from the cache when they are there.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/logo/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: the network first, the cache only when the network is gone.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
    );
  }
});
