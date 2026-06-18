const CACHE_VERSION = "2026-06-18-v4";
const STATIC_CACHE = `perkup-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `perkup-runtime-${CACHE_VERSION}`;
const MAX_RUNTIME_ENTRIES = 80;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/favicon-32.png?v=20260618-white-bg",
  "/icons/favicon-192.png?v=20260618-white-bg",
  "/icons/favicon-512.png?v=20260618-white-bg",
  "/icons/maskable-512.png?v=20260618-logo",
];

const CACHEABLE_DESTINATIONS = new Set(["script", "style", "font", "image", "manifest"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("perkup-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!isSafeSameOriginGet(request)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});

function isSafeSameOriginGet(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  if (request.headers.has("authorization")) return false;
  if (url.pathname.startsWith("/api/")) return false;

  return true;
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put("/", response.clone());
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch (_error) {
    return (
      (await caches.match(request)) ||
      (await caches.match("/")) ||
      (await caches.match("/index.html")) ||
      (await caches.match("/offline.html"))
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
    await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
  }
  return response;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}
