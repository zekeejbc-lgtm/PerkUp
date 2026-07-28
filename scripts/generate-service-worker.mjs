import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.join(process.cwd(), "dist");
const manifest = JSON.parse(await readFile(path.join(distDirectory, ".vite", "manifest.json"), "utf8"));
const selectedSources = [
  "src/main.tsx",
  "src/pages/LandingPage.tsx",
  "src/components/LandingStoreMap.tsx",
  "src/pages/StoresPage.tsx",
  "src/pages/StorePage.tsx",
  "src/pages/StoreProductsPage.tsx",
  "src/pages/StorePromotionsPage.tsx",
  "src/pages/MarketingPage.tsx",
  "src/pages/PrivacyPolicyPage.tsx",
  "src/pages/TermsOfServicePage.tsx",
  "src/pages/DataDeletionPage.tsx",
  "src/pages/StaffDashboard.tsx",
  "src/pages/staff/StaffScanner.tsx",
  "src/pages/staff/StaffPromotionScan.tsx",
];
const files = new Set([
  "/",
  "/index.html",
  "/manifest.json",
  "/offline.html",
  "/icons/favicon-32.png?v=20260625-brand",
  "/icons/favicon-192.png?v=20260625-brand",
  "/icons/favicon-512.png?v=20260625-brand",
  "/icons/maskable-512.png?v=20260625-brand",
]);
const visited = new Set();

const addEntry = (key) => {
  if (!key || visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) return;
  if (entry.file) files.add(`/${entry.file}`);
  for (const file of [...(entry.css || []), ...(entry.assets || [])]) files.add(`/${file}`);
  for (const dependency of entry.imports || []) addEntry(dependency);
};

for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry || selectedSources.includes(entry.src) || selectedSources.includes(key)) addEntry(key);
}

const precache = [...files].sort();
const revisionHash = createHash("sha256").update(JSON.stringify(precache));
for (const url of precache) {
  const relativePath = url.split("?")[0].replace(/^\//, "") || "index.html";
  try {
    revisionHash.update(await readFile(path.join(distDirectory, relativePath)));
  } catch {
    // Root and index.html intentionally refer to the same generated document.
  }
}
const revision = revisionHash.digest("hex").slice(0, 12);
const source = `const CACHE_VERSION = ${JSON.stringify(revision)};
const PRECACHE = \`perk-precache-\${CACHE_VERSION}\`;
const PAGE_CACHE = \`perk-pages-\${CACHE_VERSION}\`;
const RUNTIME_CACHE = \`perk-runtime-\${CACHE_VERSION}\`;
const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};
const MAX_RUNTIME_ENTRIES = 100;
const CACHEABLE_DESTINATIONS = new Set(["script", "style", "font", "image", "manifest"]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("perk-") && ![PRECACHE, PAGE_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isSafeGet(request)) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    const url = new URL(request.url);
    event.respondWith(url.pathname.startsWith("/assets/") ? cacheFirst(request) : staleWhileRevalidate(request));
  }
});

function isSafeGet(request) {
  if (request.method !== "GET" || request.headers.has("authorization")) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && !url.pathname.startsWith("/api/");
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("/index.html")) || (await caches.match("/offline.html"));
  }
}

async function cacheFirst(request) {
  return (await caches.match(request)) || staleWhileRevalidate(request);
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response?.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
      await trimCache(cache);
    }
    return response;
  }).catch(() => cached);
  return cached || update;
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_RUNTIME_ENTRIES) {
    await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key)));
  }
}
`;

await writeFile(path.join(distDirectory, "sw.js"), source);
console.log(`Generated service worker ${revision} with ${precache.length} precached resources.`);
